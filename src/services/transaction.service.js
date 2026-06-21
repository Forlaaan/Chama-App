const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const memberService = require('./member.service');
const notificationService = require('./notification.service');
const { auditSignature } = require('../utils/audit');
const { addMoney } = require('../utils/money');
const { AppError } = require('../utils/errors');

function now() {
  return new Date().toISOString();
}

function requireActor(authenticatedUser) {
  if (!authenticatedUser?.member?.id) {
    throw new AppError('Authenticated Firebase user is not linked to a Member record', 403);
  }
  return authenticatedUser.member;
}

function normalizeTransaction(row) {
  return row ? {
    id: row.id,
    memberId: row.memberId,
    groupId: row.groupId,
    loanId: row.loanId,
    amount: row.amount,
    transactionType: row.transactionType,
    description: row.description,
    createdBy: row.createdBy,
    timestamp: row.timestamp,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  } : null;
}

function createTransactionRecord({ member, actor, amount, transactionType, description, loanId = null }) {
  const createdAt = now();
  const transaction = {
    id: randomUUID(),
    memberId: member.id,
    groupId: member.groupId,
    loanId,
    amount: Number(amount).toFixed(2),
    transactionType,
    description: description || null,
    createdBy: actor.id,
    timestamp: createdAt,
    createdAt,
    updatedAt: createdAt
  };
  transaction.auditSignature = auditSignature(transaction);

  db.prepare(`
    INSERT INTO "Transaction" (
      id, memberId, groupId, loanId, amount, transactionType, description,
      createdBy, timestamp, createdAt, updatedAt, auditSignature
    ) VALUES (
      @id, @memberId, @groupId, @loanId, @amount, @transactionType, @description,
      @createdBy, @timestamp, @createdAt, @updatedAt, @auditSignature
    )
  `).run(transaction);

  return normalizeTransaction(transaction);
}

function updateMemberBalance(member, amount) {
  const updatedAt = now();
  const nextBalance = addMoney(member.accountBalance, amount);
  const auditPayload = { ...member, accountBalance: nextBalance, updatedAt, passwordHash: 'FIREBASE_AUTH_ONLY' };

  db.prepare(`
    UPDATE "Member"
    SET accountBalance = @accountBalance,
        updatedAt = @updatedAt,
        auditSignature = @auditSignature
    WHERE id = @id
  `).run({
    id: member.id,
    accountBalance: nextBalance,
    updatedAt,
    auditSignature: auditSignature(auditPayload)
  });

  return nextBalance;
}

function validateLoanForRepayment(memberId, loanId) {
  if (!loanId) return null;
  const loan = db.prepare('SELECT * FROM "Loan" WHERE id = ? AND memberId = ?').get(loanId, memberId);
  if (!loan) throw new AppError('Loan not found for this member', 404);
  return loan;
}

function updateLoanRepayment(loan, amount) {
  if (!loan) return null;

  const updatedAt = now();
  const amountPaid = addMoney(loan.amountPaid, amount);
  const status = Number(amountPaid) >= Number(loan.totalRepayable) ? 'PAID' : loan.status;
  const auditPayload = { ...loan, amountPaid, status, updatedAt };

  db.prepare(`
    UPDATE "Loan"
    SET amountPaid = @amountPaid,
        status = @status,
        updatedAt = @updatedAt,
        auditSignature = @auditSignature
    WHERE id = @id
  `).run({
    id: loan.id,
    amountPaid,
    status,
    updatedAt,
    auditSignature: auditSignature(auditPayload)
  });

  return { loanId: loan.id, amountPaid, status };
}

const recordContributionInDatabase = db.transaction(({ member, actor, amount, description }) => {
  const transaction = createTransactionRecord({
    member,
    actor,
    amount,
    transactionType: 'CONTRIBUTION',
    description: description || 'Member contribution payment'
  });
  const accountBalance = updateMemberBalance(member, amount);

  return { transaction, accountBalance };
});

async function recordContribution(input, authenticatedUser) {
  const actor = requireActor(authenticatedUser);
  const member = memberService.getMemberById(input.memberId);

  if (actor.groupId !== member.groupId) {
    throw new AppError('Treasurer/Admin cannot record transactions outside their group', 403);
  }

  const result = recordContributionInDatabase({
    member,
    actor,
    amount: input.amount,
    description: input.description
  });

  const notification = await notificationService.notifyContribution({
    member: { ...member, accountBalance: result.accountBalance },
    amount: input.amount,
    transactionId: result.transaction.id
  });

  return { ...result, notification };
}

const recordRepaymentInDatabase = db.transaction(({ member, actor, amount, description, loanId }) => {
  const loan = validateLoanForRepayment(member.id, loanId);
  const transaction = createTransactionRecord({
    member,
    actor,
    amount,
    loanId: loanId || null,
    transactionType: 'REPAYMENT',
    description: description || 'Loan repayment'
  });
  const loanUpdate = updateLoanRepayment(loan, amount);

  return { transaction, loanUpdate };
});

async function recordRepayment(input, authenticatedUser) {
  const actor = requireActor(authenticatedUser);
  const member = memberService.getMemberById(input.memberId);

  if (actor.groupId !== member.groupId) {
    throw new AppError('Treasurer/Admin cannot record transactions outside their group', 403);
  }

  return recordRepaymentInDatabase({
    member,
    actor,
    amount: input.amount,
    description: input.description,
    loanId: input.loanId
  });
}

function getAllTransactions() {
  return db.prepare(`
    SELECT * FROM "Transaction"
    ORDER BY timestamp DESC
  `).all().map(normalizeTransaction);
}

function getTransactionsForMember(memberId) {
  memberService.getMemberById(memberId);
  return db.prepare(`
    SELECT * FROM "Transaction"
    WHERE memberId = ?
    ORDER BY timestamp DESC
  `).all(memberId).map(normalizeTransaction);
}

module.exports = {
  recordContribution,
  recordRepayment,
  getAllTransactions,
  getTransactionsForMember
};

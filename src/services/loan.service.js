// src/services/loan.service.js
//
// Implements BR-004 (Loan Requests), BR-005 (Two-Stage Loan Approval),
// BR-006 (Interest Calculation — provisional formula), and
// BR-007 (Overdue Detection).
//
// Money: all arithmetic uses integer cents (toCents / fromCents from money.js)
// then serialised as "X.XX" strings — compatible with Dart Decimal.parse().
//
// Audit: HMAC-SHA-256 via auditSignature() — agreed replacement for SHA-256 hash.
//
// Two-stage approval flow:
//   PENDING → [Treasurer] → TREASURER_APPROVED → [Admin] → ACTIVE
// Special: Treasurer's own loan requests auto-set to TREASURER_APPROVED.

'use strict';

const { randomUUID } = require('crypto');
const { db }             = require('../config/database');
const memberService      = require('./member.service');
const notificationService = require('./notification.service');
const { auditSignature } = require('../utils/audit');
const { addMoney, subtractMoney, toCents, fromCents } = require('../utils/money');
const { AppError }       = require('../utils/errors');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * Require the actor to have a specific role.
 * Role checking is now also enforced at the middleware layer (requireRole),
 * but service-level checks provide defense-in-depth.
 */
function requireActorRole(actor, ...allowedRoles) {
  if (!allowedRoles.includes(actor.role)) {
    throw new AppError(
      `Role '${actor.role}' is not authorised for this loan operation. ` +
      `Requires: ${allowedRoles.join(' or ')}.`,
      403
    );
  }
}

function requireLinkedMember(authenticatedUser) {
  if (!authenticatedUser?.member?.id) {
    throw new AppError(
      'Authenticated Firebase user is not linked to a Member record',
      403
    );
  }
  return authenticatedUser.member;
}

/**
 * Normalise a raw SQLite row into a clean Loan object.
 * Strips internal auditSignature from API responses.
 */
function normalizeLoan(row) {
  if (!row) return null;
  return {
    id:              row.id,
    memberId:        row.memberId,
    groupId:         row.groupId,
    principalAmount: row.principalAmount,
    interestRate:    row.interestRate,
    totalRepayable:  row.totalRepayable,
    amountPaid:      row.amountPaid,
    dueDate:         row.dueDate,
    status:          row.status,
    approvedBy:      row.approvedBy,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
  };
}

// ─── Database helpers (synchronous better-sqlite3) ────────────────────────────

function getLoanRowById(loanId) {
  return db.prepare('SELECT * FROM "Loan" WHERE id = ?').get(loanId);
}

function insertLoan(loan) {
  db.prepare(`
    INSERT INTO "Loan" (
      id, memberId, groupId,
      principalAmount, interestRate, totalRepayable,
      amountPaid, dueDate, status, approvedBy,
      createdAt, updatedAt, auditSignature
    ) VALUES (
      @id, @memberId, @groupId,
      @principalAmount, @interestRate, @totalRepayable,
      @amountPaid, @dueDate, @status, @approvedBy,
      @createdAt, @updatedAt, @auditSignature
    )
  `).run(loan);
}

function updateLoanStatus(loanId, { status, approvedBy, amountPaid, updatedAt, auditSig }) {
  db.prepare(`
    UPDATE "Loan"
    SET status = @status,
        approvedBy = @approvedBy,
        amountPaid = @amountPaid,
        updatedAt  = @updatedAt,
        auditSignature = @auditSig
    WHERE id = @loanId
  `).run({ status, approvedBy, amountPaid, updatedAt, auditSig, loanId });
}

/**
 * Append-only transaction insert (mirrors partner's transaction.service.js pattern).
 * BR-002: Transactions must never be edited after creation — enforced by DB trigger.
 */
function insertTransaction({ memberId, groupId, loanId, amount, transactionType, description, actorId }) {
  const createdAt = now();
  const tx = {
    id: randomUUID(),
    memberId,
    groupId,
    loanId: loanId || null,
    amount: Number(amount).toFixed(2),
    transactionType,
    description: description || null,
    createdBy: actorId,
    timestamp: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  tx.auditSignature = auditSignature(tx);

  db.prepare(`
    INSERT INTO "Transaction" (
      id, memberId, groupId, loanId, amount, transactionType,
      description, createdBy, timestamp, createdAt, updatedAt, auditSignature
    ) VALUES (
      @id, @memberId, @groupId, @loanId, @amount, @transactionType,
      @description, @createdBy, @timestamp, @createdAt, @updatedAt, @auditSignature
    )
  `).run(tx);

  return tx;
}

// ─── BR-004: Loan Request ─────────────────────────────────────────────────────

/**
 * Submit a new loan application. Any authenticated member may call this.
 *
 * Status is initialised to PENDING (BR-004), UNLESS the requester is the
 * Treasurer — in which case the status is automatically set to
 * TREASURER_APPROVED (bypasses their own initial approval step).
 *
 * BR-006 provisional formula: totalRepayable = principal + (principal × interestRate)
 *
 * @param {object} body   Validated request body from loan.validator.js
 * @param {object} authUser  req.user (Firebase + linked Member)
 */
function requestLoan(body, authUser) {
  const actor = requireLinkedMember(authUser);

  // Enforce minimum contribution of 2000
  const contribRow = db.prepare(`
    SELECT SUM(amount) as total
    FROM "Transaction"
    WHERE memberId = ? AND transactionType = 'CONTRIBUTION'
  `).get(body.memberId);
  const totalContrib = contribRow.total || 0;
  
  if (totalContrib < 2000) {
    throw new AppError('A minimum total contribution of KSH 2,000 is required to request a loan.', 403);
  }

  // Parse amounts via integer cents to avoid floating-point drift
  const principalCents  = toCents(body.principalAmount);
  const rateAsDecimal   = Number(body.interestRate);   // e.g. 0.10 = 10 %

  if (!Number.isFinite(rateAsDecimal) || rateAsDecimal < 0) {
    throw new AppError('interestRate must be a non-negative number', 400);
  }

  // BR-006 placeholder: totalRepayable = principal + (principal × rate)
  // NOTE: This formula is provisional — stakeholder confirmation required (Blueprint §8).
  const interestCents    = Math.round(principalCents * rateAsDecimal);
  const totalRepayable   = fromCents(principalCents + interestCents);
  const principalAmount  = fromCents(principalCents);

  // Treasurer's own loan requests auto-advance to TREASURER_APPROVED
  const isTreasurerSelfRequest = actor.role === 'TREASURER';
  const initialStatus = isTreasurerSelfRequest ? 'TREASURER_APPROVED' : 'PENDING';

  const loanId    = randomUUID();
  const createdAt = now();

  const loan = {
    id:             loanId,
    memberId:       body.memberId,
    groupId:        body.groupId,
    principalAmount,
    interestRate:   Number(body.interestRate).toFixed(4),  // store as "0.1000"
    totalRepayable,
    amountPaid:     '0.00',
    dueDate:        body.dueDate,
    status:         initialStatus,
    approvedBy:     null,
    createdAt,
    updatedAt:      createdAt,
  };
  loan.auditSignature = auditSignature(loan);

  insertLoan(loan);

  const message = isTreasurerSelfRequest
    ? 'Loan request submitted by Treasurer. Status: TREASURER_APPROVED. Awaiting Admin final approval.'
    : 'Loan request submitted. Status: PENDING. Awaiting Treasurer initial approval (BR-004).';

  return {
    loan: normalizeLoan(loan),
    message,
  };
}

// ─── BR-005 Stage 1: Treasurer Initial Approval ──────────────────────────────

/**
 * Treasurer approves a PENDING loan → TREASURER_APPROVED.
 * No disbursement or SMS at this stage — the loan moves to Admin's queue.
 *
 * @param {object} params   Validated params { id }
 * @param {object} authUser req.user
 */
function treasurerApproveLoan(params, authUser) {
  const actor = requireLinkedMember(authUser);
  requireActorRole(actor, 'TREASURER');

  const loanRow = getLoanRowById(params.id);
  if (!loanRow) {
    throw new AppError(`Loan not found: ${params.id}`, 404);
  }
  if (loanRow.status !== 'PENDING') {
    throw new AppError(
      `Only PENDING loans can be treasurer-approved. Current status: ${loanRow.status}`,
      409
    );
  }

  const updatedAt = now();
  const updatedLoan = {
    ...loanRow,
    status:     'TREASURER_APPROVED',
    updatedAt,
  };
  updatedLoan.auditSignature = auditSignature(updatedLoan);

  updateLoanStatus(loanRow.id, {
    status:     'TREASURER_APPROVED',
    approvedBy: loanRow.approvedBy,
    amountPaid: loanRow.amountPaid,
    updatedAt,
    auditSig:   updatedLoan.auditSignature,
  });

  return {
    loan: normalizeLoan(updatedLoan),
    message: 'Loan treasurer-approved. Status: TREASURER_APPROVED. Awaiting Admin final approval.',
  };
}

// ─── BR-005 Stage 2: Admin Final Approval ─────────────────────────────────────

/**
 * Admin gives final approval to a TREASURER_APPROVED loan → ACTIVE.
 *
 * Steps (BR-005 Stage 2):
 *  1. Verify actor role (ADMIN).
 *  2. Validate loan exists and is TREASURER_APPROVED.
 *  3. Set status → ACTIVE, record approvedBy.
 *  4. Insert append-only LOAN_DISBURSEMENT transaction (BR-002).
 *  5. Update member accountBalance += principalAmount.
 *  6. Queue SMS notification via NotificationService.
 */
async function adminApproveLoan(params, authUser) {
  const actor = requireLinkedMember(authUser);
  requireActorRole(actor, 'ADMIN');

  const loanRow = getLoanRowById(params.id);
  if (!loanRow) {
    throw new AppError(`Loan not found: ${params.id}`, 404);
  }
  if (loanRow.status !== 'TREASURER_APPROVED') {
    throw new AppError(
      `Only TREASURER_APPROVED loans can receive admin final approval. Current status: ${loanRow.status}`,
      409
    );
  }

  const member  = memberService.getMemberById(loanRow.memberId);
  const updatedAt = now();

  // Wrap approval + tx insert + balance update in a single SQLite transaction
  const approve = db.transaction(() => {
    const updatedLoan = {
      ...loanRow,
      status:     'ACTIVE',
      approvedBy: actor.id,
      updatedAt,
    };
    updatedLoan.auditSignature = auditSignature(updatedLoan);

    updateLoanStatus(loanRow.id, {
      status:     'ACTIVE',
      approvedBy: actor.id,
      amountPaid: loanRow.amountPaid,
      updatedAt,
      auditSig:   updatedLoan.auditSignature,
    });

    // Append LOAN_DISBURSEMENT transaction (BR-002 — immutable)
    const disbursementTx = insertTransaction({
      memberId:        loanRow.memberId,
      groupId:         loanRow.groupId,
      loanId:          loanRow.id,
      amount:          loanRow.principalAmount,
      transactionType: 'LOAN_DISBURSEMENT',
      description:     `Loan disbursement for approved loan ${loanRow.id}`,
      actorId:         actor.id,
    });

    // Update member balance
    const newBalance = addMoney(member.accountBalance, loanRow.principalAmount);
    db.prepare(`
      UPDATE "Member"
      SET accountBalance = @balance, updatedAt = @updatedAt,
          auditSignature = @sig
      WHERE id = @id
    `).run({
      balance:   newBalance,
      updatedAt,
      sig:       auditSignature({ id: member.id, accountBalance: newBalance, updatedAt }),
      id:        member.id,
    });

    return { updatedLoan, disbursementTx, newBalance };
  });

  const { updatedLoan, disbursementTx, newBalance } = approve();

  // Queue SMS — outside the SQLite transaction (network call, can fail gracefully)
  const smsMessage =
    `Dear ${member.fullName}, your loan of KES ${loanRow.principalAmount} has been approved. ` +
    `Total repayable: KES ${loanRow.totalRepayable}. Due date: ${loanRow.dueDate}. ` +
    `Status: ACTIVE.`;

  let notificationResult = null;
  try {
    notificationResult = await notificationService.sendOrQueueSms({
      memberId:    member.id,
      phoneNumber: member.phoneNumber,
      type:        'LOAN_APPROVED',
      message:     smsMessage,
      actorId:     actor.id,
    });
  } catch (smsErr) {
    console.error('[loan.service] SMS queue error after approval:', smsErr.message);
    notificationResult = { status: 'SMS_QUEUE_FAILED', error: smsErr.message };
  }

  return {
    loan:           normalizeLoan(updatedLoan),
    disbursement:   { transactionId: disbursementTx.id, amount: disbursementTx.amount },
    accountBalance: newBalance,
    notification:   notificationResult,
  };
}

// ─── Loan Rejection ───────────────────────────────────────────────────────────

/**
 * Reject a loan.
 * - Treasurer can reject PENDING loans.
 * - Admin can reject TREASURER_APPROVED loans.
 *
 * @param {object} params   Validated params { id }
 * @param {object} body     Optional { reason }
 * @param {object} authUser req.user
 */
function rejectLoan(params, body, authUser) {
  const actor = requireLinkedMember(authUser);
  requireActorRole(actor, 'TREASURER', 'ADMIN');

  const loanRow = getLoanRowById(params.id);
  if (!loanRow) {
    throw new AppError(`Loan not found: ${params.id}`, 404);
  }

  // Treasurer can only reject PENDING loans
  if (actor.role === 'TREASURER' && loanRow.status !== 'PENDING') {
    throw new AppError(
      `Treasurer can only reject PENDING loans. Current status: ${loanRow.status}`,
      409
    );
  }

  // Admin can only reject TREASURER_APPROVED loans
  if (actor.role === 'ADMIN' && loanRow.status !== 'TREASURER_APPROVED') {
    throw new AppError(
      `Admin can only reject TREASURER_APPROVED loans. Current status: ${loanRow.status}`,
      409
    );
  }

  const updatedAt = now();
  const updatedLoan = {
    ...loanRow,
    status:     'REJECTED',
    updatedAt,
  };
  updatedLoan.auditSignature = auditSignature(updatedLoan);

  updateLoanStatus(loanRow.id, {
    status:     'REJECTED',
    approvedBy: loanRow.approvedBy,
    amountPaid: loanRow.amountPaid,
    updatedAt,
    auditSig:   updatedLoan.auditSignature,
  });

  const reason = body?.reason || 'No reason provided';

  return {
    loan: normalizeLoan(updatedLoan),
    message: `Loan rejected by ${actor.role}. Reason: ${reason}`,
  };
}

// ─── Loan Repayment ───────────────────────────────────────────────────────────

/**
 * Record a loan repayment by TREASURER.
 *
 * Steps:
 *  1. Verify actor role (TREASURER).
 *  2. Validate loan exists and is ACTIVE (cannot repay PENDING / PAID / REJECTED).
 *  3. Validate repayment amount does not exceed outstanding balance.
 *  4. Insert append-only LOAN_REPAYMENT transaction.
 *  5. Increment amountPaid. If amountPaid >= totalRepayable → status = PAID.
 *  6. Deduct amount from member accountBalance.
 */
function recordRepayment(params, body, authUser) {
  const actor = requireLinkedMember(authUser);
  requireActorRole(actor, 'TREASURER');

  const loanRow = getLoanRowById(params.id);
  if (!loanRow) {
    throw new AppError(`Loan not found: ${params.id}`, 404);
  }
  if (loanRow.status !== 'ACTIVE' && loanRow.status !== 'OVERDUE') {
    throw new AppError(
      `Only ACTIVE or OVERDUE loans accept repayments. Current status: ${loanRow.status}`,
      409
    );
  }

  const repaymentCents   = toCents(body.amount);
  const paidCents        = toCents(loanRow.amountPaid);
  const repayableCents   = toCents(loanRow.totalRepayable);
  const outstandingCents = repayableCents - paidCents;

  if (repaymentCents > outstandingCents) {
    throw new AppError(
      `Repayment of ${body.amount} exceeds outstanding balance of ` +
      `${fromCents(outstandingCents)}. Use an adjustment if overpayment is intended.`,
      400
    );
  }

  const member    = memberService.getMemberById(loanRow.memberId);
  const updatedAt = now();
  const newAmountPaidCents = paidCents + repaymentCents;
  const newAmountPaid      = fromCents(newAmountPaidCents);
  const newStatus          = newAmountPaidCents >= repayableCents ? 'PAID' : loanRow.status;

  const repay = db.transaction(() => {
    // 4. Append LOAN_REPAYMENT transaction
    const repayTx = insertTransaction({
      memberId:        loanRow.memberId,
      groupId:         loanRow.groupId,
      loanId:          loanRow.id,
      amount:          body.amount,
      transactionType: 'LOAN_REPAYMENT',
      description:     body.description || `Repayment toward loan ${loanRow.id}`,
      actorId:         actor.id,
    });

    // 5. Update amountPaid + possibly status
    const updatedLoan = { ...loanRow, amountPaid: newAmountPaid, status: newStatus, updatedAt };
    updatedLoan.auditSignature = auditSignature(updatedLoan);

    updateLoanStatus(loanRow.id, {
      status:     newStatus,
      approvedBy: loanRow.approvedBy,
      amountPaid: newAmountPaid,
      updatedAt,
      auditSig:   updatedLoan.auditSignature,
    });

    // 6. Deduct from member balance
    const newBalance = subtractMoney(member.accountBalance, body.amount);
    db.prepare(`
      UPDATE "Member"
      SET accountBalance = @balance, updatedAt = @updatedAt, auditSignature = @sig
      WHERE id = @id
    `).run({
      balance:   newBalance,
      updatedAt,
      sig:       auditSignature({ id: member.id, accountBalance: newBalance, updatedAt }),
      id:        member.id,
    });

    return { repayTx, newBalance, updatedLoan };
  });

  const { repayTx, newBalance, updatedLoan } = repay();

  return {
    repayment: {
      transactionId: repayTx.id,
      amount:        repayTx.amount,
      transactionType: repayTx.transactionType,
    },
    loan:           normalizeLoan(updatedLoan),
    accountBalance: newBalance,
    message:        newStatus === 'PAID'
      ? `Loan fully repaid. Status updated to PAID.`
      : `Repayment recorded. Outstanding: KES ${fromCents(repayableCents - newAmountPaidCents)}.`,
  };
}

// ─── BR-007: Overdue Detection ────────────────────────────────────────────────

/**
 * Return all ACTIVE or OVERDUE loans where dueDate < today.
 * Also marks any ACTIVE loans that have crossed the deadline as OVERDUE
 * (state transition only — penalty calculation requires stakeholder confirmation,
 * Blueprint §8 open question #2).
 *
 * @param {object} query  Validated query params { groupId? }
 * @param {object} authUser  req.user
 */
function getOverdueLoans(query, authUser) {
  requireLinkedMember(authUser);

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Fetch candidates
  let rows;
  if (query.groupId) {
    rows = db.prepare(`
      SELECT * FROM "Loan"
      WHERE groupId = ?
        AND status IN ('ACTIVE', 'OVERDUE')
        AND dueDate < ?
        AND amountPaid < totalRepayable
    `).all(query.groupId, today);
  } else {
    rows = db.prepare(`
      SELECT * FROM "Loan"
      WHERE status IN ('ACTIVE', 'OVERDUE')
        AND dueDate < ?
        AND amountPaid < totalRepayable
    `).all(today);
  }

  // Transition any ACTIVE loans past deadline → OVERDUE (in-place, no transaction needed)
  const transitionedIds = [];
  for (const row of rows) {
    if (row.status === 'ACTIVE') {
      const updatedAt = now();
      const updated = { ...row, status: 'OVERDUE', updatedAt };
      updated.auditSignature = auditSignature(updated);
      updateLoanStatus(row.id, {
        status:     'OVERDUE',
        approvedBy: row.approvedBy,
        amountPaid: row.amountPaid,
        updatedAt,
        auditSig:   updated.auditSignature,
      });
      row.status    = 'OVERDUE';
      row.updatedAt = updatedAt;
      transitionedIds.push(row.id);
    }
  }

  return {
    asOf:              today,
    overdueCount:      rows.length,
    newlyMarkedOverdue: transitionedIds,
    // NOTE: BR-008 Penalty Application requires stakeholder-confirmed penalty formula.
    // Penalty calculation is NOT executed here. Requires stakeholder confirmation (Blueprint §8).
    penaltyNote:
      'Penalty application (BR-008) requires a group-level configurable penalty amount. ' +
      'This is an open stakeholder question — not yet implemented.',
    loans: rows.map(normalizeLoan),
  };
}

// ─── GET single loan ──────────────────────────────────────────────────────────

function getLoanById(params, authUser) {
  requireLinkedMember(authUser);
  const row = getLoanRowById(params.id);
  if (!row) throw new AppError(`Loan not found: ${params.id}`, 404);
  return normalizeLoan(row);
}

// ─── BR-005: Loan Rejection ───────────────────────────────────────────────────

async function rejectLoan(params, body, authUser) {
  const actor = requireLinkedMember(authUser);
  requireActorRole(actor, ['TREASURER', 'ADMIN']);

  const loanRow = getLoanRowById(params.id);
  if (!loanRow) throw new AppError(`Loan not found: ${params.id}`, 404);

  if (loanRow.status !== 'PENDING' && loanRow.status !== 'TREASURER_APPROVED') {
    throw new AppError(`Cannot reject a loan with status: ${loanRow.status}`, 409);
  }

  const member = memberService.getMemberById(loanRow.memberId);
  const updatedAt = now();

  const updatedLoan = {
    ...loanRow,
    status: 'REJECTED',
    approvedBy: actor.id,
    updatedAt,
  };
  updatedLoan.auditSignature = auditSignature(updatedLoan);

  updateLoanStatus(loanRow.id, {
    status: 'REJECTED',
    approvedBy: actor.id,
    amountPaid: loanRow.amountPaid,
    updatedAt,
    auditSig: updatedLoan.auditSignature,
  });

  const smsMessage =
    `Dear ${member.fullName}, your loan application of KES ${loanRow.principalAmount} ` +
    `has been rejected. Reason: ${body.reason || 'Not specified'}.`;

  try {
    await notificationService.sendOrQueueSms({
      memberId: member.id,
      phoneNumber: member.phoneNumber,
      type: 'LOAN_REJECTED',
      message: smsMessage,
      actorId: actor.id,
    });
  } catch (err) {
    console.error('Failed to send rejection SMS:', err.message);
  }

  return {
    loan: normalizeLoan(updatedLoan),
    message: 'Loan rejected successfully.',
  };
}

// ─── GET loans for a member ───────────────────────────────────────────────────

function getLoansByMember(memberId, authUser) {
  requireLinkedMember(authUser);
  const rows = db.prepare('SELECT * FROM "Loan" WHERE memberId = ? ORDER BY createdAt DESC').all(memberId);
  return rows.map(normalizeLoan);
}

// ─── GET all loans for a group ────────────────────────────────────────────────
function getLoansByGroup(groupId, authUser) {
  requireLinkedMember(authUser);
  const rows = db.prepare('SELECT * FROM "Loan" WHERE groupId = ? ORDER BY createdAt DESC').all(groupId);
  return rows.map(normalizeLoan);
}

module.exports = {
  requestLoan,
  treasurerApproveLoan,
  adminApproveLoan,
  rejectLoan,
  recordRepayment,
  getOverdueLoans,
  getLoanById,
  getLoansByMember,
  getLoansByGroup,
};

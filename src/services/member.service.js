const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { auditSignature } = require('../utils/audit');
const { AppError } = require('../utils/errors');

function now() {
  return new Date().toISOString();
}

function normalizeMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.groupId,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    email: row.email,
    role: row.role,
    accountBalance: row.accountBalance,
    deviceToken: row.deviceToken,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getMemberById(id) {
  const row = db.prepare('SELECT * FROM "Member" WHERE id = ?').get(id);
  const member = normalizeMember(row);
  if (!member) throw new AppError('Member not found', 404);
  return member;
}

function getAllMembers() {
  return db.prepare('SELECT * FROM "Member" ORDER BY createdAt DESC').all().map(normalizeMember);
}

function createMember(input) {
  // Enforce one ADMIN and one TREASURER per group (Blueprint §2 Role Constraints)
  if (input.role === 'ADMIN' || input.role === 'TREASURER') {
    const existing = db.prepare(
      'SELECT id, fullName FROM "Member" WHERE groupId = ? AND role = ?'
    ).get(input.groupId, input.role);
    if (existing) {
      throw new AppError(
        `Group already has a ${input.role}: ${existing.fullName}. A chama can only have one ${input.role}.`,
        409
      );
    }
  }

  const createdAt = now();
  const member = {
    id: randomUUID(),
    groupId: input.groupId,
    fullName: input.fullName,
    phoneNumber: input.phoneNumber,
    email: input.email || null,
    passwordHash: 'FIREBASE_AUTH_ONLY',
    role: input.role || 'MEMBER',
    accountBalance: Number(input.accountBalance || 0).toFixed(2),
    deviceToken: input.deviceToken || null,
    createdAt,
    updatedAt: createdAt
  };
  member.auditSignature = auditSignature(member);

  db.prepare(`
    INSERT INTO "Member" (
      id, groupId, fullName, phoneNumber, email, passwordHash, role,
      accountBalance, deviceToken, createdAt, updatedAt, auditSignature
    ) VALUES (
      @id, @groupId, @fullName, @phoneNumber, @email, @passwordHash, @role,
      @accountBalance, @deviceToken, @createdAt, @updatedAt, @auditSignature
    )
  `).run(member);

  return normalizeMember(member);
}

function updateMember(id, input) {
  const existing = getMemberById(id);
  const updated = {
    ...existing,
    ...input,
    updatedAt: now()
  };
  const auditPayload = { ...updated, passwordHash: 'FIREBASE_AUTH_ONLY' };
  const signature = auditSignature(auditPayload);

  db.prepare(`
    UPDATE "Member"
    SET fullName = @fullName,
        phoneNumber = @phoneNumber,
        email = @email,
        role = @role,
        deviceToken = @deviceToken,
        updatedAt = @updatedAt,
        auditSignature = @auditSignature
    WHERE id = @id
  `).run({ ...updated, auditSignature: signature });

  return getMemberById(id);
}

function getMemberBalance(id) {
  const member = getMemberById(id);
  return { memberId: member.id, fullName: member.fullName, accountBalance: member.accountBalance };
}

function getContributionHistory(memberId) {
  getMemberById(memberId);
  return db.prepare(`
    SELECT id, memberId, groupId, amount, transactionType, description, createdBy, timestamp, createdAt
    FROM "Transaction"
    WHERE memberId = ? AND transactionType = 'CONTRIBUTION'
    ORDER BY timestamp DESC
  `).all(memberId);
}

async function findMemberForFirebaseUser(decodedToken) {
  const row = db.prepare(`
    SELECT * FROM "Member"
    WHERE id = @uid OR email = @email OR phoneNumber = @phone
    LIMIT 1
  `).get({
    uid: decodedToken.uid,
    email: decodedToken.email || '',
    phone: decodedToken.phone_number || ''
  });

  return normalizeMember(row);
}

module.exports = {
  createMember,
  getMemberById,
  getAllMembers,
  updateMember,
  getMemberBalance,
  getContributionHistory,
  findMemberForFirebaseUser
};

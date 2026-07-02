const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { AppError } = require('../utils/errors');
const notificationService = require('./notification.service');
const memberService = require('./member.service');

function now() {
  return new Date().toISOString();
}

/**
 * Applies a penalty to a member manually or via sweep.
 */
function applyPenalty(input) {
  const penaltyId = randomUUID();
  const appliedAt = now();
  
  // Verify member exists
  const member = memberService.getMemberById(input.memberId);
  
  db.prepare(`
    INSERT INTO "Penalty" (id, memberId, amount, reason, appliedAt, settled, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    penaltyId,
    input.memberId,
    input.amount,
    input.reason,
    appliedAt,
    appliedAt,
    appliedAt,
    'sig_penalty'
  );

  // Send SMS Notification
  try {
    notificationService.sendOrQueueSms({
      memberId: member.id,
      phoneNumber: member.phoneNumber,
      type: 'PENALTY',
      message: `You have been penalized KSH ${input.amount}. Reason: ${input.reason}. Please pay immediately.`
    });
  } catch (err) {
    console.error('Failed to queue penalty notification:', err.message);
  }

  return getPenaltyById(penaltyId);
}

function getPenaltyById(id) {
  const row = db.prepare('SELECT * FROM "Penalty" WHERE id = ?').get(id);
  if (!row) throw new AppError('Penalty not found', 404);
  return row;
}

function getPenaltiesByMember(memberId) {
  return db.prepare('SELECT * FROM "Penalty" WHERE memberId = ? ORDER BY appliedAt DESC').all(memberId);
}

function settlePenalty(id) {
  const penalty = getPenaltyById(id);
  if (penalty.settled === 1) throw new AppError('Penalty is already settled', 400);

  db.prepare('UPDATE "Penalty" SET settled = 1, updatedAt = ? WHERE id = ?').run(now(), id);
  return getPenaltyById(id);
}

module.exports = {
  applyPenalty,
  getPenaltyById,
  getPenaltiesByMember,
  settlePenalty
};

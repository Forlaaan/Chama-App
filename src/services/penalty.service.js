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
    INSERT INTO "Penalty" (id, memberId, groupId, amount, reason, cycle, appliedAt, settled, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    penaltyId,
    input.memberId,
    member.groupId,
    input.amount,
    input.reason,
    input.cycle || null,
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

function sweepPenalties(groupId) {
  const group = db.prepare('SELECT * FROM "Group" WHERE id = ?').get(groupId);
  if (!group) throw new AppError('Group not found', 404);
  
  const percentage = parseFloat(group.penaltyPercentage || '0');
  if (percentage <= 0) return { count: 0, message: 'Penalty percentage is 0, no penalties applied.' };
  
  const contributionAmount = parseFloat(group.contributionAmount || '0');
  const penaltyAmount = (contributionAmount * (percentage / 100)).toFixed(2);
  
  // A naive implementation for V3: check who has not contributed in the current calendar month
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const cycleName = currentMonth;
  
  const members = db.prepare('SELECT id FROM "Member" WHERE groupId = ?').all(groupId);
  let appliedCount = 0;
  
  for (const m of members) {
    // Has the member contributed this month?
    const hasContributed = db.prepare(`
      SELECT 1 FROM "Transaction" 
      WHERE memberId = ? AND transactionType = 'CONTRIBUTION' AND timestamp LIKE ?
    `).get(m.id, currentMonth + '%');
    
    if (!hasContributed) {
      // Check if they already have a penalty for this cycle
      const hasPenalty = db.prepare(`
        SELECT 1 FROM "Penalty" WHERE memberId = ? AND cycle = ?
      `).get(m.id, cycleName);
      
      if (!hasPenalty) {
        applyPenalty({
          memberId: m.id,
          amount: penaltyAmount,
          reason: `Late contribution for cycle ${cycleName}`,
          cycle: cycleName
        });
        appliedCount++;
      }
    }
  }
  
  return { count: appliedCount, message: `Applied ${appliedCount} penalties for cycle ${cycleName}.` };
}

module.exports = {
  applyPenalty,
  getPenaltyById,
  getPenaltiesByMember,
  settlePenalty,
  sweepPenalties
};

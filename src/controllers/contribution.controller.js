const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { AppError } = require('../utils/errors');
const transactionService = require('../services/transaction.service');

async function submitContributionRequest(req, res) {
  const { amount, cycle } = req.body;
  const member = req.user.member;
  
  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    throw new AppError('Valid amount is required', 400);
  }
  
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO "ContributionRequest" (id, memberId, groupId, amount, cycle, status, createdAt)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(id, member.id, member.groupId, Number(amount).toFixed(2), cycle || null, createdAt);
  
  res.status(201).json({ success: true, message: 'Contribution request submitted successfully', id });
}

async function getPendingContributions(req, res) {
  const groupId = req.user.member.groupId;
  
  const pending = db.prepare(`
    SELECT r.*, m.fullName as memberName 
    FROM "ContributionRequest" r
    JOIN "Member" m ON r.memberId = m.id
    WHERE r.groupId = ? AND r.status = 'PENDING'
    ORDER BY r.createdAt ASC
  `).all(groupId);
  
  res.json({ success: true, data: pending });
}

async function confirmContribution(req, res) {
  const { id } = req.params;
  const actor = req.user;
  
  const request = db.prepare('SELECT * FROM "ContributionRequest" WHERE id = ?').get(id);
  if (!request) throw new AppError('Contribution request not found', 404);
  if (request.status !== 'PENDING') throw new AppError('Request is not pending', 400);
  if (request.groupId !== actor.member.groupId) throw new AppError('Cannot approve request for another group', 403);
  
  // Use a database transaction to update request and record transaction
  const result = db.transaction(() => {
    const confirmedAt = new Date().toISOString();
    
    db.prepare(`
      UPDATE "ContributionRequest" 
      SET status = 'APPROVED', confirmedAt = ?, confirmedBy = ? 
      WHERE id = ?
    `).run(confirmedAt, actor.member.id, id);
    
    // Call transaction service logic here? 
    // We shouldn't call an async service layer inside db.transaction if the service uses its own transactions, 
    // but recordContribution in service is async. 
    // However, recordContributionInDatabase is internal. 
    // Let's just update the request, then we can await transactionService.recordContribution.
    
    return { success: true };
  })();
  
  // Actually, wait. recordContribution handles the DB transaction internally. Let's do it sequentially.
  
  const txResult = await transactionService.recordContribution({
    memberId: request.memberId,
    amount: request.amount,
    description: `Approved contribution request for ${request.cycle || 'cycle'}`
  }, actor);
  
  res.json({ success: true, message: 'Contribution confirmed', transaction: txResult });
}

async function rejectContribution(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const actor = req.user;
  
  const request = db.prepare('SELECT * FROM "ContributionRequest" WHERE id = ?').get(id);
  if (!request) throw new AppError('Contribution request not found', 404);
  if (request.status !== 'PENDING') throw new AppError('Request is not pending', 400);
  if (request.groupId !== actor.member.groupId) throw new AppError('Cannot reject request for another group', 403);
  
  db.prepare(`
    UPDATE "ContributionRequest" 
    SET status = 'REJECTED', rejectionReason = ?, confirmedAt = ?, confirmedBy = ? 
    WHERE id = ?
  `).run(reason || 'No reason provided', new Date().toISOString(), actor.member.id, id);
  
  res.json({ success: true, message: 'Contribution request rejected' });
}

module.exports = {
  submitContributionRequest,
  getPendingContributions,
  confirmContribution,
  rejectContribution
};

const memberService = require('../services/member.service');

async function createMember(req, res) {
  const member = memberService.createMember(req.validated.body);
  res.status(201).json({ success: true, message: 'Member created', data: member });
}

async function getAllMembers(req, res) {
  const member = req.user.member;
  let members;
  if (member.role === 'SUPERADMIN') {
    members = memberService.getAllMembers();
  } else {
    members = memberService.getMembersByGroup(member.groupId);
  }
  res.json({ success: true, data: members });
}

async function getMemberById(req, res) {
  const member = memberService.getMemberById(req.validated.params.id);
  res.json({ success: true, data: member });
}

async function updateMember(req, res) {
  const member = memberService.updateMember(req.validated.params.id, req.validated.body);
  res.json({ success: true, message: 'Member updated', data: member });
}

async function getMemberBalance(req, res) {
  const balance = memberService.getMemberBalance(req.validated.params.id);
  res.json({ success: true, data: balance });
}

async function getContributionHistory(req, res) {
  const history = memberService.getContributionHistory(req.validated.params.id);
  res.json({ success: true, data: history });
}

async function removeFromChama(req, res) {
  const { id } = req.params;
  const { db } = require('../config/database');
  const { AppError } = require('../utils/errors');

  const member = db.prepare('SELECT * FROM "Member" WHERE id = ?').get(id);
  if (!member) throw new AppError('Member not found', 404);

  // Soft delete: detach from group
  db.prepare('UPDATE "Member" SET groupId = NULL, updatedAt = ? WHERE id = ?').run(
    new Date().toISOString(), id
  );

  res.json({ success: true, message: 'Member removed from Chama' });
}

module.exports = {
  createMember,
  getAllMembers,
  getMemberById,
  updateMember,
  getMemberBalance,
  getContributionHistory,
  removeFromChama
};

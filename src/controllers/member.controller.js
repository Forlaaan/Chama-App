const memberService = require('../services/member.service');

async function createMember(req, res) {
  const member = memberService.createMember(req.validated.body);
  res.status(201).json({ success: true, message: 'Member created', data: member });
}

async function getAllMembers(_req, res) {
  const members = memberService.getAllMembers();
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

module.exports = {
  createMember,
  getAllMembers,
  getMemberById,
  updateMember,
  getMemberBalance,
  getContributionHistory
};

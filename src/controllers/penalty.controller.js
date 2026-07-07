const penaltyService = require('../services/penalty.service');

async function applyPenalty(req, res) {
  const { memberId, amount, reason } = req.body;
  const penalty = await penaltyService.applyPenalty({ memberId, amount, reason });
  res.status(201).json({ success: true, data: penalty });
}

async function settlePenalty(req, res) {
  const { id } = req.params;
  const penalty = await penaltyService.settlePenalty(id);
  res.json({ success: true, data: penalty });
}

async function getMemberPenalties(req, res) {
  const { memberId } = req.params;
  const penalties = penaltyService.getPenaltiesByMember(memberId);
  res.json({ success: true, data: penalties });
}

async function sweepPenalties(req, res) {
  const groupId = req.user.member.groupId;
  const result = penaltyService.sweepPenalties(groupId);
  res.json({ success: true, data: result });
}

async function getPendingPenalties(req, res) {
  const penalties = penaltyService.getPendingPenalties();
  res.json({ success: true, data: penalties });
}

async function approvePenalty(req, res) {
  const { id } = req.params;
  const adminId = req.user.member.id;
  const penalty = penaltyService.approvePenalty(id, adminId);
  res.json({ success: true, data: penalty });
}

async function rejectPenalty(req, res) {
  const { id } = req.params;
  const adminId = req.user.member.id;
  const penalty = penaltyService.rejectPenalty(id, adminId);
  res.json({ success: true, data: penalty });
}

module.exports = {
  applyPenalty,
  settlePenalty,
  getMemberPenalties,
  getPendingPenalties,
  approvePenalty,
  rejectPenalty,
  sweepPenalties
};

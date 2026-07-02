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

module.exports = {
  applyPenalty,
  settlePenalty,
  getMemberPenalties
};

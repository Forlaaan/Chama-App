const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/jwtAuth');
const { requireRole } = require('../middleware/requireRole');
const { asyncHandler } = require('../utils/asyncHandler');
const reportsController = require('../controllers/reports.controller');

router.use(verifyToken);
// Any authenticated member of a group can view reports
router.use(requireRole('MEMBER', 'TREASURER', 'ADMIN'));

router.get('/summary', asyncHandler(reportsController.getGroupSummary));
router.get('/matrix', asyncHandler(reportsController.getContributionMatrix));
router.get('/loanbook', asyncHandler(reportsController.getLoanBook));
router.get('/statement/:memberId?', asyncHandler(reportsController.getMemberStatement));

module.exports = router;

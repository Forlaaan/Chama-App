const express = require('express');
const router = express.Router();

const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { requireRole } = require('../middleware/requireRole');
const reportsController = require('../controllers/reports.controller');

router.use(verifyFirebaseToken);
// Any authenticated member of a group can view reports
router.use(requireRole('MEMBER', 'TREASURER', 'ADMIN'));

router.get('/summary', reportsController.getGroupSummary);
router.get('/matrix', reportsController.getContributionMatrix);
router.get('/loanbook', reportsController.getLoanBook);
router.get('/statement/:memberId?', reportsController.getMemberStatement);

module.exports = router;

const express = require('express');
const router = express.Router();

const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { requireRole } = require('../middleware/requireRole');
const contributionController = require('../controllers/contribution.controller');

router.use(verifyFirebaseToken);

// Member routes
router.post('/request', requireRole('MEMBER', 'TREASURER', 'ADMIN'), contributionController.submitContributionRequest);

// Treasurer/Admin routes
router.get('/pending', requireRole('TREASURER', 'ADMIN'), contributionController.getPendingContributions);
router.patch('/:id/confirm', requireRole('TREASURER', 'ADMIN'), contributionController.confirmContribution);
router.patch('/:id/reject', requireRole('TREASURER', 'ADMIN'), contributionController.rejectContribution);

module.exports = router;

const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/jwtAuth');
const { requireRole } = require('../middleware/requireRole');
const { asyncHandler } = require('../utils/asyncHandler');
const contributionController = require('../controllers/contribution.controller');

router.use(verifyToken);

// Member routes
router.post('/request', requireRole('MEMBER', 'TREASURER', 'ADMIN'), asyncHandler(contributionController.submitContributionRequest));

// Treasurer/Admin routes
router.get('/pending', requireRole('TREASURER', 'ADMIN'), asyncHandler(contributionController.getPendingContributions));
router.patch('/:id/confirm', requireRole('TREASURER', 'ADMIN'), asyncHandler(contributionController.confirmContribution));
router.patch('/:id/reject', requireRole('TREASURER', 'ADMIN'), asyncHandler(contributionController.rejectContribution));

module.exports = router;

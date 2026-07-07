const express = require('express');
const router = express.Router();
const penaltyController = require('../controllers/penalty.controller');
const { verifyToken } = require('../middleware/jwtAuth');
const { requireRole } = require('../middleware/requireRole');
const { asyncHandler } = require('../utils/asyncHandler');

// Allow only TREASURER and ADMIN to apply or settle penalties
router.post('/apply', verifyToken, requireRole('TREASURER', 'ADMIN'), asyncHandler(penaltyController.applyPenalty));
router.post('/sweep', verifyToken, requireRole('TREASURER', 'ADMIN'), asyncHandler(penaltyController.sweepPenalties));
router.patch('/:id/settle', verifyToken, requireRole('TREASURER', 'ADMIN'), asyncHandler(penaltyController.settlePenalty));

// Admin approval routes
router.get('/pending', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), asyncHandler(penaltyController.getPendingPenalties));
router.patch('/:id/approve', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), asyncHandler(penaltyController.approvePenalty));
router.patch('/:id/reject', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), asyncHandler(penaltyController.rejectPenalty));

// Anyone can view a member's penalties
router.get('/member/:memberId', verifyToken, asyncHandler(penaltyController.getMemberPenalties));

module.exports = router;

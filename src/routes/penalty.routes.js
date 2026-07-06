const express = require('express');
const router = express.Router();
const penaltyController = require('../controllers/penalty.controller');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { requireRole } = require('../middleware/requireRole');
const { asyncHandler } = require('../utils/asyncHandler');

// Allow only TREASURER and ADMIN to apply or settle penalties
router.post('/apply', verifyFirebaseToken, requireRole('TREASURER', 'ADMIN'), asyncHandler(penaltyController.applyPenalty));
router.post('/sweep', verifyFirebaseToken, requireRole('TREASURER', 'ADMIN'), asyncHandler(penaltyController.sweepPenalties));
router.patch('/:id/settle', verifyFirebaseToken, requireRole('TREASURER', 'ADMIN'), asyncHandler(penaltyController.settlePenalty));

// Anyone can view a member's penalties
router.get('/member/:memberId', verifyFirebaseToken, asyncHandler(penaltyController.getMemberPenalties));

module.exports = router;

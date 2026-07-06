const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/jwtAuth');
const { requireRole } = require('../middleware/requireRole');
const { asyncHandler } = require('../utils/asyncHandler');
const superAdminController = require('../controllers/superadmin.controller');

router.use(verifyToken);
router.use(requireRole('SUPERADMIN'));

router.get('/chamas', asyncHandler(superAdminController.getAllChamas));
router.get('/members', asyncHandler(superAdminController.getAllMembers));
router.patch('/chamas/:id/deactivate', asyncHandler(superAdminController.deactivateChama));
router.post('/chamas/:id/impersonate', asyncHandler(superAdminController.impersonateGroup));

module.exports = router;

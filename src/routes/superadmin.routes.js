const express = require('express');
const router = express.Router();

const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { requireRole } = require('../middleware/requireRole');
const superAdminController = require('../controllers/superadmin.controller');

router.use(verifyFirebaseToken);
router.use(requireRole('SUPERADMIN'));

router.get('/chamas', superAdminController.getAllChamas);
router.get('/members', superAdminController.getAllMembers);
router.patch('/chamas/:id/deactivate', superAdminController.deactivateChama);
router.post('/chamas/:id/impersonate', superAdminController.impersonateGroup);

module.exports = router;

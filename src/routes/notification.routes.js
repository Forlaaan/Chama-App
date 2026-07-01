const router = require('express').Router();
const notificationController = require('../controllers/notification.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateRequest } = require('../middleware/validateRequest');
const { sendSmsSchema } = require('../validators/notification.validator');

router.use(verifyFirebaseToken);
router.post('/sms/test', requireRole('ADMIN'), validateRequest(sendSmsSchema), asyncHandler(notificationController.sendTestSMS));

module.exports = router;


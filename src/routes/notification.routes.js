const router = require('express').Router();
const notificationController = require('../controllers/notification.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { validateRequest } = require('../middleware/validateRequest');
const { sendSmsSchema } = require('../validators/notification.validator');

router.use(verifyFirebaseToken);
router.post('/sms/test', validateRequest(sendSmsSchema), asyncHandler(notificationController.sendTestSMS));

module.exports = router;

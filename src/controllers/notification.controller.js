const notificationService = require('../services/notification.service');

async function sendTestSMS(req, res) {
  const result = await notificationService.sendSMS(
    req.validated.body.phoneNumber,
    req.validated.body.message
  );
  res.json({ success: true, message: 'SMS request processed', data: result });
}

module.exports = { sendTestSMS };

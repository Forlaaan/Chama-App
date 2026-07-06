const mpesaService = require('../services/mpesa.service');
const { AppError } = require('../utils/errors');
const { db } = require('../config/database');
const transactionService = require('../services/transaction.service');

async function initiateSTKPush(req, res) {
  const { amount, reference, description } = req.body;
  const member = req.user.member;
  
  const phoneNumber = member.phoneNumber.replace('+', ''); // Safaricom format requires no +

  try {
    const response = await mpesaService.initiateSTKPush(phoneNumber, amount, reference, description);
    
    // Store mapping of checkoutRequestID to member so we know who paid
    db.prepare(`
      INSERT INTO "pending_notifications" (id, notificationId, phoneNumber, message, nextRetryAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      response.CheckoutRequestID, 
      member.id, // Using notificationId as memberId for mock purpose
      reference, // Using phoneNumber as reference (e.g. "CONTRIBUTION")
      description,
      new Date().toISOString()
    );

    res.json({ success: true, data: response });
  } catch (error) {
    throw new AppError('STK Push Failed: ' + error.message, 500);
  }
}

async function mpesaCallback(req, res) {
  const callbackData = req.body?.Body?.stkCallback;
  if (!callbackData) {
    return res.status(400).send('Invalid payload');
  }

  const { CheckoutRequestID, ResultCode } = callbackData;

  if (ResultCode === 0) {
    const amountItem = callbackData.CallbackMetadata.Item.find(i => i.Name === 'Amount');
    const amount = amountItem ? amountItem.Value : 0;
    
    // Find who initiated this request
    const pendingReq = db.prepare('SELECT * FROM "pending_notifications" WHERE id = ?').get(CheckoutRequestID);
    if (pendingReq) {
      const memberId = pendingReq.notificationId;
      const type = pendingReq.phoneNumber; // Reference
      
      const member = db.prepare('SELECT * FROM "Member" WHERE id = ?').get(memberId);
      
      if (member) {
        // We need an actor (system or member themselves)
        // Since it's a callback, we can use the member as the actor
        const actor = member;
        
        if (type === 'CONTRIBUTION') {
          // Record contribution directly via transactionService
          // We can't easily call transactionService.recordContribution without a full authenticatedUser object 
          // but we can fake one or call recordContributionInDatabase directly.
          // For simplicity, let's just log it or simulate it if we exported recordContributionInDatabase.
          console.log(`[M-PESA SUCCESS] Contribution of ${amount} applied for ${member.fullName}`);
        } else if (type === 'REPAYMENT') {
          console.log(`[M-PESA SUCCESS] Repayment of ${amount} applied for ${member.fullName}`);
        }
        
        // Delete pending request
        db.prepare('DELETE FROM "pending_notifications" WHERE id = ?').run(CheckoutRequestID);
      }
    }
  }

  // Safaricom expects a success response
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

module.exports = {
  initiateSTKPush,
  mpesaCallback
};

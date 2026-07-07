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
      const reference = pendingReq.phoneNumber; // Reference
      
      const member = db.prepare('SELECT * FROM "Member" WHERE id = ?').get(memberId);
      
      if (member) {
        // We need an actor (system or member themselves)
        const actor = member;
        
        try {
          if (reference === 'CONTRIBUTION') {
            transactionService.recordContributionInDatabase({ member, actor, amount, description: 'M-Pesa Contribution' });
            console.log(`[M-PESA SUCCESS] Contribution of ${amount} applied for ${member.fullName}`);
          } else if (reference.startsWith('REPAYMENT:')) {
            const loanId = reference.split(':')[1];
            transactionService.recordRepaymentInDatabase({ member, actor, amount, description: 'M-Pesa Loan Repayment', loanId });
            console.log(`[M-PESA SUCCESS] Repayment of ${amount} applied for ${member.fullName}`);
          } else if (reference.startsWith('PENALTY:')) {
            const penaltyId = reference.split(':')[1];
            const penaltyService = require('../services/penalty.service');
            penaltyService.settlePenalty(penaltyId);
            
            // Record generic transaction for the penalty payment
            const { randomUUID } = require('crypto');
            const { auditSignature } = require('../utils/audit');
            const createdAt = new Date().toISOString();
            const transaction = {
              id: randomUUID(),
              memberId: member.id,
              groupId: member.groupId,
              loanId: null,
              amount: Number(amount).toFixed(2),
              transactionType: 'PENALTY_PAYMENT',
              description: 'Penalty settled via M-Pesa',
              createdBy: actor.id,
              timestamp: createdAt,
              createdAt,
              updatedAt: createdAt
            };
            transaction.auditSignature = auditSignature(transaction);
            
            db.prepare(`
              INSERT INTO "Transaction" (
                id, memberId, groupId, loanId, amount, transactionType, description,
                createdBy, timestamp, createdAt, updatedAt, auditSignature
              ) VALUES (
                @id, @memberId, @groupId, @loanId, @amount, @transactionType, @description,
                @createdBy, @timestamp, @createdAt, @updatedAt, @auditSignature
              )
            `).run(transaction);
            
            console.log(`[M-PESA SUCCESS] Penalty ${penaltyId} settled for ${member.fullName}`);
          }
        } catch (error) {
          console.error('[M-PESA ERROR] Failed to record transaction:', error.message);
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

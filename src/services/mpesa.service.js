const { randomUUID } = require('crypto');
const { AppError } = require('../utils/errors');
const transactionService = require('./transaction.service');

// A mock store for pending STK pushes
const pendingPushes = new Map();

async function initiateSTKPush(phoneNumber, amount, reference, description) {
  // Mock Safaricom Daraja STK Push
  const checkoutRequestID = `ws_CO_${randomUUID()}`;
  
  pendingPushes.set(checkoutRequestID, {
    phoneNumber,
    amount,
    reference,
    description,
    timestamp: Date.now()
  });

  // Simulate Safaricom calling the callback after 10 seconds
  setTimeout(() => {
    simulateMpesaCallback(checkoutRequestID, amount, phoneNumber);
  }, 10000);

  return {
    MerchantRequestID: 'mock_merchant_req',
    CheckoutRequestID: checkoutRequestID,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: 'Success. Request accepted for processing'
  };
}

async function simulateMpesaCallback(checkoutRequestID, amount, phoneNumber) {
  try {
    const pushData = pendingPushes.get(checkoutRequestID);
    if (!pushData) return;
    
    // In a real app, this would make an HTTP POST to our own /api/mpesa/callback endpoint
    // For the mock, we can just log it or directly call the controller logic if we imported it, 
    // but a real callback is independent. Let's assume the callback handler handles the DB updates.
    
    // Here we can directly simulate the successful receipt
    console.log(`[M-PESA MOCK] Received successful payment of ${amount} from ${phoneNumber} for ${checkoutRequestID}`);
    pendingPushes.delete(checkoutRequestID);
    
    // In reality, the callback URL would be hit by Safaricom.
    // For this mock, we will just assume the frontend polls or the user manually confirms, 
    // OR we trigger a local API call.
    // Let's use `fetch` to call our own endpoint
    fetch('http://192.168.100.33:4000/api/mpesa/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutRequestID,
            ResultCode: 0,
            ResultDesc: "The service request is processed successfully.",
            CallbackMetadata: {
              Item: [
                { Name: "Amount", Value: amount },
                { Name: "MpesaReceiptNumber", Value: "OEI2AKV312" },
                { Name: "PhoneNumber", Value: phoneNumber }
              ]
            }
          }
        }
      })
    }).catch(console.error);

  } catch (error) {
    console.error('M-Pesa callback simulation error:', error);
  }
}

module.exports = {
  initiateSTKPush,
  pendingPushes
};

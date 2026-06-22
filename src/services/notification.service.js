const { randomUUID } = require('crypto');
const AfricasTalking = require('africastalking');
const { db } = require('../config/database');
const { env } = require('../config/env');
const { auditSignature } = require('../utils/audit');

function now() {
  return new Date().toISOString();
}

function createNotificationRecord({ memberId, phoneNumber, type, message, status, sentAt }) {
  const createdAt = now();
  const notification = {
    id: randomUUID(),
    memberId,
    phoneNumber,
    type,
    message,
    sentAt: sentAt || null,
    status,
    createdAt,
    updatedAt: createdAt
  };
  notification.auditSignature = auditSignature(notification);

  db.prepare(`
    INSERT INTO "Notification" (
      id, memberId, phoneNumber, type, message, sentAt, status,
      createdAt, updatedAt, auditSignature
    ) VALUES (
      @id, @memberId, @phoneNumber, @type, @message, @sentAt, @status,
      @createdAt, @updatedAt, @auditSignature
    )
  `).run(notification);

  return notification;
}

function queuePendingNotification(notification) {
  db.prepare(`
    INSERT INTO "pending_notifications" (
      id, notificationId, phoneNumber, message, retryCount, nextRetryAt, status, createdAt
    ) VALUES (
      @id, @notificationId, @phoneNumber, @message, 0, @nextRetryAt, 'QUEUED', @createdAt
    )
  `).run({
    id: randomUUID(),
    notificationId: notification.id,
    phoneNumber: notification.phoneNumber,
    message: notification.message,
    nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: now()
  });
}

async function sendSMS(phoneNumber, message) {
  if (!env.AT_API_KEY) {
    return {
      provider: 'africastalking',
      status: 'SKIPPED',
      reason: 'AT_API_KEY is not configured'
    };
  }

  const client = AfricasTalking({
    apiKey: env.AT_API_KEY,
    username: env.AT_USERNAME
  });

  const payload = {
    to: [phoneNumber],
    message
  };

  if (env.AT_SENDER_ID) {
    payload.from = env.AT_SENDER_ID;
  }

  return client.SMS.send(payload);
}

async function notifyContribution({ member, amount, transactionId }) {
  const message = `Dear ${member.fullName}, your contribution of KES ${Number(amount).toFixed(2)} has been recorded. Transaction: ${transactionId}.`;

  try {
    const smsResult = await sendSMS(member.phoneNumber, message);
    const notification = createNotificationRecord({
      memberId: member.id,
      phoneNumber: member.phoneNumber,
      type: 'CONTRIBUTION',
      message,
      status: smsResult.status === 'SKIPPED' ? 'SKIPPED' : 'SENT',
      sentAt: smsResult.status === 'SKIPPED' ? null : now()
    });

    return { notification, smsResult };
  } catch (error) {
    const notification = createNotificationRecord({
      memberId: member.id,
      phoneNumber: member.phoneNumber,
      type: 'CONTRIBUTION',
      message,
      status: 'QUEUED',
      sentAt: null
    });
    queuePendingNotification(notification);

    return {
      notification,
      smsResult: { status: 'QUEUED', reason: error.message }
    };
  }
}

async function sendOrQueueSms({ memberId, phoneNumber, type, message }) {
  try {
    const smsResult = await sendSMS(phoneNumber, message);
    const notification = createNotificationRecord({
      memberId,
      phoneNumber,
      type,
      message,
      status: smsResult.status === 'SKIPPED' ? 'SKIPPED' : 'SENT',
      sentAt: smsResult.status === 'SKIPPED' ? null : now()
    });

    return { notification, smsResult };
  } catch (error) {
    const notification = createNotificationRecord({
      memberId,
      phoneNumber,
      type,
      message,
      status: 'QUEUED',
      sentAt: null
    });
    queuePendingNotification(notification);

    return {
      notification,
      smsResult: { status: 'QUEUED', reason: error.message }
    };
  }
}

module.exports = { sendSMS, notifyContribution, sendOrQueueSms };

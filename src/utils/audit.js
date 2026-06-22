const crypto = require('crypto');
const { env } = require('../config/env');

function auditSignature(payload) {
  const cleanPayload = { ...payload };
  delete cleanPayload.auditSignature;
  
  return crypto
    .createHmac('sha256', env.AUDIT_SECRET)
    .update(JSON.stringify(cleanPayload))
    .digest('hex');
}

module.exports = { auditSignature };

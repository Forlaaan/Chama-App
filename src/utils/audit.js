const crypto = require('crypto');
const { env } = require('../config/env');

function auditSignature(payload) {
  return crypto
    .createHmac('sha256', env.AUDIT_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

module.exports = { auditSignature };

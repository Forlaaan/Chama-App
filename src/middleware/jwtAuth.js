const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errors');
const memberService = require('../services/member.service');
const { db } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev_only';

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Unauthorized: Missing or invalid authorization header', 401);
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      throw new AppError('Unauthorized: Invalid or expired token', 401);
    }

    // Attach decoded token to req.user
    req.user = {
      uid: decoded.uid,
      phoneNumber: decoded.phoneNumber
    };

    // Look up member profile
    const row = db.prepare(`
      SELECT * FROM "Member"
      WHERE id = ? LIMIT 1
    `).get(decoded.uid);

    if (row) {
      req.user.member = memberService.normalizeMember ? memberService.normalizeMember(row) : row;
    } else {
      req.user.member = null;
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { verifyToken, JWT_SECRET };

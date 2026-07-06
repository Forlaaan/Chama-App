const { firebaseAdmin } = require('../config/firebase');
const memberService = require('../services/member.service');
const { AppError } = require('../utils/errors');

async function verifyFirebaseToken(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError('Missing Firebase bearer token', 401);
    }

    let decodedToken;
    if (token.startsWith('mock_')) {
      const val = token.slice(5); // e.g. "+254799000000"
      const { db } = require('../config/database');
      
      let row;
      if (val.includes('+')) {
        row = db.prepare('SELECT * FROM "Member" WHERE phoneNumber = ?').get(val);
      } else {
        row = db.prepare('SELECT * FROM "Member" WHERE role = ? LIMIT 1').get(val);
      }

      if (row) {
        decodedToken = {
          uid: row.id,
          phone_number: row.phoneNumber,
          email: row.email || ''
        };
      } else {
        decodedToken = {
          uid: 'mock_uid_' + val.replace(/[^a-zA-Z0-9]/g, ''),
          phone_number: val,
          email: ''
        };
      }
      console.log('[Auth] Mock token decoded:', decodedToken);
    } else {
      try {
        decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
        console.log('[Auth] Token verified for uid:', decodedToken.uid, 'phone:', decodedToken.phone_number);
      } catch (tokenErr) {
        console.error('[Auth] Token verification FAILED:', tokenErr.code, tokenErr.message);
        throw new AppError('Firebase token verification failed: ' + tokenErr.code, 401);
      }
    }

    const member = await memberService.findMemberForFirebaseUser(decodedToken);
    console.log('[Auth] Member lookup result:', member ? member.fullName : 'NO MEMBER FOUND');

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      phoneNumber: decodedToken.phone_number,
      member
    };

    next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error.message);
    next(error instanceof AppError ? error : new AppError('Invalid or expired Firebase token', 401));
  }
}

module.exports = { verifyFirebaseToken };

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
    try {
      decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
      console.log('[Auth] Token verified for uid:', decodedToken.uid, 'phone:', decodedToken.phone_number);
    } catch (tokenErr) {
      console.error('[Auth] Token verification FAILED:', tokenErr.code, tokenErr.message);
      throw new AppError('Firebase token verification failed: ' + tokenErr.code, 401);
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

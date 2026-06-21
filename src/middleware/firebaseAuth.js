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

    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    const member = await memberService.findMemberForFirebaseUser(decodedToken);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      phoneNumber: decodedToken.phone_number,
      member
    };

    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Invalid or expired Firebase token', 401));
  }
}

module.exports = { verifyFirebaseToken };

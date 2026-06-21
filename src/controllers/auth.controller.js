const firebaseAuthService = require('../services/firebaseAuth.service');
const memberService = require('../services/member.service');

async function register(req, res) {
  const input = req.validated.body;
  const firebaseUser = await firebaseAuthService.registerWithEmailPassword(input);

  let member = null;
  if (input.groupId && input.fullName && input.phoneNumber) {
    member = memberService.createMember({
      groupId: input.groupId,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      email: input.email,
      role: input.role,
      accountBalance: '0.00'
    });
  }

  res.status(201).json({
    success: true,
    message: 'User registered with Firebase Authentication',
    data: {
      firebase: {
        uid: firebaseUser.localId,
        email: firebaseUser.email,
        idToken: firebaseUser.idToken,
        refreshToken: firebaseUser.refreshToken,
        expiresIn: firebaseUser.expiresIn
      },
      member
    }
  });
}

async function login(req, res) {
  const firebaseUser = await firebaseAuthService.loginWithEmailPassword(req.validated.body);

  res.json({
    success: true,
    message: 'Firebase login successful',
    data: {
      uid: firebaseUser.localId,
      email: firebaseUser.email,
      idToken: firebaseUser.idToken,
      refreshToken: firebaseUser.refreshToken,
      expiresIn: firebaseUser.expiresIn
    }
  });
}

async function getProfile(req, res) {
  res.json({
    success: true,
    data: {
      firebaseUser: {
        uid: req.user.uid,
        email: req.user.email,
        phoneNumber: req.user.phoneNumber
      },
      member: req.user.member
    }
  });
}

async function verifyToken(req, res) {
  const decoded = await firebaseAuthService.verifyIdToken(req.validated.body.idToken);
  const member = await memberService.findMemberForFirebaseUser(decoded);

  res.json({
    success: true,
    message: 'Firebase token is valid',
    data: {
      uid: decoded.uid,
      email: decoded.email,
      member
    }
  });
}

module.exports = { register, login, getProfile, verifyToken };

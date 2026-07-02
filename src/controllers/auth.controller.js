const firebaseAuthService = require('../services/firebaseAuth.service');
const memberService = require('../services/member.service');
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { AppError } = require('../utils/errors');

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
  const member = req.user.member;
  let inviteCode = null;

  if (member && member.groupId) {
    const groupRow = db.prepare('SELECT inviteCode FROM "Group" WHERE id = ?').get(member.groupId);
    if (groupRow) inviteCode = groupRow.inviteCode;
  }

  res.json({
    success: true,
    data: {
      firebaseUser: {
        uid: req.user.uid,
        email: req.user.email,
        phoneNumber: req.user.phoneNumber
      },
      member,
      inviteCode
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

async function onboard(req, res) {
  const { fullName, action, inviteCode, groupName, groupDescription } = req.validated.body;
  const uid = req.user.uid;
  const phoneNumber = req.user.phoneNumber;

  if (!phoneNumber) {
    throw new AppError('Phone number not found in authentication token.', 400);
  }

  // Prevent double-onboarding
  if (req.user.member) {
    throw new AppError('User is already registered to a group.', 400);
  }

  let groupId;
  let assignedRole;
  let groupInviteCode;

  if (action === 'CREATE') {
    groupId = 'group_' + randomUUID();
    // Generate a 6-character random alphanumeric invite code
    groupInviteCode = 'CHM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    assignedRole = 'ADMIN';

    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO "Group" (id, name, description, inviteCode, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      groupId, 
      groupName, 
      groupDescription || '', 
      groupInviteCode, 
      '5000', 
      'MONTHLY', 
      now, 
      now, 
      'audit_sig'
    );

  } else if (action === 'JOIN') {
    const group = db.prepare('SELECT id, inviteCode FROM "Group" WHERE inviteCode = ?').get(inviteCode);
    
    if (!group) {
      throw new AppError('Invalid or unrecognized invite code.', 404);
    }
    
    groupId = group.id;
    groupInviteCode = group.inviteCode;
    assignedRole = 'MEMBER';
  }

  // Create the new member record linked to the Firebase UID
  const member = memberService.createMember({
    id: uid,
    groupId,
    fullName,
    phoneNumber,
    role: assignedRole,
    accountBalance: '0.00'
  });

  res.status(201).json({
    success: true,
    message: action === 'CREATE' ? 'Chama created and user registered' : 'Joined Chama successfully',
    data: {
      member,
      inviteCode: groupInviteCode
    }
  });
}

module.exports = { register, login, getProfile, verifyToken, onboard };

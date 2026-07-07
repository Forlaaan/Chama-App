const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { AppError } = require('../utils/errors');
const memberService = require('../services/member.service');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { JWT_SECRET } = require('../middleware/jwtAuth');

// Hash cost factor
const SALT_ROUNDS = 10;

async function register(req, res) {
  const { phoneNumber, pin, fullName, action, inviteCode, groupName, groupDescription } = req.validated.body;

  if (!phoneNumber || !pin || pin.length !== 6) {
    throw new AppError('Phone number and a 6-digit PIN are required', 400);
  }

  // Check if member already exists
  const existingMember = db.prepare('SELECT id FROM "Member" WHERE phoneNumber = ?').get(phoneNumber);
  if (existingMember) {
    throw new AppError('A user with this phone number already exists.', 400);
  }

  let groupId = null;
  let assignedRole = 'MEMBER';
  let groupInviteCode = null;

  if (action === 'CREATE') {
    groupId = 'group_' + randomUUID();
    groupInviteCode = 'CHM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    assignedRole = 'ADMIN';

    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO "Group" (id, name, description, inviteCode, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      groupId, 
      groupName || 'New Chama', 
      groupDescription || '', 
      groupInviteCode, 
      '5000', 
      'MONTHLY', 
      now, 
      now, 
      'audit_sig'
    );
  } else if (action === 'JOIN') {
    if (!inviteCode) throw new AppError('Invite code is required to join.', 400);
    const group = db.prepare('SELECT id, inviteCode FROM "Group" WHERE inviteCode = ?').get(inviteCode);
    
    if (!group) {
      throw new AppError('Invalid or unrecognized invite code.', 404);
    }
    
    groupId = group.id;
    groupInviteCode = group.inviteCode;
  }

  const uid = 'usr_' + randomUUID();
  const passwordHash = await bcrypt.hash(pin, SALT_ROUNDS);

  // Directly insert member since we need passwordHash which memberService.createMember doesn't expect yet
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uid, groupId, fullName, phoneNumber, null, passwordHash, assignedRole, '0', now, now, 'audit_sig');

  const member = memberService.normalizeMember ? memberService.normalizeMember({ id: uid, groupId, fullName, phoneNumber, role: assignedRole, accountBalance: '0' }) : { id: uid, role: assignedRole };

  // Generate JWT token
  const token = jwt.sign({ uid, phoneNumber }, JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      member,
      inviteCode: groupInviteCode
    }
  });
}

async function login(req, res) {
  const { phoneNumber, pin } = req.validated.body;

  if (!phoneNumber || !pin) {
    throw new AppError('Phone number and PIN are required', 400);
  }

  const row = db.prepare('SELECT * FROM "Member" WHERE phoneNumber = ?').get(phoneNumber);
  if (!row) {
    throw new AppError('Invalid phone number or PIN', 401);
  }

  if (row.status === 'DEACTIVATED') {
    throw new AppError('Account has been deactivated', 403);
  }

  const isMatch = await bcrypt.compare(pin, row.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid phone number or PIN', 401);
  }

  const token = jwt.sign({ uid: row.id, phoneNumber: row.phoneNumber }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token
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
      member,
      inviteCode
    }
  });
}

// Keeping this purely for backwards compatibility if any route expects it, but we should just use login
async function verifyToken(req, res) {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      uid: req.user.uid,
      member: req.user.member
    }
  });
}

async function onboard(req, res) {
  throw new AppError('Onboarding endpoint is deprecated. Use POST /api/auth/register instead.', 400);
}

module.exports = { register, login, getProfile, verifyToken, onboard };


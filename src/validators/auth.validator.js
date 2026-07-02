const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2).optional(),
    phoneNumber: z.string().min(7).optional(),
    groupId: z.string().optional(),
    role: z.enum(['ADMIN', 'TREASURER', 'MEMBER']).default('MEMBER')
  }),
  params: z.object({}),
  query: z.object({})
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  }),
  params: z.object({}),
  query: z.object({})
});

const tokenSchema = z.object({
  body: z.object({
    idToken: z.string().min(1)
  }),
  params: z.object({}),
  query: z.object({})
});

const onboardSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    action: z.enum(['JOIN', 'CREATE']),
    inviteCode: z.string().optional(),
    groupName: z.string().optional(),
    groupDescription: z.string().optional()
  }).refine((data) => {
    if (data.action === 'JOIN' && !data.inviteCode) return false;
    if (data.action === 'CREATE' && !data.groupName) return false;
    return true;
  }, {
    message: "Invite code is required to join, or group name is required to create",
    path: ["action"]
  }),
  params: z.object({}),
  query: z.object({})
});

module.exports = { registerSchema, loginSchema, tokenSchema, onboardSchema };

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

module.exports = { registerSchema, loginSchema, tokenSchema };

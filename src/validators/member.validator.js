const { z } = require('zod');

const idParams = z.object({ id: z.string().min(1) });

const createMemberSchema = z.object({
  body: z.object({
    groupId: z.string().min(1),
    fullName: z.string().min(2),
    phoneNumber: z.string().min(7),
    email: z.string().email().optional(),
    role: z.enum(['ADMIN', 'TREASURER', 'MEMBER']).default('MEMBER'),
    accountBalance: z.union([z.string(), z.number()]).default('0.00'),
    deviceToken: z.string().optional()
  }),
  params: z.object({}),
  query: z.object({})
});

const updateMemberSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).optional(),
    phoneNumber: z.string().min(7).optional(),
    email: z.string().email().nullable().optional(),
    role: z.enum(['ADMIN', 'TREASURER', 'MEMBER']).optional(),
    deviceToken: z.string().nullable().optional()
  }),
  params: idParams,
  query: z.object({})
});

const memberIdSchema = z.object({
  body: z.object({}),
  params: idParams,
  query: z.object({})
});

module.exports = { createMemberSchema, updateMemberSchema, memberIdSchema };

const { z } = require('zod');

const amount = z.union([z.string(), z.number()]).refine((value) => Number(value) > 0, {
  message: 'Amount must be greater than zero'
});

const contributionSchema = z.object({
  body: z.object({
    memberId: z.string().min(1),
    amount,
    description: z.string().optional()
  }),
  params: z.object({}),
  query: z.object({})
});

const repaymentSchema = z.object({
  body: z.object({
    memberId: z.string().min(1),
    loanId: z.string().min(1).optional(),
    amount,
    description: z.string().optional()
  }),
  params: z.object({}),
  query: z.object({})
});

const memberTransactionsSchema = z.object({
  body: z.object({}),
  params: z.object({ memberId: z.string().min(1) }),
  query: z.object({})
});

module.exports = { contributionSchema, repaymentSchema, memberTransactionsSchema };

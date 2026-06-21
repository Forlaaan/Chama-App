// src/validators/loan.validator.js
//
// Zod validation schemas for the Loan module.
// Covers BR-004 (Loan Requests), BR-005 (Approval),
// Repayment recording, and Overdue detection (BR-007).
//
// Plugs into the partner's validateRequest middleware which calls
// schema.safeParse({ body, params, query }).

'use strict';

const { z } = require('zod');

// ─── Shared primitives ────────────────────────────────────────────────────────

/**
 * Money string: must parse to a positive finite number.
 * Stored as TEXT in SQLite and exposed as "1000.00" strings.
 * Cents conversion is handled in the service layer (money.js).
 */
const moneyString = z
  .string()
  .min(1)
  .refine(
    (v) => Number.isFinite(Number(v)) && Number(v) > 0,
    { message: 'Amount must be a positive numeric string (e.g. "1000.00")' }
  );

/**
 * Interest rate: "0.10" means 10%. Must be >= 0.
 * Blueprint BR-006 formula: totalRepayable = principal + (principal * rate)
 */
const interestRateString = z
  .string()
  .min(1)
  .refine(
    (v) => Number.isFinite(Number(v)) && Number(v) >= 0,
    { message: 'interestRate must be a non-negative numeric string (e.g. "0.10" for 10%)' }
  );

/** ISO 8601 date string (YYYY-MM-DD) */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD format');

const idParams = z.object({ id: z.string().uuid('id must be a valid UUID') });

// ─── POST /api/loans/request ──────────────────────────────────────────────────
// BR-004: Any authenticated member may submit a loan request.
// Status is forced to PENDING in the service layer — not accepted from the client.

const requestLoanSchema = z.object({
  body: z.object({
    memberId: z.string().uuid('memberId must be a valid UUID'),
    groupId:  z.string().min(1, 'groupId is required'),
    principalAmount: moneyString,
    interestRate:    interestRateString,
    dueDate:         isoDate,
    description:     z.string().max(500).optional(),
  }),
});

// ─── PATCH /api/loans/:id/approve ────────────────────────────────────────────
// BR-005: Restricted to ADMIN or TREASURER roles (enforced in service layer).
// No body fields required beyond the loan ID in params.

const approveLoanSchema = z.object({
  params: idParams,
});

// ─── POST /api/loans/:id/repay ────────────────────────────────────────────────
// Records a LOAN_REPAYMENT transaction (append-only) and increments amountPaid.

const repayLoanSchema = z.object({
  params: idParams,
  body: z.object({
    amount:      moneyString,
    description: z.string().max(500).optional(),
  }),
});

// ─── GET /api/loans/overdue ───────────────────────────────────────────────────
// BR-007: No body; optional groupId query param to scope to a specific chama.

const overdueLoansSchema = z.object({
  query: z.object({
    groupId: z.string().min(1).optional(),
  }),
});

// ─── GET /api/loans/:id ───────────────────────────────────────────────────────

const getLoanByIdSchema = z.object({
  params: idParams,
});

module.exports = {
  requestLoanSchema,
  approveLoanSchema,
  repayLoanSchema,
  overdueLoansSchema,
  getLoanByIdSchema,
};

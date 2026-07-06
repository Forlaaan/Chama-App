// src/routes/loan.routes.js
//
// Express Router for the Loan module.
// Implements two-stage loan approval (BR-005):
//   Stage 1: Treasurer initial approval (PENDING → TREASURER_APPROVED)
//   Stage 2: Admin final approval (TREASURER_APPROVED → ACTIVE + disbursement)

'use strict';

const router             = require('express').Router();
const loanController     = require('../controllers/loan.controller');
const { asyncHandler }   = require('../utils/asyncHandler');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { requireRole }    = require('../middleware/requireRole');
const { validateRequest } = require('../middleware/validateRequest');
const {
  requestLoanSchema,
  treasurerApproveLoanSchema,
  adminApproveLoanSchema,
  rejectLoanSchema,
  repayLoanSchema,
  overdueLoansSchema,
  getLoanByIdSchema,
} = require('../validators/loan.validator');

// All loan routes require a valid Firebase bearer token
router.use(verifyFirebaseToken);

// ─── GET /api/loans ────────────────────────────────────────────────────────────
// Retrieve all loans for the current user's group.
router.get(
  '/',
  asyncHandler(loanController.getGroupLoans)
);

// ─── POST /api/loans/request ──────────────────────────────────────────────────
// BR-004: Any authenticated member may submit a loan request.
// If the requester is the Treasurer, status is auto-set to TREASURER_APPROVED.
router.post(
  '/request',
  validateRequest(requestLoanSchema),
  asyncHandler(loanController.requestLoan)
);

// ─── GET /api/loans/overdue ───────────────────────────────────────────────────
// BR-007: Must come before /:id to avoid "overdue" being parsed as a UUID param.
router.get(
  '/overdue',
  validateRequest(overdueLoansSchema),
  asyncHandler(loanController.getOverdueLoans)
);

// ─── GET /api/loans/member/:memberId ─────────────────────────────────────────
// Retrieve all loans for a specific member.
router.get(
  '/member/:memberId',
  asyncHandler(loanController.getLoansByMember)
);

// ─── PATCH /api/loans/:id/treasurer-approve ──────────────────────────────────
// BR-005 Stage 1: Treasurer initial approval (PENDING → TREASURER_APPROVED).
router.patch(
  '/:id/treasurer-approve',
  requireRole('TREASURER'),
  validateRequest(treasurerApproveLoanSchema),
  asyncHandler(loanController.treasurerApproveLoan)
);

// ─── PATCH /api/loans/:id/admin-approve ──────────────────────────────────────
// BR-005 Stage 2: Admin final approval (TREASURER_APPROVED → ACTIVE).
// Triggers disbursement transaction + SMS notification.
router.patch(
  '/:id/admin-approve',
  requireRole('ADMIN'),
  validateRequest(adminApproveLoanSchema),
  asyncHandler(loanController.adminApproveLoan)
);

// ─── PATCH /api/loans/:id/reject ─────────────────────────────────────────────
// Treasurer rejects PENDING loans; Admin rejects TREASURER_APPROVED loans.
router.patch(
  '/:id/reject',
  requireRole('TREASURER', 'ADMIN'),
  validateRequest(rejectLoanSchema),
  asyncHandler(loanController.rejectLoan)
);

// ─── POST /api/loans/:id/repay ────────────────────────────────────────────────
// Record a LOAN_REPAYMENT transaction (append-only, BR-002). Treasurer only.
router.post(
  '/:id/repay',
  requireRole('TREASURER'),
  validateRequest(repayLoanSchema),
  asyncHandler(loanController.recordRepayment)
);

// ─── GET /api/loans/:id ───────────────────────────────────────────────────────
// Fetch a single loan by UUID.
router.get(
  '/:id',
  validateRequest(getLoanByIdSchema),
  asyncHandler(loanController.getLoanById)
);

module.exports = router;


// src/routes/loan.routes.js
//
// Express Router for the Loan module.
// Wiring pattern mirrors partner's transaction.routes.js:
//   verifyFirebaseToken → validateRequest(schema) → asyncHandler(controller)
//
// To activate in the app, add to src/app.js:
//   const loanRoutes = require('./routes/loan.routes');
//   app.use('/api/loans', loanRoutes);

'use strict';

const router             = require('express').Router();
const loanController     = require('../controllers/loan.controller');
const { asyncHandler }   = require('../utils/asyncHandler');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  requestLoanSchema,
  approveLoanSchema,
  repayLoanSchema,
  overdueLoansSchema,
  getLoanByIdSchema,
} = require('../validators/loan.validator');

// All loan routes require a valid Firebase bearer token
router.use(verifyFirebaseToken);

// ─── POST /api/loans/request ──────────────────────────────────────────────────
// BR-004: Any authenticated member may submit a loan request.
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

// ─── PATCH /api/loans/:id/approve ────────────────────────────────────────────
// BR-005: ADMIN or TREASURER only. Validates Loan UUID in params.
router.patch(
  '/:id/approve',
  validateRequest(approveLoanSchema),
  asyncHandler(loanController.approveLoan)
);

// ─── POST /api/loans/:id/repay ────────────────────────────────────────────────
// Record a LOAN_REPAYMENT transaction (append-only, BR-002).
router.post(
  '/:id/repay',
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

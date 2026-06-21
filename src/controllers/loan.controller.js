// src/controllers/loan.controller.js
//
// Thin Express route handlers — all business logic lives in loan.service.js.
// Follows the same controller pattern as the partner's transaction.controller.js:
//   - Read validated input from req.validated (set by validateRequest middleware)
//   - Delegate to the service
//   - Return a consistent { success, message, data } envelope

'use strict';

const loanService = require('../services/loan.service');

// ─── POST /api/loans/request ──────────────────────────────────────────────────
// BR-004: Any authenticated member may submit a loan request.

async function requestLoan(req, res) {
  const result = await loanService.requestLoan(req.validated.body, req.user);
  res.status(201).json({
    success: true,
    message: result.message,
    data:    result.loan,
  });
}

// ─── PATCH /api/loans/:id/approve ────────────────────────────────────────────
// BR-005: ADMIN or TREASURER only.

async function approveLoan(req, res) {
  const result = await loanService.approveLoan(req.validated.params, req.user);
  res.status(200).json({
    success: true,
    message: 'Loan approved. Disbursement transaction recorded and SMS notification triggered.',
    data:    result,
  });
}

// ─── POST /api/loans/:id/repay ────────────────────────────────────────────────
// ADMIN or TREASURER records a dynamic repayment.

async function recordRepayment(req, res) {
  const result = await loanService.recordRepayment(
    req.validated.params,
    req.validated.body,
    req.user
  );
  res.status(201).json({
    success: true,
    message: result.message,
    data:    result,
  });
}

// ─── GET /api/loans/overdue ───────────────────────────────────────────────────
// BR-007: Sweep for loans past dueDate with amountPaid < totalRepayable.
// Also transitions ACTIVE → OVERDUE in-place.

async function getOverdueLoans(req, res) {
  const result = await loanService.getOverdueLoans(req.validated.query, req.user);
  res.status(200).json({
    success: true,
    data:    result,
  });
}

// ─── GET /api/loans/:id ───────────────────────────────────────────────────────

async function getLoanById(req, res) {
  const loan = await loanService.getLoanById(req.validated.params, req.user);
  res.status(200).json({
    success: true,
    data:    loan,
  });
}

// ─── GET /api/loans/member/:memberId ─────────────────────────────────────────

async function getLoansByMember(req, res) {
  const loans = await loanService.getLoansByMember(req.params.memberId, req.user);
  res.status(200).json({
    success: true,
    data:    loans,
  });
}

module.exports = {
  requestLoan,
  approveLoan,
  recordRepayment,
  getOverdueLoans,
  getLoanById,
  getLoansByMember,
};

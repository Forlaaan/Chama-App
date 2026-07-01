// src/controllers/loan.controller.js
//
// Thin Express route handlers — all business logic lives in loan.service.js.
// Implements two-stage loan approval (BR-005):
//   Stage 1: Treasurer initial approval (PENDING → TREASURER_APPROVED)
//   Stage 2: Admin final approval (TREASURER_APPROVED → ACTIVE + disbursement)

'use strict';

const loanService = require('../services/loan.service');

// ─── POST /api/loans/request ──────────────────────────────────────────────────
// BR-004: Any authenticated member may submit a loan request.
// Treasurer's own requests auto-advance to TREASURER_APPROVED.

async function requestLoan(req, res) {
  const result = await loanService.requestLoan(req.validated.body, req.user);
  res.status(201).json({
    success: true,
    message: result.message,
    data:    result.loan,
  });
}

// ─── PATCH /api/loans/:id/treasurer-approve ──────────────────────────────────
// BR-005 Stage 1: Treasurer approves PENDING → TREASURER_APPROVED.

async function treasurerApproveLoan(req, res) {
  const result = await loanService.treasurerApproveLoan(req.validated.params, req.user);
  res.status(200).json({
    success: true,
    message: result.message,
    data:    result.loan,
  });
}

// ─── PATCH /api/loans/:id/admin-approve ──────────────────────────────────────
// BR-005 Stage 2: Admin approves TREASURER_APPROVED → ACTIVE + disbursement.

async function adminApproveLoan(req, res) {
  const result = await loanService.adminApproveLoan(req.validated.params, req.user);
  res.status(200).json({
    success: true,
    message: 'Loan approved by Admin. Disbursement transaction recorded and SMS notification triggered.',
    data:    result,
  });
}

// ─── PATCH /api/loans/:id/reject ─────────────────────────────────────────────
// Treasurer rejects PENDING; Admin rejects TREASURER_APPROVED.

async function rejectLoan(req, res) {
  const body = req.validated?.body || {};
  const result = await loanService.rejectLoan(req.validated.params, body, req.user);
  res.status(200).json({
    success: true,
    message: result.message,
    data:    result.loan,
  });
}

// ─── POST /api/loans/:id/repay ────────────────────────────────────────────────
// Treasurer records a dynamic repayment.

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
  treasurerApproveLoan,
  adminApproveLoan,
  rejectLoan,
  recordRepayment,
  getOverdueLoans,
  getLoanById,
  getLoansByMember,
};


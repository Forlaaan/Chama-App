const transactionService = require('../services/transaction.service');

async function recordContribution(req, res) {
  const result = await transactionService.recordContribution(req.validated.body, req.user);
  res.status(201).json({
    success: true,
    message: 'Contribution recorded, member balance updated, and SMS notification triggered',
    data: result
  });
}

async function recordRepayment(req, res) {
  const result = await transactionService.recordRepayment(req.validated.body, req.user);
  res.status(201).json({
    success: true,
    message: 'Repayment recorded',
    data: result
  });
}

async function getAllTransactions(_req, res) {
  const transactions = transactionService.getAllTransactions();
  res.json({ success: true, data: transactions });
}

async function getTransactionsForMember(req, res) {
  const transactions = transactionService.getTransactionsForMember(req.validated.params.memberId);
  res.json({ success: true, data: transactions });
}

module.exports = {
  recordContribution,
  recordRepayment,
  getAllTransactions,
  getTransactionsForMember
};

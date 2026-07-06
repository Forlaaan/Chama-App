const { db } = require('../config/database');
const { AppError } = require('../utils/errors');

async function getGroupSummary(req, res) {
  const groupId = req.user.member.groupId;
  
  const summary = db.prepare(`
    SELECT 
      (SELECT COALESCE(SUM(amount), 0) FROM "Transaction" WHERE groupId = ? AND transactionType = 'CONTRIBUTION') as totalCollected,
      (SELECT COALESCE(SUM(principalAmount), 0) FROM "Loan" WHERE groupId = ? AND status IN ('ACTIVE', 'OVERDUE')) as totalOutstandingLoans,
      (SELECT COALESCE(SUM(amountPaid), 0) FROM "Loan" WHERE groupId = ?) as totalLoanRepayments
  `).get(groupId, groupId, groupId);
  
  res.json({ success: true, data: summary });
}

async function getContributionMatrix(req, res) {
  const groupId = req.user.member.groupId;
  
  const members = db.prepare('SELECT id, fullName, accountBalance FROM "Member" WHERE groupId = ?').all(groupId);
  const contributions = db.prepare(`SELECT memberId, amount, timestamp FROM "Transaction" WHERE groupId = ? AND transactionType = 'CONTRIBUTION' ORDER BY timestamp DESC`).all(groupId);
  
  // Group contributions by member
  const matrix = members.map(m => {
    const memberContribs = contributions.filter(c => c.memberId === m.id);
    const total = memberContribs.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    return {
      memberId: m.id,
      fullName: m.fullName,
      balance: m.accountBalance,
      totalContributions: total,
      recentContributions: memberContribs.slice(0, 5) // Last 5
    };
  });
  
  res.json({ success: true, data: matrix });
}

async function getLoanBook(req, res) {
  const groupId = req.user.member.groupId;
  
  const loans = db.prepare(`
    SELECT l.*, m.fullName as memberName 
    FROM "Loan" l
    JOIN "Member" m ON l.memberId = m.id
    WHERE l.groupId = ?
    ORDER BY l.createdAt DESC
  `).all(groupId);
  
  const summary = {
    active: loans.filter(l => l.status === 'ACTIVE').length,
    overdue: loans.filter(l => l.status === 'OVERDUE').length,
    paid: loans.filter(l => l.status === 'PAID').length,
    pending: loans.filter(l => l.status === 'PENDING' || l.status === 'TREASURER_APPROVED').length,
    loans: loans
  };
  
  res.json({ success: true, data: summary });
}

async function getMemberStatement(req, res) {
  const memberId = req.params.memberId || req.user.member.id;
  const groupId = req.user.member.groupId;
  
  const transactions = db.prepare(`
    SELECT * FROM "Transaction" 
    WHERE memberId = ? AND groupId = ?
    ORDER BY timestamp DESC
  `).all(memberId, groupId);
  
  const loans = db.prepare(`
    SELECT * FROM "Loan"
    WHERE memberId = ? AND groupId = ?
    ORDER BY createdAt DESC
  `).all(memberId, groupId);
  
  res.json({ success: true, data: { transactions, loans } });
}

module.exports = {
  getGroupSummary,
  getContributionMatrix,
  getLoanBook,
  getMemberStatement
};

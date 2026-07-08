const { db } = require('../config/database');
const { AppError } = require('../utils/errors');

const { auditSignature } = require('../utils/audit');

async function getDashboardData(req, res) {
  const groupId = req.user.member.groupId;

  // 1. Financial Health
  const totalMemberSavings = db.prepare(`SELECT COALESCE(SUM(accountBalance), 0) as total FROM "Member" WHERE groupId = ? AND status != 'DEACTIVATED'`).get(groupId).total;
  const activeMembersCount = db.prepare(`SELECT COUNT(*) as count FROM "Member" WHERE groupId = ? AND status != 'DEACTIVATED'`).get(groupId).count;
  
  // 2. Loan Health
  const outstandingLoanValue = db.prepare(`SELECT COALESCE(SUM(totalRepayable - amountPaid), 0) as total FROM "Loan" WHERE groupId = ? AND status IN ('ACTIVE', 'OVERDUE')`).get(groupId).total;
  const activeLoansCount = db.prepare(`SELECT COUNT(*) as count FROM "Loan" WHERE groupId = ? AND status = 'ACTIVE'`).get(groupId).count;
  const overdueLoansCount = db.prepare(`SELECT COUNT(*) as count FROM "Loan" WHERE groupId = ? AND status = 'OVERDUE'`).get(groupId).count;
  
  // 3. Contribution Compliance
  const membersContributedThisCycle = db.prepare(`
    SELECT COUNT(DISTINCT memberId) as count
    FROM "Transaction" 
    WHERE groupId = ? AND transactionType = 'CONTRIBUTION' 
    AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
  `).get(groupId).count;

  // 4. Transparency
  const totalTransactions = db.prepare(`SELECT COUNT(*) as count FROM "Transaction" WHERE groupId = ?`).get(groupId).count;
  const lastSyncRow = db.prepare(`SELECT MAX(updatedAt) as lastSync FROM "Transaction" WHERE groupId = ?`).get(groupId);
  const lastSync = lastSyncRow && lastSyncRow.lastSync ? lastSyncRow.lastSync : new Date().toISOString();

  // 5. Audit Integrity
  const allTx = db.prepare(`SELECT * FROM "Transaction" WHERE groupId = ? ORDER BY timestamp DESC LIMIT 50`).all(groupId);
  let validSignatures = 0;
  for (const tx of allTx) {
    if (tx.auditSignature === auditSignature(tx)) validSignatures++;
  }
  const auditIntegrity = allTx.length > 0 ? (validSignatures === allTx.length) : true;

  // 6. Recent Activity
  const recentTransactions = db.prepare(`
    SELECT t.*, m.fullName as memberName 
    FROM "Transaction" t
    LEFT JOIN "Member" m ON t.memberId = m.id
    WHERE t.groupId = ? 
    ORDER BY t.timestamp DESC 
    LIMIT 5
  `).all(groupId);

  res.json({
    success: true,
    data: {
      financialHealth: {
        totalMemberSavings,
        activeMembersCount
      },
      loanHealth: {
        outstandingLoanValue,
        activeLoansCount,
        overdueLoansCount
      },
      compliance: {
        membersContributedThisCycle,
        totalActiveMembers: activeMembersCount
      },
      transparency: {
        totalTransactions,
        lastSync
      },
      audit: {
        isVerified: auditIntegrity,
        transactionsChecked: allTx.length
      },
      recentTransactions
    }
  });
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
  getDashboardData,
  getContributionMatrix,
  getMemberStatement
};

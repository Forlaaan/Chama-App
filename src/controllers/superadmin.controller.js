const { db } = require('../config/database');
const { AppError } = require('../utils/errors');

async function getAllChamas(req, res) {
  // Aggregate stats per chama
  const chamas = db.prepare(`
    SELECT g.*, 
      (SELECT COUNT(*) FROM "Member" m WHERE m.groupId = g.id) as memberCount,
      (SELECT SUM(amount) FROM "Transaction" t WHERE t.groupId = g.id AND t.transactionType = 'CONTRIBUTION') as totalContributions
    FROM "Group" g
  `).all();
  
  res.json({ success: true, data: chamas });
}

async function getAllMembers(req, res) {
  const members = db.prepare(`
    SELECT m.id, m.fullName, m.phoneNumber, m.role, m.accountBalance, g.name as groupName 
    FROM "Member" m
    LEFT JOIN "Group" g ON m.groupId = g.id
  `).all();
  
  res.json({ success: true, data: members });
}

async function deactivateChama(req, res) {
  const { id } = req.params;
  
  const group = db.prepare('SELECT * FROM "Group" WHERE id = ?').get(id);
  if (!group) throw new AppError('Chama not found', 404);
  
  const newName = group.name.includes('[DEACTIVATED]') ? group.name : `${group.name} [DEACTIVATED]`;
  
  db.prepare('UPDATE "Group" SET name = ?, updatedAt = ? WHERE id = ?').run(
    newName, new Date().toISOString(), id
  );
  
  res.json({ success: true, message: 'Chama deactivated successfully' });
}

async function impersonateGroup(req, res) {
  const { id } = req.params;
  const member = req.user.member;
  
  const group = db.prepare('SELECT * FROM "Group" WHERE id = ?').get(id);
  if (!group) throw new AppError('Chama not found', 404);
  
  // Update superadmin's member record to temporarily link them to this groupId
  db.prepare('UPDATE "Member" SET groupId = ?, updatedAt = ? WHERE id = ?').run(
    id, new Date().toISOString(), member.id
  );
  
  res.json({ success: true, message: 'Now impersonating group: ' + group.name });
}

module.exports = {
  getAllChamas,
  getAllMembers,
  deactivateChama,
  impersonateGroup
};

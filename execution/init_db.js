/**
 * Re-initializes the database from schema.sql.
 * Run this script to create a fresh, encrypted database:
 *   node execution/init_db.js
 *
 * IMPORTANT: The cipher pragmas here MUST match src/config/database.js exactly.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3-multiple-ciphers');

const dbPath = path.resolve(__dirname, '..', 'database', 'chama.db');
const schemaPath = path.resolve(__dirname, 'schema.sql');

// Delete old database if it exists
if (fs.existsSync(dbPath)) {
  console.log('Removing old database:', dbPath);
  fs.unlinkSync(dbPath);
}

// Ensure directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

console.log('Creating new encrypted database at:', dbPath);
const db = new Database(dbPath);

// ─── Set cipher pragmas IDENTICALLY to src/config/database.js ───────────────
db.pragma("cipher = 'sqlcipher'");
db.pragma("key = 'SECRET_KEY'");
db.pragma('cipher_page_size = 4096');
db.pragma('kdf_iter = 64000');
db.pragma('cipher_hmac_algorithm = HMAC_SHA512');
db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
db.pragma('foreign_keys = ON');

// ─── Read schema.sql but SKIP the PRAGMA lines (we handled them above) ──────
const rawSchema = fs.readFileSync(schemaPath, 'utf8');
const schemaWithoutPragmas = rawSchema
  .split('\n')
  .filter(line => !line.trim().toUpperCase().startsWith('PRAGMA'))
  .join('\n');

try {
  db.exec(schemaWithoutPragmas);
  console.log('Schema created successfully.');
} catch (err) {
  console.error('Schema creation failed:', err.message);
  process.exit(1);
}

// Verify tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables created:', tables.map(t => t.name).join(', '));

// ─── Seed initial data ──────────────────────────────────────────────────────
const crypto = require('crypto');
function uuid() { return crypto.randomUUID(); }

function getPastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const now = new Date().toISOString();

try {
  // --- 1. Alpha Chama ---
  const alphaId = 'group_alpha';
  db.prepare(`
    INSERT INTO "Group" (id, name, description, inviteCode, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(alphaId, 'Alpha Chama', 'Our first investment group', 'ALPHA1', '5000', 'MONTHLY', getPastDate(90), now, 'seed');

  const alphaAdmin = 'admin_alpha';
  const alphaTreasurer = 'treasurer_alpha';
  const alphaJohn = 'member_john';
  const alphaJane = 'member_jane';

  const insertMember = db.prepare(`
    INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMember.run(alphaAdmin, alphaId, 'Admin User', '+254111508429', 'admin@alpha.com', 'none', 'ADMIN', '15000', getPastDate(90), now, 'seed');
  insertMember.run(alphaTreasurer, alphaId, 'Treasurer User', '+254700000001', 'treasurer@alpha.com', 'none', 'TREASURER', '15000', getPastDate(90), now, 'seed');
  insertMember.run(alphaJohn, alphaId, 'John Member', '+254700000002', 'john@alpha.com', 'none', 'MEMBER', '15000', getPastDate(90), now, 'seed');
  insertMember.run(alphaJane, alphaId, 'Jane Member', '+254700000003', 'jane@alpha.com', 'none', 'MEMBER', '15000', getPastDate(90), now, 'seed');

  // Seed Contributions (3 months for each)
  const insertTx = db.prepare(`
    INSERT INTO "Transaction" (id, memberId, groupId, loanId, amount, transactionType, description, createdBy, timestamp, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const alphaMembers = [alphaAdmin, alphaTreasurer, alphaJohn, alphaJane];
  const days = [90, 60, 30]; // 3 months of contributions
  for (const mId of alphaMembers) {
    for (const d of days) {
      insertTx.run(uuid(), mId, alphaId, null, '5000', 'CONTRIBUTION', 'Monthly Contribution', alphaTreasurer, getPastDate(d), getPastDate(d), getPastDate(d), 'seed');
    }
  }

  // Seed Loans for Alpha Chama
  const insertLoan = db.prepare(`
    INSERT INTO "Loan" (id, memberId, groupId, principalAmount, interestRate, totalRepayable, amountPaid, dueDate, status, approvedBy, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Active Loan: John
  const loanJohnActive = uuid();
  insertLoan.run(loanJohnActive, alphaJohn, alphaId, '10000', '0.10', '11000', '0', getPastDate(-15), 'ACTIVE', alphaAdmin, getPastDate(15), getPastDate(15), 'seed');

  // Pending Loan: Jane
  const loanJanePending = uuid();
  insertLoan.run(loanJanePending, alphaJane, alphaId, '15000', '0.10', '16500', '0', getPastDate(-30), 'PENDING', null, getPastDate(2), getPastDate(2), 'seed');

  // Overdue Loan: John
  const loanJohnOverdue = uuid();
  insertLoan.run(loanJohnOverdue, alphaJohn, alphaId, '5000', '0.10', '5500', '0', getPastDate(15), 'OVERDUE', alphaAdmin, getPastDate(45), getPastDate(15), 'seed');

  // Paid Loan: Treasurer
  const loanTreasPaid = uuid();
  insertLoan.run(loanTreasPaid, alphaTreasurer, alphaId, '8000', '0.10', '8800', '8800', getPastDate(5), 'PAID', alphaAdmin, getPastDate(25), getPastDate(10), 'seed');
  // Seed repayment transaction for the paid loan
  insertTx.run(uuid(), alphaTreasurer, alphaId, loanTreasPaid, '8800', 'REPAYMENT', 'Loan fully repaid', alphaTreasurer, getPastDate(10), getPastDate(10), getPastDate(10), 'seed');


  // --- 2. Beta Chama ---
  const betaId = 'group_beta';
  db.prepare(`
    INSERT INTO "Group" (id, name, description, inviteCode, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(betaId, 'Beta Chama', 'Second investment group', 'BETA02', '2000', 'WEEKLY', getPastDate(30), now, 'seed');

  const betaAdmin = 'admin_beta';
  const betaTreasurer = 'treasurer_beta';
  const betaMember = 'member_beta';

  insertMember.run(betaAdmin, betaId, 'Beta Admin', '+254711000001', 'admin@beta.com', 'none', 'ADMIN', '8000', getPastDate(30), now, 'seed');
  insertMember.run(betaTreasurer, betaId, 'Beta Treasurer', '+254711000002', 'treasurer@beta.com', 'none', 'TREASURER', '8000', getPastDate(30), now, 'seed');
  insertMember.run(betaMember, betaId, 'Beta Member', '+254711000099', 'member@beta.com', 'none', 'MEMBER', '8000', getPastDate(30), now, 'seed');

  // Seed Contributions (4 weeks for each)
  const betaMembers = [betaAdmin, betaTreasurer, betaMember];
  const betaDays = [28, 21, 14, 7];
  for (const mId of betaMembers) {
    for (const d of betaDays) {
      insertTx.run(uuid(), mId, betaId, null, '2000', 'CONTRIBUTION', 'Weekly Contribution', betaTreasurer, getPastDate(d), getPastDate(d), getPastDate(d), 'seed');
    }
  }

  // Seed Loan for Beta Chama
  // Treasurer Approved Loan (awaiting admin): Beta Member
  const loanBetaPending = uuid();
  insertLoan.run(loanBetaPending, betaMember, betaId, '12000', '0.05', '12600', '0', getPastDate(-14), 'TREASURER_APPROVED', null, getPastDate(3), getPastDate(1), 'seed');

  // --- 3. SuperAdmin ---
  const superAdminId = 'superadmin_1';
  insertMember.run(superAdminId, null, 'Platform SuperAdmin', '+254799000000', 'super@platform.com', 'none', 'SUPERADMIN', '0', getPastDate(1), now, 'seed');

  console.log('Seeded: Alpha Chama (ALPHA1), Beta Chama (BETA02), and Platform SuperAdmin.');
} catch (err) {
  console.error('Seeding failed:', err.message);
}

db.close();
console.log('\nDatabase initialized successfully.\n');

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
  
  // Load environment variables for the secret
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  const AUDIT_SECRET = process.env.AUDIT_SECRET || 'chapter-4-demo-secret';

  function uuid() { return crypto.randomUUID(); }

  function auditSignature(payload) {
    const cleanPayload = { ...payload };
    delete cleanPayload.auditSignature;
    return crypto
      .createHmac('sha256', AUDIT_SECRET)
      .update(JSON.stringify(cleanPayload))
      .digest('hex');
  }

  function getPastDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  }

  const now = new Date().toISOString();

  try {
    // --- 1. Alpha Chama ---
    const alphaId = 'group_alpha';
    const groupAlpha = {
      id: alphaId,
      name: 'Alpha Chama',
      description: 'Our first investment group',
      inviteCode: 'ALPHA1',
      contributionAmount: '5000.00',
      contributionFrequency: 'MONTHLY',
      createdAt: getPastDate(90),
      updatedAt: now
    };
    groupAlpha.auditSignature = auditSignature(groupAlpha);

    db.prepare(`
      INSERT INTO "Group" (id, name, description, inviteCode, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
      VALUES (@id, @name, @description, @inviteCode, @contributionAmount, @contributionFrequency, @createdAt, @updatedAt, @auditSignature)
    `).run(groupAlpha);

    const alphaAdmin = 'admin_alpha';
    const alphaTreasurer = 'treasurer_alpha';
    const alphaJohn = 'member_john';
    const alphaJane = 'member_jane';

    const bcrypt = require('bcrypt');
    const defaultHash = bcrypt.hashSync('123456', 10);

    const insertMember = db.prepare(`
      INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, createdAt, updatedAt, auditSignature)
      VALUES (@id, @groupId, @fullName, @phoneNumber, @email, @passwordHash, @role, @accountBalance, @createdAt, @updatedAt, @auditSignature)
    `);

    const membersToSeed = [
      { id: alphaAdmin, groupId: alphaId, fullName: 'Admin User', phoneNumber: '+254111508429', email: 'admin@alpha.com', passwordHash: defaultHash, role: 'ADMIN', accountBalance: '15000.00', createdAt: getPastDate(90), updatedAt: now },
      { id: alphaTreasurer, groupId: alphaId, fullName: 'Treasurer User', phoneNumber: '+254700000001', email: 'treasurer@alpha.com', passwordHash: defaultHash, role: 'TREASURER', accountBalance: '15000.00', createdAt: getPastDate(90), updatedAt: now },
      { id: alphaJohn, groupId: alphaId, fullName: 'John Member', phoneNumber: '+254700000002', email: 'john@alpha.com', passwordHash: defaultHash, role: 'MEMBER', accountBalance: '15000.00', createdAt: getPastDate(90), updatedAt: now },
      { id: alphaJane, groupId: alphaId, fullName: 'Jane Member', phoneNumber: '+254700000003', email: 'jane@alpha.com', passwordHash: defaultHash, role: 'MEMBER', accountBalance: '15000.00', createdAt: getPastDate(90), updatedAt: now }
    ];

    for (const m of membersToSeed) {
      m.auditSignature = auditSignature(m);
      insertMember.run(m);
    }

    // Seed Contributions (3 months for each)
    const insertTx = db.prepare(`
      INSERT INTO "Transaction" (id, memberId, groupId, loanId, amount, transactionType, description, createdBy, timestamp, createdAt, updatedAt, auditSignature)
      VALUES (@id, @memberId, @groupId, @loanId, @amount, @transactionType, @description, @createdBy, @timestamp, @createdAt, @updatedAt, @auditSignature)
    `);

    function seedTransaction({ memberId, groupId, loanId, amount, transactionType, description, createdBy, daysAgo }) {
      const date = getPastDate(daysAgo);
      const tx = {
        id: uuid(),
        memberId,
        groupId,
        loanId,
        amount: Number(amount).toFixed(2),
        transactionType,
        description,
        createdBy,
        timestamp: date,
        createdAt: date,
        updatedAt: date
      };
      tx.auditSignature = auditSignature(tx);
      insertTx.run(tx);
      return tx;
    }

    const alphaMembers = [alphaAdmin, alphaTreasurer, alphaJohn, alphaJane];
    const days = [90, 60, 30]; // 3 months of contributions
    for (const mId of alphaMembers) {
      for (const d of days) {
        seedTransaction({
          memberId: mId,
          groupId: alphaId,
          loanId: null,
          amount: '5000',
          transactionType: 'CONTRIBUTION',
          description: 'Monthly Contribution',
          createdBy: alphaTreasurer,
          daysAgo: d
        });
      }
    }

    // Seed Loans for Alpha Chama
    const insertLoan = db.prepare(`
      INSERT INTO "Loan" (id, memberId, groupId, principalAmount, interestRate, totalRepayable, amountPaid, dueDate, status, approvedBy, createdAt, updatedAt, auditSignature)
      VALUES (@id, @memberId, @groupId, @principalAmount, @interestRate, @totalRepayable, @amountPaid, @dueDate, @status, @approvedBy, @createdAt, @updatedAt, @auditSignature)
    `);

    function seedLoan({ id, memberId, groupId, principalAmount, interestRate, totalRepayable, amountPaid, dueDate, status, approvedBy, daysAgo }) {
      const date = getPastDate(daysAgo);
      const loan = {
        id,
        memberId,
        groupId,
        principalAmount: Number(principalAmount).toFixed(2),
        interestRate: Number(interestRate).toFixed(4),
        totalRepayable: Number(totalRepayable).toFixed(2),
        amountPaid: Number(amountPaid).toFixed(2),
        dueDate,
        status,
        approvedBy,
        createdAt: date,
        updatedAt: date
      };
      loan.auditSignature = auditSignature(loan);
      insertLoan.run(loan);
      return loan;
    }

    // Active Loan: John
    const loanJohnActive = uuid();
    seedLoan({
      id: loanJohnActive,
      memberId: alphaJohn,
      groupId: alphaId,
      principalAmount: '10000',
      interestRate: '0.10',
      totalRepayable: '11000',
      amountPaid: '0',
      dueDate: getPastDate(-15).slice(0, 10),
      status: 'ACTIVE',
      approvedBy: alphaAdmin,
      daysAgo: 15
    });

    // Pending Loan: Jane
    const loanJanePending = uuid();
    seedLoan({
      id: loanJanePending,
      memberId: alphaJane,
      groupId: alphaId,
      principalAmount: '15000',
      interestRate: '0.10',
      totalRepayable: '16500',
      amountPaid: '0',
      dueDate: getPastDate(-30).slice(0, 10),
      status: 'PENDING',
      approvedBy: null,
      daysAgo: 2
    });

    // Overdue Loan: John
    const loanJohnOverdue = uuid();
    seedLoan({
      id: loanJohnOverdue,
      memberId: alphaJohn,
      groupId: alphaId,
      principalAmount: '5000',
      interestRate: '0.10',
      totalRepayable: '5500',
      amountPaid: '0',
      dueDate: getPastDate(15).slice(0, 10),
      status: 'OVERDUE',
      approvedBy: alphaAdmin,
      daysAgo: 45
    });

    // Paid Loan: Treasurer
    const loanTreasPaid = uuid();
    seedLoan({
      id: loanTreasPaid,
      memberId: alphaTreasurer,
      groupId: alphaId,
      principalAmount: '8000',
      interestRate: '0.10',
      totalRepayable: '8800',
      amountPaid: '8800',
      dueDate: getPastDate(5).slice(0, 10),
      status: 'PAID',
      approvedBy: alphaAdmin,
      daysAgo: 25
    });

    // Seed repayment transaction for the paid loan
    seedTransaction({
      memberId: alphaTreasurer,
      groupId: alphaId,
      loanId: loanTreasPaid,
      amount: '8800',
      transactionType: 'REPAYMENT',
      description: 'Loan fully repaid',
      createdBy: alphaTreasurer,
      daysAgo: 10
    });

    // --- 2. Beta Chama ---
    const betaId = 'group_beta';
    const groupBeta = {
      id: betaId,
      name: 'Beta Chama',
      description: 'Second investment group',
      inviteCode: 'BETA02',
      contributionAmount: '2000.00',
      contributionFrequency: 'WEEKLY',
      createdAt: getPastDate(30),
      updatedAt: now
    };
    groupBeta.auditSignature = auditSignature(groupBeta);

    db.prepare(`
      INSERT INTO "Group" (id, name, description, inviteCode, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
      VALUES (@id, @name, @description, @inviteCode, @contributionAmount, @contributionFrequency, @createdAt, @updatedAt, @auditSignature)
    `).run(groupBeta);

    const betaAdmin = 'admin_beta';
    const betaTreasurer = 'treasurer_beta';
    const betaMember = 'member_beta';

    const betaMembersToSeed = [
      { id: betaAdmin, groupId: betaId, fullName: 'Beta Admin', phoneNumber: '+254711000001', email: 'admin@beta.com', passwordHash: defaultHash, role: 'ADMIN', accountBalance: '8000.00', createdAt: getPastDate(30), updatedAt: now },
      { id: betaTreasurer, groupId: betaId, fullName: 'Beta Treasurer', phoneNumber: '+254711000002', email: 'treasurer@beta.com', passwordHash: defaultHash, role: 'TREASURER', accountBalance: '8000.00', createdAt: getPastDate(30), updatedAt: now },
      { id: betaMember, groupId: betaId, fullName: 'Beta Member', phoneNumber: '+254711000099', email: 'member@beta.com', passwordHash: defaultHash, role: 'MEMBER', accountBalance: '8000.00', createdAt: getPastDate(30), updatedAt: now }
    ];

    for (const m of betaMembersToSeed) {
      m.auditSignature = auditSignature(m);
      insertMember.run(m);
    }

    // Seed Contributions (4 weeks for each)
    const betaMembers = [betaAdmin, betaTreasurer, betaMember];
    const betaDays = [28, 21, 14, 7];
    for (const mId of betaMembers) {
      for (const d of betaDays) {
        seedTransaction({
          memberId: mId,
          groupId: betaId,
          loanId: null,
          amount: '2000',
          transactionType: 'CONTRIBUTION',
          description: 'Weekly Contribution',
          createdBy: betaTreasurer,
          daysAgo: d
        });
      }
    }

    // Seed Loan for Beta Chama
    // Treasurer Approved Loan (awaiting admin): Beta Member
    const loanBetaPending = uuid();
    seedLoan({
      id: loanBetaPending,
      memberId: betaMember,
      groupId: betaId,
      principalAmount: '12000',
      interestRate: '0.05',
      totalRepayable: '12600',
      amountPaid: '0',
      dueDate: getPastDate(-14).slice(0, 10),
      status: 'TREASURER_APPROVED',
      approvedBy: null,
      daysAgo: 3
    });

    // --- 3. SuperAdmin ---
    const superAdminId = 'superadmin_1';
    const superAdmin = {
      id: superAdminId,
      groupId: null,
      fullName: 'Platform SuperAdmin',
      phoneNumber: '+254799000000',
      email: 'super@platform.com',
      passwordHash: defaultHash,
      role: 'SUPERADMIN',
      accountBalance: '0.00',
      createdAt: getPastDate(1),
      updatedAt: now
    };
    superAdmin.auditSignature = auditSignature(superAdmin);
    insertMember.run(superAdmin);

    console.log('Seeded: Alpha Chama (ALPHA1), Beta Chama (BETA02), and Platform SuperAdmin.');
  } catch (err) {
    console.error('Seeding failed:', err.message);
  }

  db.close();
  console.log('\nDatabase initialized successfully.\n');

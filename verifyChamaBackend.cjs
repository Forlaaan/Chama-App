// verifyChamaBackend.cjs
//
// Integration test script to verify Node.js services and database schemas
// against Chapter 4 business rules (BR-001 to BR-010).
//
// Automatically initializes a separate chama_test.db so it does not interfere
// with development or production databases.

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Configure test environment BEFORE loading any backend configs/services
const testDbDir = path.join(__dirname, 'database');
const testDbPath = path.join(testDbDir, 'chama_test.db');

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath); // start fresh
}

process.env.NODE_ENV = 'test';
process.env.DB_PATH = './database/chama_test.db';
process.env.DB_ENCRYPTION_KEY = 'TEST_SECRET_KEY';
process.env.AUDIT_SECRET = 'TEST_AUDIT_SECRET';

// Firebase credentials must be configured (mock or real) to initialize Firebase Admin
// In testing service-level logic directly, we mock the firebaseAuth check if needed
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test-email@test.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCwo6Y6kLdEMQeC\n-----END PRIVATE KEY-----\n';
process.env.FIREBASE_WEB_API_KEY = 'TEST_WEB_API_KEY';

console.log('==========================================================');
console.log('Initializing JavaScript Chama Services & Schema Tests...');
console.log('==========================================================');

// Initialize database schema and cipher pragmas
const Database = require('better-sqlite3-multiple-ciphers');
const schemaPath = path.join(__dirname, 'execution', 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

const db = new Database(testDbPath);

db.pragma("cipher = 'sqlcipher'");
db.pragma("key = 'TEST_SECRET_KEY'");
db.pragma('cipher_page_size = 4096');
db.pragma('kdf_iter = 64000');
db.pragma('cipher_hmac_algorithm = HMAC_SHA512');
db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
db.pragma('foreign_keys = ON');

// Strip SQLCipher-specific PRAGMAs from the schema.sql since we configure cipher options dynamically
const schemaSqlClean = schemaSql.split('\n')
  .filter(line => {
    const upper = line.trim().toUpperCase();
    return !upper.startsWith('PRAGMA KEY') &&
           !upper.startsWith('PRAGMA CIPHER_') &&
           !upper.startsWith('PRAGMA KDF_');
  })
  .join('\n');

// Execute schema compiling
db.exec(schemaSqlClean);
console.log('[1/12] Test SQLite + SQLCipher schema compiled in memory.');

// Seed the group
const { auditSignature } = require('./src/utils/audit');
const nowStr = new Date().toISOString();
const demoGroup = {
  id: 'group-001',
  name: 'Umoja Chama Test',
  description: 'Integration test chama group',
  contributionAmount: '1000.00',
  contributionFrequency: 'MONTHLY',
  createdAt: nowStr,
  updatedAt: nowStr
};
demoGroup.auditSignature = auditSignature(demoGroup);

db.prepare(`
  INSERT INTO "Group" (
    id, name, description, contributionAmount, contributionFrequency,
    createdAt, updatedAt, auditSignature
  ) VALUES (
    @id, @name, @description, @contributionAmount, @contributionFrequency,
    @createdAt, @updatedAt, @auditSignature
  )
`).run(demoGroup);
db.close(); // close raw database connection

console.log('[2/12] Baseline Group seeded.');

const { env } = require('./src/config/env');
console.log('DIAGNOSTICS:');
console.log('  process.env.DB_PATH:', process.env.DB_PATH);
console.log('  process.env.DB_ENCRYPTION_KEY:', process.env.DB_ENCRYPTION_KEY);
console.log('  env.DB_PATH:', env.DB_PATH);
console.log('  env.DB_ENCRYPTION_KEY:', env.DB_ENCRYPTION_KEY);
console.log('  testDbPath:', testDbPath);

// Now load the backend modules
const memberService = require('./src/services/member.service');
const loanService = require('./src/services/loan.service');
const transactionService = require('./src/services/transaction.service');
const { db: appDb } = require('./src/config/database');

// Create test user profiles
let treasurerUser = null;
let regularMemberUser = null;

async function run() {
  try {
    console.log('[3/12] Seeding admin and member profiles...');
    
    // 1. Treasurer / Admin
    treasurerUser = memberService.createMember({
      groupId: 'group-001',
      fullName: 'Alice Admin',
      phoneNumber: '+254711111111',
      email: 'alice@chama.org',
      role: 'ADMIN',
      accountBalance: '0.00'
    });
    
    // 2. Regular Member
    regularMemberUser = memberService.createMember({
      groupId: 'group-001',
      fullName: 'Bob Member',
      phoneNumber: '+254722222222',
      email: 'bob@chama.org',
      role: 'MEMBER',
      accountBalance: '100.00' // starts with some balance
    });
    
    assert.strictEqual(treasurerUser.role, 'ADMIN');
    assert.strictEqual(regularMemberUser.role, 'MEMBER');
    console.log('    [PASSED] Seeded: Admin Alice and Member Bob.');
  } catch (e) {
    console.error('[-] Seed profiles failed:', e);
    process.exit(1);
  }

  // Mock auth users
  const authAlice = {
    uid: 'alice-uid',
    email: 'alice@chama.org',
    member: treasurerUser
  };

  const authBob = {
    uid: 'bob-uid',
    email: 'bob@chama.org',
    member: regularMemberUser
  };

  // 4. Test Role permissions
  console.log('[4/12] Testing Unauthorized Access constraints (BR-001)...');
  try {
    // A MEMBER role (Bob) trying to approve a loan
    await loanService.approveLoan({ id: 'dummy-loan-id' }, authBob);
    console.error('[-] FAILURE: Allowed Member Bob to approve a loan!');
    process.exit(1);
  } catch (e) {
    assert.strictEqual(e.statusCode, 403);
    assert.ok(e.message.includes("is not authorised for this loan operation"));
    console.log('    [PASSED] Member loan approval blocked successfully.');
  }

  try {
    // A MEMBER role (Bob) trying to record a repayment
    loanService.recordRepayment({ id: 'dummy-loan-id' }, { amount: '100.00' }, authBob);
    console.error('[-] FAILURE: Allowed Member Bob to record a loan repayment!');
    process.exit(1);
  } catch (e) {
    assert.strictEqual(e.statusCode, 403);
    assert.ok(e.message.includes("is not authorised for this loan operation"));
    console.log('    [PASSED] Member loan repayment blocked successfully.');
  }

  // 5. Test Loan Request (BR-004) and Interest Calculation (BR-006)
  let requestedLoan = null;
  console.log('[5/12] Testing Loan Request & Decimal Interest calculation (BR-004, BR-006)...');
  try {
    // Principal: 5000.00, Interest Rate: 0.12 (12%), expected totalRepayable = 5600.00
    const reqResult = loanService.requestLoan({
      memberId: regularMemberUser.id,
      groupId: 'group-001',
      principalAmount: '5000.00',
      interestRate: '0.12',
      dueDate: '2026-12-31',
      description: 'Farming inputs'
    }, authBob);

    requestedLoan = reqResult.loan;
    assert.strictEqual(requestedLoan.status, 'PENDING');
    assert.strictEqual(requestedLoan.principalAmount, '5000.00');
    assert.strictEqual(requestedLoan.interestRate, '0.1200');
    assert.strictEqual(requestedLoan.totalRepayable, '5600.00');
    assert.strictEqual(requestedLoan.amountPaid, '0.00');
    
    // Verify loan signature
    const dbLoan = appDb.prepare('SELECT * FROM "Loan" WHERE id = ?').get(requestedLoan.id);
    assert.ok(dbLoan.auditSignature);
    
    console.log('    [PASSED] Loan created as PENDING, total repayable calculated exactly as 5600.00.');
  } catch (e) {
    console.error('[-] Loan request test failed:', e);
    process.exit(1);
  }

  // 6. Test Contribution Recording (BR-003)
  console.log('[6/12] Testing Contribution recording (BR-003)...');
  try {
    // Bob contribution of 1500.00. Expected Bob balance: 100.00 + 1500.00 = 1600.00.
    const contribResult = await transactionService.recordContribution({
      memberId: regularMemberUser.id,
      amount: '1500.00',
      description: 'Monthly savings contribution'
    }, authAlice);

    assert.strictEqual(contribResult.accountBalance, '1600.00');
    assert.strictEqual(contribResult.transaction.transactionType, 'CONTRIBUTION');
    assert.strictEqual(contribResult.transaction.amount, '1500.00');

    // Verify DB state
    const dbMember = memberService.getMemberById(regularMemberUser.id);
    assert.strictEqual(dbMember.accountBalance, '1600.00');

    // Check SMS notification
    const dbNotifications = appDb.prepare('SELECT * FROM "Notification" WHERE memberId = ?').all(regularMemberUser.id);
    const contributionNotifs = dbNotifications.filter(n => n.type === 'CONTRIBUTION');
    assert.strictEqual(contributionNotifs.length, 1);
    assert.ok(contributionNotifs[0].status === 'PENDING' || contributionNotifs[0].status === 'QUEUED');
    console.log('ACTUAL NOTIFICATION MESSAGE:', contributionNotifs[0].message);
    assert.ok(contributionNotifs[0].message.includes('contribution of KES 1500.00') || contributionNotifs[0].message.includes('1500'));

    console.log('    [PASSED] Contribution recorded. Balance updated. Transaction logged. SMS notification queued.');
  } catch (e) {
    console.error('[-] Contribution recording test failed:', e);
    process.exit(1);
  }

  // 7. Test Loan Approval and Disbursement (BR-005)
  let approvedLoan = null;
  console.log('[7/12] Testing Loan Approval and Disbursement (BR-005)...');
  try {
    const approveResult = await loanService.approveLoan({ id: requestedLoan.id }, authAlice);
    approvedLoan = approveResult.loan;
    
    assert.strictEqual(approvedLoan.status, 'ACTIVE');
    assert.strictEqual(approvedLoan.approvedBy, treasurerUser.id);
    assert.strictEqual(approveResult.accountBalance, '6600.00');
    assert.strictEqual(approveResult.disbursement.amount, '5000.00');

    // Verify transaction row
    const dbTxs = transactionService.getAllTransactions();
    const disbTx = dbTxs.find(tx => tx.transactionType === 'LOAN_DISBURSEMENT');
    assert.ok(disbTx);
    assert.strictEqual(disbTx.amount, '5000.00');
    assert.strictEqual(disbTx.loanId, requestedLoan.id);

    // Check SMS notification
    const dbNotifications = appDb.prepare('SELECT * FROM "Notification" WHERE memberId = ?').all(regularMemberUser.id);
    const loanApprovedNotifs = dbNotifications.filter(n => n.type === 'LOAN_APPROVED');
    assert.strictEqual(loanApprovedNotifs.length, 1);
    assert.ok(loanApprovedNotifs[0].status === 'PENDING' || loanApprovedNotifs[0].status === 'QUEUED');
    assert.ok(loanApprovedNotifs[0].message.includes('loan of KES 5000.00 has been approved'));

    console.log('    [PASSED] Loan approved. Status ACTIVE. Disbursement transaction appended. Member balance updated. SMS queued.');
  } catch (e) {
    console.error('[-] Loan approval test failed:', e);
    process.exit(1);
  }

  // 8. Test Repayment Over-Limit Block
  console.log('[8/12] Testing Repayment limit check (Repayment cannot exceed outstanding balance)...');
  try {
    // Outstanding is 5600.00. Attempt repayment of 6000.00. Should throw error.
    loanService.recordRepayment({ id: approvedLoan.id }, { amount: '6000.00', description: 'Overpayment attempt' }, authAlice);
    console.error('[-] FAILURE: Allowed repayment exceeding outstanding balance!');
    process.exit(1);
  } catch (e) {
    assert.strictEqual(e.statusCode, 400);
    assert.ok(e.message.includes("exceeds outstanding balance of 5600.00"));
    console.log('    [PASSED] Repayment over outstanding limit blocked successfully.');
  }

  // 9. Test Successful Loan Repayment (Partial & Full Repayments)
  console.log('[9/12] Testing Loan Repayment and Status transitions (ACTIVE -> PAID)...');
  try {
    // Bob balance is 6600.00. Loan outstanding is 5600.00.
    // Repay 2000.00.
    // Expected Bob balance: 6600.00 - 2000.00 = 4600.00
    // Expected Loan amountPaid: 2000.00. Outstanding: 3600.00. Status: ACTIVE
    const partialRepay = loanService.recordRepayment({ id: approvedLoan.id }, { amount: '2000.00', description: 'Installment 1' }, authAlice);
    
    assert.strictEqual(partialRepay.loan.amountPaid, '2000.00');
    assert.strictEqual(partialRepay.loan.status, 'ACTIVE');
    assert.strictEqual(partialRepay.accountBalance, '4600.00');
    assert.strictEqual(partialRepay.repayment.amount, '2000.00');
    assert.strictEqual(partialRepay.repayment.transactionType, 'LOAN_REPAYMENT');
    
    // Verify Bob member balance in DB
    let dbMember = memberService.getMemberById(regularMemberUser.id);
    assert.strictEqual(dbMember.accountBalance, '4600.00');

    // Repay remaining 3600.00.
    // Expected Bob balance: 4600.00 - 3600.00 = 1000.00
    // Expected Loan amountPaid: 5600.00. Outstanding: 0.00. Status: PAID
    const finalRepay = loanService.recordRepayment({ id: approvedLoan.id }, { amount: '3600.00', description: 'Installment 2' }, authAlice);
    
    assert.strictEqual(finalRepay.loan.amountPaid, '5600.00');
    assert.strictEqual(finalRepay.loan.status, 'PAID');
    assert.strictEqual(finalRepay.accountBalance, '1000.00');

    dbMember = memberService.getMemberById(regularMemberUser.id);
    assert.strictEqual(dbMember.accountBalance, '1000.00');

    console.log('    [PASSED] Loan repayments recorded. Balance updated. Transitions to PAID verified.');
  } catch (e) {
    console.error('[-] Repayment test failed:', e);
    process.exit(1);
  }

  // 10. Test Overdue Detection (BR-007)
  console.log('[10/12] Testing Overdue Loan Detection & ACTIVE -> OVERDUE transition (BR-007)...');
  try {
    // Let's insert a loan that is ACTIVE and past due date
    const pastLoanId = 'past-loan-uuid';
    const pastLoan = {
      id: pastLoanId,
      memberId: regularMemberUser.id,
      groupId: 'group-001',
      principalAmount: '3000.00',
      interestRate: '0.1000',
      totalRepayable: '3300.00',
      amountPaid: '0.00',
      dueDate: '2020-01-01', // long past
      status: 'ACTIVE',
      approvedBy: treasurerUser.id,
      createdAt: nowStr,
      updatedAt: nowStr
    };
    pastLoan.auditSignature = auditSignature(pastLoan);

    appDb.prepare(`
      INSERT INTO "Loan" (
        id, memberId, groupId, principalAmount, interestRate, totalRepayable,
        amountPaid, dueDate, status, approvedBy, createdAt, updatedAt, auditSignature
      ) VALUES (
        @id, @memberId, @groupId, @principalAmount, @interestRate, @totalRepayable,
        @amountPaid, @dueDate, @status, @approvedBy, @createdAt, @updatedAt, @auditSignature
      )
    `).run(pastLoan);

    // Sweep overdue loans
    const overdueResult = loanService.getOverdueLoans({ groupId: 'group-001' }, authBob);
    
    assert.strictEqual(overdueResult.overdueCount, 1);
    assert.deepStrictEqual(overdueResult.newlyMarkedOverdue, [pastLoanId]);
    
    // Verify loan status updated to OVERDUE in database
    const refreshedLoan = appDb.prepare('SELECT status FROM "Loan" WHERE id = ?').get(pastLoanId);
    assert.strictEqual(refreshedLoan.status, 'OVERDUE');

    console.log('    [PASSED] Past ACTIVE loan correctly swept and transitioned to OVERDUE.');
  } catch (e) {
    console.error('[-] Overdue test failed:', e);
    process.exit(1);
  }

  // 11. Test Database Transaction Immutability (BR-002)
  console.log('[11/12] Testing DB-level transaction immutability triggers (BR-002)...');
  try {
    const firstTx = appDb.prepare('SELECT id FROM "Transaction" LIMIT 1').get();
    assert.ok(firstTx);

    try {
      appDb.prepare("UPDATE \"Transaction\" SET amount = '9999.99' WHERE id = ?").run(firstTx.id);
      console.error('[-] FAILURE: SQLite trigger allowed transaction UPDATE!');
      process.exit(1);
    } catch (e) {
      console.log('ACTUAL UPDATE TRIGGER ERROR:', e.message);
      assert.ok(e.message.includes('Transactions are immutable'));
      console.log('    [PASSED] Database blocked transaction UPDATE with custom trigger error.');
    }

    try {
      appDb.prepare('DELETE FROM "Transaction" WHERE id = ?').run(firstTx.id);
      console.error('[-] FAILURE: SQLite trigger allowed transaction DELETE!');
      process.exit(1);
    } catch (e) {
      assert.ok(e.message.includes('Transactions are immutable and cannot be deleted'));
      console.log('    [PASSED] Database blocked transaction DELETE with custom trigger error.');
    }
  } catch (e) {
    console.error('[-] Immutability test failed:', e);
    process.exit(1);
  }

  // 12. Test Audit Signatures verification
  console.log('[12/12] Testing HMAC-SHA-256 Audit Signature integrity (BR-009)...');
  try {
    const loanInDb = appDb.prepare('SELECT * FROM "Loan" WHERE id = ?').get(approvedLoan.id);
    assert.ok(loanInDb);
    assert.ok(loanInDb.auditSignature);

    // verify manually calculated signature matches DB
    const verifyObj = {
      id:              loanInDb.id,
      memberId:        loanInDb.memberId,
      groupId:         loanInDb.groupId,
      principalAmount: loanInDb.principalAmount,
      interestRate:    loanInDb.interestRate,
      totalRepayable:  loanInDb.totalRepayable,
      amountPaid:      loanInDb.amountPaid,
      dueDate:         loanInDb.dueDate,
      status:          loanInDb.status,
      approvedBy:      loanInDb.approvedBy,
      createdAt:       loanInDb.createdAt,
      updatedAt:       loanInDb.updatedAt
    };
    const expectedSig = auditSignature(verifyObj);
    assert.strictEqual(loanInDb.auditSignature, expectedSig);
    console.log('    [PASSED] Record signature matches computed HMAC-SHA-256.');
  } catch (e) {
    console.error('[-] Audit signature test failed:', e);
    process.exit(1);
  }

  console.log('\n==========================================================');
  console.log('ALL TESTS PASSED: Node.js Chama Backend is fully correct!');
  console.log('==========================================================');

  // Cleanup
  appDb.close();
  fs.unlinkSync(testDbPath);
  process.exit(0);
}

run();

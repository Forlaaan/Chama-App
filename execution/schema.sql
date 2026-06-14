-- execution/schema.sql
PRAGMA key = 'SECRET_KEY';
PRAGMA cipher_page_size = 4096;
PRAGMA kdf_iter = 64000;
PRAGMA cipher_hmac_algorithm = HMAC_SHA512;
PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Group" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    contributionAmount TEXT NOT NULL,
    contributionFrequency TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    auditSignature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Member" (
    id TEXT PRIMARY KEY,
    groupId TEXT NOT NULL,
    fullName TEXT NOT NULL,
    phoneNumber TEXT NOT NULL,
    email TEXT,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL,
    accountBalance TEXT NOT NULL,
    deviceToken TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    auditSignature TEXT NOT NULL,
    FOREIGN KEY (groupId) REFERENCES "Group"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Transaction" (
    id TEXT PRIMARY KEY,
    memberId TEXT NOT NULL,
    groupId TEXT NOT NULL,
    loanId TEXT,
    amount TEXT NOT NULL,
    transactionType TEXT NOT NULL,
    description TEXT,
    createdBy TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    auditSignature TEXT NOT NULL,
    FOREIGN KEY (memberId) REFERENCES "Member"(id) ON DELETE RESTRICT,
    FOREIGN KEY (groupId) REFERENCES "Group"(id) ON DELETE RESTRICT,
    FOREIGN KEY (loanId) REFERENCES "Loan"(id) ON DELETE RESTRICT,
    FOREIGN KEY (createdBy) REFERENCES "Member"(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Loan" (
    id TEXT PRIMARY KEY,
    memberId TEXT NOT NULL,
    groupId TEXT NOT NULL,
    principalAmount TEXT NOT NULL,
    interestRate TEXT NOT NULL,
    totalRepayable TEXT NOT NULL,
    amountPaid TEXT NOT NULL,
    dueDate TEXT NOT NULL,
    status TEXT NOT NULL,
    approvedBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    auditSignature TEXT NOT NULL,
    FOREIGN KEY (memberId) REFERENCES "Member"(id) ON DELETE RESTRICT,
    FOREIGN KEY (groupId) REFERENCES "Group"(id) ON DELETE RESTRICT,
    FOREIGN KEY (approvedBy) REFERENCES "Member"(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Notification" (
    id TEXT PRIMARY KEY,
    memberId TEXT NOT NULL,
    phoneNumber TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    sentAt TEXT,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    auditSignature TEXT NOT NULL,
    FOREIGN KEY (memberId) REFERENCES "Member"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Penalty" (
    id TEXT PRIMARY KEY,
    memberId TEXT NOT NULL,
    amount TEXT NOT NULL,
    reason TEXT NOT NULL,
    appliedAt TEXT NOT NULL,
    settled INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    auditSignature TEXT NOT NULL,
    FOREIGN KEY (memberId) REFERENCES "Member"(id) ON DELETE RESTRICT
);

-- Offline Queue: pending_notifications stores outgoing SMS messages
-- when the device is offline. SyncWorker drains this queue on connectivity
-- restoration, applying exponential backoff on API failures (BR-010).
CREATE TABLE IF NOT EXISTS "pending_notifications" (
    id TEXT PRIMARY KEY,
    notificationId TEXT NOT NULL,
    phoneNumber TEXT NOT NULL,
    message TEXT NOT NULL,
    retryCount INTEGER NOT NULL DEFAULT 0,
    nextRetryAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (notificationId) REFERENCES "Notification"(id) ON DELETE CASCADE
);

-- Triggers to enforce Immutability on Transaction table (BR-002)
CREATE TRIGGER IF NOT EXISTS prevent_transaction_update
BEFORE UPDATE ON "Transaction"
BEGIN
    SELECT RAISE(FAIL, 'Transactions are immutable and cannot be updated.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_transaction_delete
BEFORE DELETE ON "Transaction"
BEGIN
    SELECT RAISE(FAIL, 'Transactions are immutable and cannot be deleted.');
END;


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
console.log('\nSeeding initial data...');
const now = new Date().toISOString();
const groupId = 'group_001';
const adminId = 'admin_001';
const treasurerId = 'treasurer_001';

try {
  db.prepare(`
    INSERT INTO "Group" (id, name, description, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, 'Alpha Chama', 'Our first investment group', '5000', 'MONTHLY', now, now, 'seed');

  db.prepare(`
    INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(adminId, groupId, 'Admin User', '+254111508429', 'admin@chamahub.com', 'none', 'ADMIN', '0', now, now, 'seed');

  db.prepare(`
    INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, createdAt, updatedAt, auditSignature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(treasurerId, groupId, 'Treasurer User', '+254700000001', 'treasurer@chamahub.com', 'none', 'TREASURER', '0', now, now, 'seed');

  console.log('Seeded: Group "Alpha Chama", Admin (+254111508429), Treasurer (+254700000001)');
} catch (err) {
  console.error('Seeding failed:', err.message);
}

db.close();
console.log('\nDatabase initialized successfully.');

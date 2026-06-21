const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3-multiple-ciphers');

const rootDir = __dirname;
const databaseDir = path.join(rootDir, 'database');
const databasePath = path.join(databaseDir, 'chama.db');
const schemaPath = path.join(rootDir, 'execution', 'schema.sql');
const encryptionKey = process.env.DB_ENCRYPTION_KEY || 'SECRET_KEY';

function auditSignature(payload) {
  return crypto
    .createHmac('sha256', process.env.AUDIT_SECRET || 'chapter-4-demo-secret')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function applyCipherPragmas(db) {
  db.pragma("cipher = 'sqlcipher'");
  db.pragma(`key = '${encryptionKey.replace(/'/g, "''")}'`);
  db.pragma('cipher_page_size = 4096');
  db.pragma('kdf_iter = 64000');
  db.pragma('cipher_hmac_algorithm = HMAC_SHA512');
  db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
  db.pragma('foreign_keys = ON');
}

function main() {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  fs.mkdirSync(databaseDir, { recursive: true });

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const db = new Database(databasePath);

  try {
    applyCipherPragmas(db);
    db.exec(schemaSql);

    const now = new Date().toISOString();
    const demoGroup = {
      id: 'group-001',
      name: 'Umoja Chama',
      description: 'Chapter 4 demo chama group',
      contributionAmount: '1000.00',
      contributionFrequency: 'MONTHLY',
      createdAt: now,
      updatedAt: now
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
      ON CONFLICT(id) DO NOTHING
    `).run(demoGroup);

    console.log(`Database initialized successfully at ${databasePath}`);
    console.log('Demo group ready: group-001');
  } finally {
    db.close();
  }
}

main();

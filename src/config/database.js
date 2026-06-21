const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');
const { env } = require('./env');

const dbPath = path.resolve(env.DB_PATH);
const db = new Database(dbPath);

db.pragma("cipher = 'sqlcipher'");
db.pragma(`key = '${env.DB_ENCRYPTION_KEY.replace(/'/g, "''")}'`);
db.pragma('cipher_page_size = 4096');
db.pragma('kdf_iter = 64000');
db.pragma('cipher_hmac_algorithm = HMAC_SHA512');
db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
db.pragma('foreign_keys = ON');

module.exports = { db };

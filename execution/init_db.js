/**
 * Re-initializes the database from schema.sql.
 * Run this script to create a fresh, encrypted database:
 *   node execution/init_db.js
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

// Read and execute the schema (which includes the PRAGMA key etc.)
const schema = fs.readFileSync(schemaPath, 'utf8');

// Split on semicolons and execute each statement
const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
for (const stmt of statements) {
  try {
    db.exec(stmt);
  } catch (err) {
    console.error('Failed executing:', stmt.slice(0, 80));
    console.error(err.message);
  }
}

// Verify by listing tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables created:', tables.map(t => t.name).join(', '));

db.close();
console.log('Database initialized successfully.');

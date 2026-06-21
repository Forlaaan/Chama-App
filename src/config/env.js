require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  PORT: Number(process.env.PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_PATH: required('DB_PATH', './database/chama.db'),
  DB_ENCRYPTION_KEY: required('DB_ENCRYPTION_KEY'),
  FIREBASE_PROJECT_ID: required('FIREBASE_PROJECT_ID'),
  FIREBASE_CLIENT_EMAIL: required('FIREBASE_CLIENT_EMAIL'),
  FIREBASE_PRIVATE_KEY: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  FIREBASE_WEB_API_KEY: required('FIREBASE_WEB_API_KEY'),
  AT_USERNAME: process.env.AT_USERNAME || 'sandbox',
  AT_API_KEY: process.env.AT_API_KEY || '',
  AT_SENDER_ID: process.env.AT_SENDER_ID || '',
  AUDIT_SECRET: process.env.AUDIT_SECRET || 'chapter-4-demo-secret'
};

module.exports = { env };

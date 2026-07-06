require('dotenv').config(); const { db } = require('./src/config/database'); console.log(db.prepare('SELECT id, fullName, role, passwordHash FROM Member').all());

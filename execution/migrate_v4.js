const { db } = require('../src/config/database');

try {
  db.exec('ALTER TABLE "Member" ADD COLUMN status TEXT DEFAULT "ACTIVE"');
  console.log('Member table updated.');
} catch (e) {
  console.log('Member: ' + e.message);
}

try {
  db.exec('ALTER TABLE "Penalty" ADD COLUMN status TEXT DEFAULT "PENDING"');
  db.exec('ALTER TABLE "Penalty" ADD COLUMN approvedBy TEXT');
  console.log('Penalty table updated.');
} catch (e) {
  console.log('Penalty: ' + e.message);
}

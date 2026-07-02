const path = require('path');
const { db } = require(path.resolve(__dirname, '..', 'src', 'config', 'database'));

console.log('=== Database Health Check ===\n');

// 1. Check tables exist
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// 2. Check members
const members = db.prepare('SELECT * FROM "Member"').all();
console.log('\nMembers (' + members.length + '):');
members.forEach(m => {
  console.log(`  - ${m.fullName} | phone: ${m.phoneNumber} | role: ${m.role} | groupId: ${m.groupId}`);
});

// 3. Check groups
const groups = db.prepare('SELECT * FROM "Group"').all();
console.log('\nGroups (' + groups.length + '):');
groups.forEach(g => {
  console.log(`  - ${g.name} | id: ${g.id}`);
});

// 4. Check if member phone matches the Firebase test phone
const testPhone = '+254111508429';
const match = members.find(m => m.phoneNumber === testPhone);
console.log('\nPhone match for', testPhone, ':', match ? `YES (${match.fullName}, role: ${match.role})` : 'NO MATCH - LOGIN WILL FAIL!');

// 5. Quick Firebase Admin SDK check
try {
  const { firebaseAdmin } = require(path.resolve(__dirname, '..', 'src', 'config', 'firebase'));
  console.log('\nFirebase Admin SDK initialized:', firebaseAdmin.apps.length > 0 ? 'YES' : 'NO');
  console.log('Project ID:', firebaseAdmin.app().options.credential.projectId || 'unknown');
} catch (e) {
  console.error('\nFirebase Admin SDK ERROR:', e.message);
}

db.close();
console.log('\n=== Health Check Complete ===');

# Chama Governance Backend

Node.js + Express.js backend for the Mobile-Based Governance System for Transparency in Kenyan Chamas. This implementation focuses on the four Chapter 4 demonstration modules:

- Authentication through Firebase Authentication only
- Members
- Transactions
- Notifications through Africa's Talking SMS

The backend uses the existing SQLite + SQLCipher schema with the quoted tables `"Group"`, `"Member"`, `"Transaction"`, `"Loan"`, `"Notification"`, and `"pending_notifications"`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DB_PATH` to the existing encrypted database file.
3. Set `DB_ENCRYPTION_KEY` to the SQLCipher key used by the database.
4. Add Firebase Admin credentials and the Firebase Web API key.
5. Add Africa's Talking credentials for SMS.
6. Install dependencies and start:

```bash
npm install
npm run dev
```

## Environment Variables

```env
PORT=4000
DB_PATH=./database/chama.db
DB_ENCRYPTION_KEY=SECRET_KEY
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@example.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_WEB_API_KEY=your-firebase-web-api-key
AT_USERNAME=sandbox
AT_API_KEY=your-africastalking-api-key
AT_SENDER_ID=
AUDIT_SECRET=chapter-4-demo-secret
```

## Authentication Flow

Authentication is handled by Firebase. The backend does not compare or store user passwords. The `Member.passwordHash` column is populated with `FIREBASE_AUTH_ONLY` only because the existing schema marks the column as required.

Use the `idToken` returned by Firebase login or registration as:

```http
Authorization: Bearer <firebase-id-token>
```

Member and transaction endpoints are protected by Firebase token verification middleware.

## REST Endpoints

### Auth

`POST /api/auth/register`

```json
{
  "email": "treasurer@example.com",
  "password": "StrongPass123",
  "fullName": "Mary Wanjiku",
  "phoneNumber": "+254700000001",
  "groupId": "group-001",
  "role": "TREASURER"
}
```

`POST /api/auth/login`

```json
{
  "email": "treasurer@example.com",
  "password": "StrongPass123"
}
```

`GET /api/auth/profile`

Requires Firebase bearer token.

`POST /api/auth/verify-token`

```json
{
  "idToken": "<firebase-id-token>"
}
```

### Members

All member routes require a Firebase bearer token.

`POST /api/members`

```json
{
  "groupId": "group-001",
  "fullName": "John Mwangi",
  "phoneNumber": "+254700000002",
  "email": "john@example.com",
  "role": "MEMBER",
  "accountBalance": "0.00",
  "deviceToken": "mobile-device-token"
}
```

`GET /api/members`

`GET /api/members/:id`

`PATCH /api/members/:id`

```json
{
  "fullName": "John K. Mwangi",
  "phoneNumber": "+254700000002",
  "role": "MEMBER"
}
```

`GET /api/members/:id/balance`

Example response:

```json
{
  "success": true,
  "data": {
    "memberId": "member-id-here",
    "fullName": "John Mwangi",
    "accountBalance": "1000.00"
  }
}
```

`GET /api/members/:id/contributions`

### Transactions

All transaction routes require a Firebase bearer token. The authenticated Firebase user must be linked to a `Member` row by matching `Member.email`, `Member.phoneNumber`, or `Member.id`.

`POST /api/transactions/contributions`

```json
{
  "memberId": "member-id-here",
  "amount": "1000.00",
  "description": "June monthly contribution"
}
```

Example response:

```json
{
  "success": true,
  "message": "Contribution recorded, member balance updated, and SMS notification triggered",
  "data": {
    "transaction": {
      "id": "transaction-id",
      "memberId": "member-id-here",
      "groupId": "group-001",
      "amount": "1000.00",
      "transactionType": "CONTRIBUTION",
      "description": "June monthly contribution"
    },
    "accountBalance": "1000.00",
    "notification": {
      "smsResult": {
        "status": "SENT"
      }
    }
  }
}
```

Successful contribution behavior:

1. Firebase token is verified.
2. Treasurer/Admin member is identified.
3. Target member is validated.
4. A `"Transaction"` row is inserted with `transactionType = 'CONTRIBUTION'`.
5. The target `"Member".accountBalance` is increased.
6. An Africa's Talking SMS notification is sent or queued.
7. A `"Notification"` row is created.

`POST /api/transactions/repayments`

```json
{
  "memberId": "member-id-here",
  "loanId": "loan-id-optional",
  "amount": "500.00",
  "description": "Loan repayment"
}
```

`GET /api/transactions`

`GET /api/transactions/member/:memberId`

### Notifications

`POST /api/notifications/sms/test`

```json
{
  "phoneNumber": "+254700000002",
  "message": "Test SMS from Chama Governance System"
}
```

## Demo Database Queries

Run these through a SQLCipher-compatible SQLite client after setting the key.

```sql
PRAGMA key = 'SECRET_KEY';
PRAGMA foreign_keys = ON;
```

Create a demo group if one does not exist:

```sql
INSERT INTO "Group" (
  id, name, description, contributionAmount, contributionFrequency,
  createdAt, updatedAt, auditSignature
) VALUES (
  'group-001', 'Umoja Chama', 'Chapter 4 demo chama', '1000.00', 'MONTHLY',
  datetime('now'), datetime('now'), 'manual-demo-signature'
);
```

Inspect members:

```sql
SELECT id, groupId, fullName, phoneNumber, email, role, accountBalance
FROM "Member"
ORDER BY createdAt DESC;
```

Inspect a member balance:

```sql
SELECT id, fullName, accountBalance
FROM "Member"
WHERE id = 'member-id-here';
```

Inspect the ledger:

```sql
SELECT id, memberId, groupId, amount, transactionType, description, createdBy, timestamp
FROM "Transaction"
ORDER BY timestamp DESC;
```

Inspect contribution history:

```sql
SELECT id, amount, description, timestamp
FROM "Transaction"
WHERE memberId = 'member-id-here'
  AND transactionType = 'CONTRIBUTION'
ORDER BY timestamp DESC;
```

Inspect notifications:

```sql
SELECT id, memberId, phoneNumber, type, message, status, sentAt
FROM "Notification"
ORDER BY createdAt DESC;
```

Inspect queued SMS messages:

```sql
SELECT id, notificationId, phoneNumber, retryCount, nextRetryAt, status
FROM "pending_notifications"
ORDER BY createdAt DESC;
```

## Presentation Script

1. Start the backend.
2. Use Postman to register or login through Firebase.
3. Copy the returned `idToken` into the Postman collection variable `firebaseToken`.
4. Create or retrieve the treasurer member linked to the Firebase email.
5. Create a regular member.
6. Record a contribution for that member.
7. Show the API response with transaction, updated balance, and SMS result.
8. Inspect `"Member"` to show `accountBalance` changed.
9. Inspect `"Transaction"` to show the immutable ledger row.
10. Inspect `"Notification"` to show SMS was sent, skipped, or queued.

## Extension Notes

The project is organized so Loans, Penalties, Reports, and Synchronization can be added later by creating new route, controller, service, and validator modules without rewriting the existing modules.

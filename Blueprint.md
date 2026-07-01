# Mobile-Based Governance System for Transparency in Kenyan Chamas

## Project Blueprint (AI Anchor Document)

### Purpose

This document serves as the authoritative reference for AI-assisted development.

The AI must prioritize the rules, entities, and relationships defined here over inferred assumptions. If a feature is unclear, the AI should request clarification rather than invent business logic.

---

# 1. Project Overview

The system is a mobile-first governance and transparency platform for Kenyan Chamas.

Its primary objectives are:

* Improve transparency of financial records.
* Provide a shared digital ledger visible to all members.
* Track contributions, loans, penalties, and balances.
* Automate notifications through SMS.
* Support offline-first operation.
* Synchronize records to the cloud when connectivity becomes available.

---

# 2. User Roles

## Member

Can:

* Register/Login
* View personal balance
* View contribution history
* View transaction history
* View shared ledger
* Request loans
* Receive notifications

Cannot:

* Edit financial records
* Approve loans
* Apply penalties
* Manage members

---

## Treasurer

Inherits all Member permissions.

Additional permissions:

* Record contributions
* Initial loan approval (moves loan from PENDING → TREASURER_APPROVED)
* Reject loans (moves loan from PENDING → REJECTED)
* Apply penalties
* Generate reports
* Record loan repayments

Special rule: When the Treasurer themselves requests a loan, the loan status is
automatically set to TREASURER_APPROVED (bypassing the initial approval step).

Cannot:

* Give final loan approval (requires Admin)
* Manage members (add/remove/edit roles)
* Trigger notification workflows

---

## Admin

Inherits all Member permissions.

Additional permissions:

* Final loan approval (receives TREASURER_APPROVED loans, gives final stamp → ACTIVE + disbursement + SMS)
* Reject loans (moves loan from TREASURER_APPROVED → REJECTED)
* Manage members (add/remove/edit roles)
* Trigger notification workflows

Cannot:

* Record contributions (Treasurer responsibility)
* Apply penalties (Treasurer responsibility)
* Record loan repayments (Treasurer responsibility)

---

## Role Constraints

* A chama group can have at most **one Treasurer** and **one Admin**.
* Every group must have exactly one Admin (the group creator).
* MEMBER is the default role for new members.

---

# 3. Core Entities

## Group

Represents a Chama.

### Fields

| Field                 | Type     |
| --------------------- | -------- |
| id                    | UUID     |
| name                  | String   |
| description           | String   |
| contributionAmount    | Decimal  |
| contributionFrequency | Enum     |
| createdAt             | DateTime |
| updatedAt             | DateTime |

### Relationships

* One Group has many Members.
* One Group has many Transactions.
* One Group has many Loans.

---

## Member

Represents a Chama participant.

### Fields

| Field          | Type           |
| -------------- | -------------- |
| id             | UUID           |
| groupId        | FK             |
| fullName       | String         |
| phoneNumber    | String         |
| email          | String         |
| passwordHash   | String         |
| role           | MEMBER / ADMIN |
| accountBalance | Decimal        |
| deviceToken    | String         |
| createdAt      | DateTime       |
| updatedAt      | DateTime       |

### Relationships

* Belongs to one Group.
* Has many Transactions.
* Has many Loans.
* Has many Notifications.

---

## Transaction

Immutable financial ledger record.

### Fields

| Field           | Type       |
| --------------- | ---------- |
| id              | UUID       |
| memberId        | FK         |
| groupId         | FK         |
| amount          | Decimal    |
| transactionType | Enum       |
| description     | String     |
| createdBy       | FK(Member) |
| timestamp       | DateTime   |

### Transaction Types

* CONTRIBUTION
* LOAN_DISBURSEMENT
* LOAN_REPAYMENT
* PENALTY
* INTEREST_PAYMENT
* ADJUSTMENT

### Rules

* Transactions must never be edited after creation.
* Corrections must be recorded using adjustment transactions.
* Amount must be non-negative.

---

## Loan

Represents money borrowed by a member.

### Fields

| Field           | Type       |
| --------------- | ---------- |
| id              | UUID       |
| memberId        | FK         |
| groupId         | FK         |
| principalAmount | Decimal    |
| interestRate    | Decimal    |
| totalRepayable  | Decimal    |
| amountPaid      | Decimal    |
| dueDate         | Date       |
| status          | Enum       |
| approvedBy      | FK(Member) |
| createdAt       | DateTime   |

### Status Values

* PENDING
* TREASURER_APPROVED
* ACTIVE
* OVERDUE
* PAID
* REJECTED

---

## Notification

Represents SMS alerts.

### Fields

| Field       | Type     |
| ----------- | -------- |
| id          | UUID     |
| memberId    | FK       |
| phoneNumber | String   |
| type        | Enum     |
| message     | Text     |
| sentAt      | DateTime |
| status      | Enum     |

### Notification Types

* CONTRIBUTION_CONFIRMATION
* LOAN_APPROVED
* LOAN_REMINDER
* PENALTY_ALERT
* SYSTEM_ALERT

---

## Penalty

Represents missed-payment penalties.

### Fields

| Field     | Type     |
| --------- | -------- |
| id        | UUID     |
| memberId  | FK       |
| amount    | Decimal  |
| reason    | String   |
| appliedAt | DateTime |
| settled   | Boolean  |

---

## PendingNotification

Represents the offline SMS dispatch queue. When the device is offline, outgoing
Notifications are enqueued here. The SyncWorker drains this table when
connectivity is restored, applying exponential backoff on API failures.

### Fields

| Field          | Type     |
| -------------- | -------- |
| id             | UUID     |
| notificationId | FK       |
| phoneNumber    | String   |
| message        | Text     |
| retryCount     | Integer  |
| nextRetryAt    | DateTime |
| status         | Enum     |
| createdAt      | DateTime |

### Status Values

* QUEUED
* FAILED

### Relationships

* Belongs to one Notification (FK: notificationId).

### Rules

* Maximum retry attempts: 3.
* Backoff formula: delay = 2^retryCount × BASE_DELAY_SECONDS (default 2s).
* After 3 failed attempts, the parent Notification status is set to FAILED
  and the PendingNotification record is removed from the queue.
* On successful dispatch, the parent Notification status is set to SENT,
  sentAt is populated, and the PendingNotification record is removed.

---

# 4. Entity Relationships

Group
│
├── Members (1:N)
│
├── Transactions (1:N)
│
└── Loans (1:N)

Member
│
├── Transactions (1:N)
├── Loans (1:N)
├── Notifications (1:N)
└── Penalties (1:N)

Loan
│
└── Loan Repayment Transactions (1:N)

---

# 5. Business Rules

## BR-001: Shared Ledger Transparency

All authenticated members can view ledger entries.

Members cannot modify ledger entries.

Only Admin/Treasurer can create financial records.

---

## BR-002: Immutable Financial Records

Transactions are append-only.

Existing transactions cannot be edited or deleted.

Corrections must be made using adjustment transactions.

---

## BR-003: Contribution Recording

When a Treasurer records a contribution:

1. Validate amount.
2. Create transaction.
3. Update member balance.
4. Update group totals.
5. Generate SMS confirmation.

---

## BR-004: Loan Requests

Members and Treasurers can submit loan requests.

New requests begin with:

Status = PENDING

**Exception:** When the **Treasurer** requests a loan, the status is automatically
set to TREASURER_APPROVED (bypassing their own initial approval step), and proceeds
directly to the Admin's final approval queue.

Only Treasurer may give initial approval (PENDING → TREASURER_APPROVED).
Only Admin may give final approval (TREASURER_APPROVED → ACTIVE).
Both Treasurer and Admin may reject loans at their respective stages.

---

## BR-005: Loan Approval (Two-Stage)

### Stage 1 — Treasurer Initial Approval

The Treasurer reviews PENDING loan requests and either:

* **Approves**: Loan status moves to TREASURER_APPROVED. The loan now appears
  in the Admin's final approval queue.
* **Rejects**: Loan status moves to REJECTED.

### Stage 2 — Admin Final Approval

The Admin reviews TREASURER_APPROVED loan requests and either:

* **Approves** (final): The following steps execute:
  1. Loan status becomes ACTIVE.
  2. Loan disbursement transaction is created (append-only, BR-002).
  3. Member balance is updated.
  4. SMS notification is sent to the member.

* **Rejects**: Loan status moves to REJECTED.

---

## BR-006: Interest Calculation

The proposal specifies that loans include:

* Principal Amount
* Interest Rate
* Repayment Date

However, the exact formula is NOT defined.

### Current Placeholder

totalRepayable = principalAmount + (principalAmount × interestRate)

Example:

Principal = 10,000
Interest Rate = 10%

Total Repayable = 11,000

IMPORTANT:

This formula is provisional and must be confirmed with stakeholders before implementation.

---

## BR-007: Overdue Detection

A loan becomes OVERDUE when:

currentDate > dueDate

AND

amountPaid < totalRepayable

---

## BR-008: Penalty Application

The system automatically checks deadlines.

If a payment deadline is missed:

1. Create penalty record.
2. Increase member liability.
3. Send penalty SMS notification.

IMPORTANT:

Penalty calculation formula is NOT specified in project documents.

The penalty amount must therefore be configurable at Group level.

---

## BR-009: Auditability

Every financial action must contain:

* Timestamp
* Actor
* Record ID
* Transaction Type

No anonymous transactions allowed.

---

## BR-010: Offline First

The application must function without internet.

All operations are stored locally first.

Synchronization occurs when connectivity becomes available.

### SMS Notification Architecture (Two-Table Split)

SMS dispatch uses a two-table architecture to separate the permanent audit
trail from the transient offline queue:

1. **Notification table** — The permanent, auditable record of every SMS
   notification the system has generated. Contains the notification type,
   recipient, message body, and final status (PENDING → SENT or FAILED).
   This table is the source of truth for notification history.

2. **pending_notifications table** — A transient offline queue. When a
   Notification is created while the device is offline (or the API is
   unreachable), a corresponding PendingNotification is inserted here.
   The SyncWorker processes this queue on connectivity restoration.

### Dispatch Flow

1. NotificationService creates a Notification (status=PENDING) and enqueues
   a PendingNotification (status=QUEUED, retryCount=0).
2. SyncWorker queries pending_notifications for items where nextRetryAt ≤ now.
3. For each item, SyncWorker calls the Africa's Talking SMS API.
4. On success: PendingNotification is deleted, Notification status → SENT.
5. On failure: retryCount is incremented, nextRetryAt is set using
   exponential backoff (2^retryCount × 2 seconds).
6. After 3 failed attempts: PendingNotification is deleted,
   Notification status → FAILED.

---

# 6. Technical Constraints

Frontend:

* Flutter

Backend:

* Node.js
* Express.js

Local Database:

* SQLite
* SQLCipher encryption

Cloud Sync:

* Firebase Firestore

Authentication:

* Firebase Authentication

SMS:

* Africa's Talking API

---

# 7. AI Development Rules

When generating code:

1. Never bypass role permissions.
2. Never allow transaction deletion.
3. Never use floating-point arithmetic for money.
4. Always use Decimal types for financial calculations.
5. Always timestamp financial records.
6. Assume offline-first behavior.
7. Treat the Transaction table as the source of truth.
8. Do not invent new financial formulas.
9. Any undefined business rule must be marked "Requires Stakeholder Confirmation".
10. Preserve auditability in every financial operation.

---

# 8. Open Questions Requiring Stakeholder Confirmation

The following are NOT defined in current project documentation:

1. Exact interest calculation formula.
2. Exact penalty formula.
3. Contribution frequency options.
4. Loan approval eligibility rules.
5. Maximum loan amount.
6. Minimum savings before loan eligibility.
7. Group voting/approval workflow.
8. Dividend or profit-sharing calculations.
9. Multi-group membership support.
10. Conflict resolution strategy during synchronization.

AI must not invent answers to these questions.

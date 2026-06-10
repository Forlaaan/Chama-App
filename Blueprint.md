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

## Treasurer / Admin

Inherits all Member permissions.

Additional permissions:

* Record contributions
* Manage members
* Approve loans
* Apply penalties
* Generate reports
* Trigger notification workflows

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
* APPROVED
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

Members can submit loan requests.

New requests begin with:

Status = PENDING

Only Admin/Treasurer may approve or reject.

---

## BR-005: Loan Approval

Upon approval:

1. Loan status becomes ACTIVE.
2. Loan disbursement transaction is created.
3. Member balance is updated.
4. SMS notification is sent.

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

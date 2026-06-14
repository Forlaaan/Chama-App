import sqlite3
import hashlib
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional

class SecurityException(Exception):
    pass

def generate_uuid() -> str:
    return str(uuid.uuid4())

def generate_audit_signature(record_id: str, actor_id: str, timestamp: str, data_payload: str) -> str:
    payload = f"{record_id}|{actor_id}|{timestamp}|{data_payload}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()

class DatabaseService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_member(self, member_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, deviceToken, createdAt, updatedAt, auditSignature FROM Member WHERE id = ?", (member_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return {
            'id': row[0],
            'groupId': row[1],
            'fullName': row[2],
            'phoneNumber': row[3],
            'email': row[4],
            'passwordHash': row[5],
            'role': row[6],
            'accountBalance': row[7],
            'deviceToken': row[8],
            'createdAt': row[9],
            'updatedAt': row[10],
            'auditSignature': row[11]
        }

    def get_all_members(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, deviceToken, createdAt, updatedAt, auditSignature FROM Member")
        rows = cursor.fetchall()
        members = []
        for row in rows:
            members.append({
                'id': row[0],
                'groupId': row[1],
                'fullName': row[2],
                'phoneNumber': row[3],
                'email': row[4],
                'passwordHash': row[5],
                'role': row[6],
                'accountBalance': row[7],
                'deviceToken': row[8],
                'createdAt': row[9],
                'updatedAt': row[10],
                'auditSignature': row[11]
            })
        return members

    def update_member(self, member: Dict[str, Any], actor_id: str) -> None:
        timestamp = datetime.utcnow().isoformat() + 'Z'
        sig_data = f"{member['fullName']}|{member['phoneNumber']}|{member['accountBalance']}"
        signature = generate_audit_signature(member['id'], actor_id, timestamp, sig_data)
        
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE Member
            SET accountBalance = ?, updatedAt = ?, auditSignature = ?
            WHERE id = ?
        """, (str(member['accountBalance']), timestamp, signature, member['id']))
        self.conn.commit()

    def get_loan(self, loan_id: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, memberId, groupId, principalAmount, interestRate, totalRepayable, amountPaid, dueDate, status, approvedBy, createdAt, updatedAt, auditSignature FROM Loan WHERE id = ?", (loan_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return {
            'id': row[0],
            'memberId': row[1],
            'groupId': row[2],
            'principalAmount': row[3],
            'interestRate': row[4],
            'totalRepayable': row[5],
            'amountPaid': row[6],
            'dueDate': row[7],
            'status': row[8],
            'approvedBy': row[9],
            'createdAt': row[10],
            'updatedAt': row[11],
            'auditSignature': row[12]
        }

    def create_loan(self, loan: Dict[str, Any], actor_id: str) -> str:
        timestamp = datetime.utcnow().isoformat() + 'Z'
        loan_id = loan.get('id') or generate_uuid()
        sig_data = f"{loan['principalAmount']}|{loan['interestRate']}|{loan['status']}"
        signature = generate_audit_signature(loan_id, actor_id, timestamp, sig_data)

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO Loan (id, memberId, groupId, principalAmount, interestRate, totalRepayable, amountPaid, dueDate, status, approvedBy, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            loan_id,
            loan['memberId'],
            loan['groupId'],
            str(loan['principalAmount']),
            str(loan['interestRate']),
            str(loan['totalRepayable']),
            str(loan['amountPaid']),
            loan['dueDate'],
            loan['status'],
            loan.get('approvedBy'),
            timestamp,
            timestamp,
            signature
        ))
        self.conn.commit()
        return loan_id

    def update_loan(self, loan: Dict[str, Any], actor_id: str) -> None:
        timestamp = datetime.utcnow().isoformat() + 'Z'
        sig_data = f"{loan['principalAmount']}|{loan['interestRate']}|{loan['status']}"
        signature = generate_audit_signature(loan['id'], actor_id, timestamp, sig_data)

        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE Loan
            SET status = ?, approvedBy = ?, updatedAt = ?, auditSignature = ?
            WHERE id = ?
        """, (loan['status'], loan.get('approvedBy'), timestamp, signature, loan['id']))
        self.conn.commit()

    def create_transaction(self, tx: Dict[str, Any], actor_id: str) -> str:
        timestamp = datetime.utcnow().isoformat() + 'Z'
        tx_id = tx.get('id') or generate_uuid()
        sig_data = f"{tx['amount']}|{tx['transactionType']}"
        signature = generate_audit_signature(tx_id, actor_id, timestamp, sig_data)

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO "Transaction" (id, memberId, groupId, loanId, amount, transactionType, description, createdBy, timestamp, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tx_id,
            tx['memberId'],
            tx['groupId'],
            tx.get('loanId'),
            str(tx['amount']),
            tx['transactionType'],
            tx.get('description'),
            tx['createdBy'],
            timestamp,
            timestamp,
            timestamp,
            signature
        ))
        self.conn.commit()
        return tx_id

    def create_notification(self, notif: Dict[str, Any], actor_id: str) -> str:
        timestamp = datetime.utcnow().isoformat() + 'Z'
        notif_id = notif.get('id') or generate_uuid()
        sig_data = f"{notif['type']}|{notif['phoneNumber']}|{notif['status']}"
        signature = generate_audit_signature(notif_id, actor_id, timestamp, sig_data)

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO Notification (id, memberId, phoneNumber, type, message, sentAt, status, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            notif_id,
            notif['memberId'],
            notif['phoneNumber'],
            notif['type'],
            notif['message'],
            notif.get('sentAt'),
            notif['status'],
            timestamp,
            timestamp,
            signature
        ))
        self.conn.commit()
        return notif_id

    def get_all_transactions(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, memberId, groupId, loanId, amount, transactionType, description, createdBy, timestamp, createdAt, updatedAt, auditSignature
            FROM "Transaction"
        """)
        rows = cursor.fetchall()
        transactions = []
        for row in rows:
            transactions.append({
                'id': row[0],
                'memberId': row[1],
                'groupId': row[2],
                'loanId': row[3],
                'amount': row[4],
                'transactionType': row[5],
                'description': row[6],
                'createdBy': row[7],
                'timestamp': row[8],
                'createdAt': row[9],
                'updatedAt': row[10],
                'auditSignature': row[11]
            })
        return transactions

    # ==========================================
    # Pending Notifications Queue (BR-010 Offline First)
    # ==========================================

    def add_to_pending_queue(self, pending: Dict[str, Any]) -> str:
        """Insert a notification into the offline pending queue."""
        pending_id = pending.get('id') or generate_uuid()
        timestamp = datetime.utcnow().isoformat() + 'Z'
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO "pending_notifications" (id, notificationId, phoneNumber, message, retryCount, nextRetryAt, status, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pending_id,
            pending['notificationId'],
            pending['phoneNumber'],
            pending['message'],
            pending.get('retryCount', 0),
            pending.get('nextRetryAt', timestamp),
            pending.get('status', 'QUEUED'),
            timestamp
        ))
        self.conn.commit()
        return pending_id

    def get_due_pending_notifications(self, current_time: str) -> List[Dict[str, Any]]:
        """Fetch all queued notifications whose nextRetryAt <= current_time."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, notificationId, phoneNumber, message, retryCount, nextRetryAt, status, createdAt
            FROM "pending_notifications"
            WHERE status = 'QUEUED' AND nextRetryAt <= ?
            ORDER BY nextRetryAt ASC
        """, (current_time,))
        rows = cursor.fetchall()
        results = []
        for row in rows:
            results.append({
                'id': row[0],
                'notificationId': row[1],
                'phoneNumber': row[2],
                'message': row[3],
                'retryCount': row[4],
                'nextRetryAt': row[5],
                'status': row[6],
                'createdAt': row[7],
            })
        return results

    def update_pending_notification(self, pending_id: str, updates: Dict[str, Any]) -> None:
        """Update retryCount, nextRetryAt, or status on a pending notification."""
        set_clauses = []
        values = []
        for key in ('retryCount', 'nextRetryAt', 'status'):
            if key in updates:
                set_clauses.append(f"{key} = ?")
                values.append(updates[key])
        if not set_clauses:
            return
        values.append(pending_id)
        cursor = self.conn.cursor()
        cursor.execute(
            f'UPDATE "pending_notifications" SET {", ".join(set_clauses)} WHERE id = ?',
            tuple(values)
        )
        self.conn.commit()

    def remove_pending_notification(self, pending_id: str) -> None:
        """Remove a pending notification after successful dispatch or permanent failure."""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM "pending_notifications" WHERE id = ?', (pending_id,))
        self.conn.commit()

    def update_notification_status(self, notification_id: str, status: str, sent_at: str = None) -> None:
        """Update the parent Notification record status (e.g. SENT, FAILED)."""
        cursor = self.conn.cursor()
        if sent_at:
            cursor.execute("""
                UPDATE "Notification" SET status = ?, sentAt = ? WHERE id = ?
            """, (status, sent_at, notification_id))
        else:
            cursor.execute("""
                UPDATE "Notification" SET status = ? WHERE id = ?
            """, (status, notification_id))
        self.conn.commit()

    def get_notification(self, notification_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single Notification by ID."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, memberId, phoneNumber, type, message, sentAt, status, createdAt, updatedAt, auditSignature
            FROM "Notification" WHERE id = ?
        """, (notification_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return {
            'id': row[0],
            'memberId': row[1],
            'phoneNumber': row[2],
            'type': row[3],
            'message': row[4],
            'sentAt': row[5],
            'status': row[6],
            'createdAt': row[7],
            'updatedAt': row[8],
            'auditSignature': row[9],
        }


class TreasurerController:
    def __init__(self, db_service: DatabaseService):
        self.db = db_service

    def _verify_is_admin(self, actor_id: str, operation_name: str) -> Dict[str, Any]:
        actor = self.db.get_member(actor_id)
        if not actor:
            raise SecurityException("Unauthorized Access: Actor not found.")
        if actor['role'] != 'ADMIN':
            raise SecurityException(f"Unauthorized Access: Actor does not have permissions for {operation_name}.")
        return actor

    def record_contribution(self, actor_id: str, member_id: str, group_id: str, amount: str, description: str) -> Dict[str, Any]:
        # 1. Verify role
        self._verify_is_admin(actor_id, 'record_contribution')

        # 2. Validate amount as Decimal
        try:
            contrib_amount = Decimal(amount)
        except Exception:
            raise ValueError(f"Invalid amount format: {amount}")

        if contrib_amount <= Decimal('0'):
            raise ValueError("Contribution amount must be greater than zero.")

        # 3. Retrieve member
        member = self.db.get_member(member_id)
        if not member:
            raise ValueError(f"Member not found: {member_id}")

        # 4. Create Transaction
        tx = {
            'memberId': member_id,
            'groupId': group_id,
            'loanId': None,
            'amount': str(contrib_amount),
            'transactionType': 'CONTRIBUTION',
            'description': description,
            'createdBy': actor_id
        }
        tx_id = self.db.create_transaction(tx, actor_id)

        # 5. Update member balance
        current_balance = Decimal(member['accountBalance'])
        new_balance = current_balance + contrib_amount
        member['accountBalance'] = str(new_balance)
        self.db.update_member(member, actor_id)

        # 6. Calculate Group Totals dynamically
        all_members = self.db.get_all_members()
        group_total = Decimal('0')
        for m in all_members:
            if m['groupId'] == group_id:
                group_total += Decimal(m['accountBalance'])

        # 7. Generate SMS Notification
        notification_msg = f"Dear {member['fullName']}, your contribution of {amount} has been recorded. New balance: {new_balance}."
        notif = {
            'memberId': member_id,
            'phoneNumber': member['phoneNumber'],
            'type': 'CONTRIBUTION_CONFIRMATION',
            'message': notification_msg,
            'sentAt': None,
            'status': 'PENDING'
        }
        self.db.create_notification(notif, actor_id)

        # 8. Return response
        return {
            'success': True,
            'message': 'Contribution recorded successfully.',
            'data': {
                'memberId': member_id,
                'amount': amount,
                'newBalance': str(new_balance),
                'groupTotalBalance': str(group_total)
            }
        }

    def approve_loan(self, actor_id: str, loan_id: str) -> Dict[str, Any]:
        # 1. Verify role
        self._verify_is_admin(actor_id, 'approve_loan')

        # 2. Retrieve Loan
        loan = self.db.get_loan(loan_id)
        if not loan:
            raise ValueError(f"Loan not found: {loan_id}")

        if loan['status'] != 'PENDING':
            raise StateError(f"Only PENDING loans can be approved. Current status: {loan['status']}")

        # 3. Update Loan status to ACTIVE
        loan['status'] = 'ACTIVE'
        loan['approvedBy'] = actor_id
        self.db.update_loan(loan, actor_id)

        # 4. Create Loan Disbursement Transaction
        tx = {
            'memberId': loan['memberId'],
            'groupId': loan['groupId'],
            'loanId': loan['id'],
            'amount': loan['principalAmount'],
            'transactionType': 'LOAN_DISBURSEMENT',
            'description': f"Loan disbursement for approved loan {loan['id']}",
            'createdBy': actor_id
        }
        self.db.create_transaction(tx, actor_id)

        # 5. Update Member Balance
        member = self.db.get_member(loan['memberId'])
        if not member:
            raise ValueError(f"Member associated with loan not found: {loan['memberId']}")

        current_balance = Decimal(member['accountBalance'])
        principal = Decimal(loan['principalAmount'])
        new_balance = current_balance + principal
        member['accountBalance'] = str(new_balance)
        self.db.update_member(member, actor_id)

        # 6. Create SMS Notification
        notification_msg = f"Dear {member['fullName']}, your loan of {loan['principalAmount']} has been approved. Status: ACTIVE."
        notif = {
            'memberId': loan['memberId'],
            'phoneNumber': member['phoneNumber'],
            'type': 'LOAN_APPROVED',
            'message': notification_msg,
            'sentAt': None,
            'status': 'PENDING'
        }
        self.db.create_notification(notif, actor_id)

        return {
            'success': True,
            'message': 'Loan approved and disbursed successfully.',
            'data': {
                'loanId': loan_id,
                'memberId': loan['memberId'],
                'principalAmount': loan['principalAmount'],
                'newBalance': str(new_balance)
            }
        }


class MemberController:
    def __init__(self, db_service: DatabaseService):
        self.db = db_service

    def _verify_is_member(self, actor_id: str, operation_name: str) -> Dict[str, Any]:
        actor = self.db.get_member(actor_id)
        if not actor:
            raise SecurityException("Unauthorized Access: Actor not found.")
        if actor['role'] not in ('MEMBER', 'ADMIN'):
            raise SecurityException(f"Unauthorized Access: Actor does not have permissions for {operation_name}.")
        return actor

    def request_loan(self, actor_id: str, group_id: str, principal_amount: str, interest_rate: str, due_date: str) -> Dict[str, Any]:
        # 1. Verify role
        self._verify_is_member(actor_id, 'request_loan')

        # 2. Validate principal and rate
        try:
            principal = Decimal(principal_amount)
            rate = Decimal(interest_rate)
        except Exception:
            raise ValueError("Invalid numeric format for principal or interest rate.")

        if principal <= Decimal('0'):
            raise ValueError("Principal amount must be greater than zero.")
        if rate < Decimal('0'):
            raise ValueError("Interest rate cannot be negative.")

        # 3. Calculate total repayable using Decimal (BR-006)
        interest = principal * rate
        total_repayable = principal + interest

        # 4. Create Loan record
        loan = {
            'memberId': actor_id,
            'groupId': group_id,
            'principalAmount': str(principal),
            'interestRate': str(rate),
            'totalRepayable': str(total_repayable),
            'amountPaid': '0',
            'dueDate': due_date,
            'status': 'PENDING',
            'approvedBy': None
        }
        loan_id = self.db.create_loan(loan, actor_id)

        return {
            'success': True,
            'message': 'Loan request submitted successfully.',
            'data': {
                'loanId': loan_id,
                'memberId': actor_id,
                'principalAmount': str(principal),
                'interestRate': str(rate),
                'totalRepayable': str(total_repayable),
                'status': 'PENDING'
            }
        }

    def view_personal_balance(self, actor_id: str) -> Dict[str, Any]:
        member = self._verify_is_member(actor_id, 'view_personal_balance')
        return {
            'success': True,
            'message': 'Account balance retrieved successfully.',
            'data': {
                'memberId': actor_id,
                'accountBalance': member['accountBalance']
            }
        }

    def view_contribution_history(self, actor_id: str) -> Dict[str, Any]:
        self._verify_is_member(actor_id, 'view_contribution_history')
        transactions = self.db.get_all_transactions()
        contributions = [tx for tx in transactions if tx['memberId'] == actor_id and tx['transactionType'] == 'CONTRIBUTION']
        return {
            'success': True,
            'message': 'Contribution history retrieved successfully.',
            'data': {
                'memberId': actor_id,
                'contributions': contributions
            }
        }

    def view_transaction_history(self, actor_id: str) -> Dict[str, Any]:
        self._verify_is_member(actor_id, 'view_transaction_history')
        transactions = self.db.get_all_transactions()
        personal_history = [tx for tx in transactions if tx['memberId'] == actor_id]
        return {
            'success': True,
            'message': 'Transaction history retrieved successfully.',
            'data': {
                'memberId': actor_id,
                'transactions': personal_history
            }
        }


class StateError(Exception):
    pass

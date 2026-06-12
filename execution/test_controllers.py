# execution/test_controllers.py

import sqlite3
import os
import sys
from decimal import Decimal
from controllers import DatabaseService, TreasurerController, MemberController, SecurityException

def run_tests():
    print("==========================================================")
    print("Running Chama Controllers and Business Rules Tests...")
    print("==========================================================")

    # 1. Compile schema in memory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(current_dir, 'schema.sql')

    if not os.path.exists(schema_path):
        print(f"[-] Error: schema.sql not found at {schema_path}")
        sys.exit(1)

    with open(schema_path, 'r') as f:
        schema_sql = f.read()

    # Strip SQLCipher pragmas
    clean_lines = []
    for line in schema_sql.split('\n'):
        line_upper = line.upper().strip()
        if (line_upper.startswith('PRAGMA KEY') or 
            line_upper.startswith('PRAGMA CIPHER_') or 
            line_upper.startswith('PRAGMA KDF_')):
            continue
        clean_lines.append(line)
    clean_schema = '\n'.join(clean_lines)

    conn = sqlite3.connect(':memory:')
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.executescript(clean_schema)
    print("[1/8] SQLite schema compiled successfully in memory.")

    db = DatabaseService(conn)
    treasurer_ctrl = TreasurerController(db)
    member_ctrl = MemberController(db)

    # 2. Seed baseline data (Group and Members)
    group_id = "group-abc"
    admin_id = "admin-treasurer"
    member_id = "regular-member"

    try:
        # Seed Group
        cursor.execute("""
            INSERT INTO "Group" (id, name, description, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
            VALUES (?, 'Test Group', 'Unit testing Chama', '1000', 'MONTHLY', '2026-06-10T12:00:00Z', '2026-06-10T12:00:00Z', 'sig-g');
        """, (group_id,))

        # Seed Admin/Treasurer
        cursor.execute("""
            INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, deviceToken, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, 'Alice Admin', '+254711111111', 'alice@chama.org', 'pw1', 'ADMIN', '0', NULL, '2026-06-10T12:00:00Z', '2026-06-10T12:00:00Z', 'sig-admin');
        """, (admin_id, group_id))

        # Seed Regular Member
        cursor.execute("""
            INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, deviceToken, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, 'Bob Member', '+254722222222', 'bob@chama.org', 'pw2', 'MEMBER', '100', NULL, '2026-06-10T12:00:00Z', '2026-06-10T12:00:00Z', 'sig-member');
        """, (member_id, group_id))

        conn.commit()
        print("[2/8] Baseline Group and Member data seeded.")
    except Exception as e:
        print(f"[-] Seed failed: {e}")
        sys.exit(1)

    # 3. Test Security/Role Checks: Unauthorized Access Error
    print("[3/8] Testing Unauthorized Access constraints...")
    try:
        # A MEMBER role trying to record a contribution
        treasurer_ctrl.record_contribution(
            actor_id=member_id,
            member_id=member_id,
            group_id=group_id,
            amount="500",
            description="Unauthorized attempt"
        )
        print("[-] FAILURE: Database or controller allowed a Member to record a contribution!")
        sys.exit(1)
    except SecurityException as e:
        print(f"    [PASSED] Member contribution blocked: '{e}'")

    try:
        # A MEMBER role trying to approve a loan
        treasurer_ctrl.approve_loan(
            actor_id=member_id,
            loan_id="dummy-loan-id"
        )
        print("[-] FAILURE: Database or controller allowed a Member to approve a loan!")
        sys.exit(1)
    except SecurityException as e:
        print(f"    [PASSED] Member loan approval blocked: '{e}'")

    # 4. Test Loan Request (BR-004) and Interest Calculation (BR-006)
    print("[4/8] Testing Loan Request submission & Decimal Interest calculation (BR-004, BR-006)...")
    try:
        # Principal: 5000, Interest Rate: 0.12 (12%), expected totalRepayable = 5600
        res = member_ctrl.request_loan(
            actor_id=member_id,
            group_id=group_id,
            principal_amount="5000",
            interest_rate="0.12",
            due_date="2026-12-31"
        )
        assert res['success'] is True
        loan_id = res['data']['loanId']
        
        # Verify loan in DB
        loan = db.get_loan(loan_id)
        assert loan is not None
        assert loan['status'] == 'PENDING'
        assert Decimal(loan['principalAmount']) == Decimal('5000')
        assert Decimal(loan['interestRate']) == Decimal('0.12')
        assert Decimal(loan['totalRepayable']) == Decimal('5600') # Decimal check
        assert loan['auditSignature'] != ''
        print("    [PASSED] Loan created as PENDING, total repayable calculated exactly as 5600 via Decimal.")
    except Exception as e:
        print(f"[-] Loan request test failed: {e}")
        sys.exit(1)

    # 5. Test Contribution Recording (BR-003)
    print("[5/8] Testing Contribution recording (BR-003)...")
    try:
        # Initial balance was 100. Contribution of 1500. Expected new balance: 1600.
        res = treasurer_ctrl.record_contribution(
            actor_id=admin_id,
            member_id=member_id,
            group_id=group_id,
            amount="1500",
            description="Monthly savings contribution"
        )
        assert res['success'] is True
        assert res['data']['newBalance'] == '1600'
        assert res['data']['groupTotalBalance'] == '1600' # only 1 member has balance

        # Verify database balance update
        m = db.get_member(member_id)
        assert Decimal(m['accountBalance']) == Decimal('1600')

        # Verify transaction table
        txs = db.get_all_transactions()
        contrib_txs = [t for t in txs if t['transactionType'] == 'CONTRIBUTION']
        assert len(contrib_txs) == 1
        assert Decimal(contrib_txs[0]['amount']) == Decimal('1500')
        assert contrib_txs[0]['createdBy'] == admin_id

        # Verify notification table
        cursor.execute("SELECT type, phoneNumber, message, status FROM Notification WHERE type = 'CONTRIBUTION_CONFIRMATION'")
        notif = cursor.fetchone()
        assert notif is not None
        assert notif[1] == '+254722222222'
        assert "contribution of 1500" in notif[2]
        assert notif[3] == 'PENDING'

        print("    [PASSED] Contribution recorded. Balance updated. Transaction logged. SMS notification queued.")
    except Exception as e:
        print(f"[-] Contribution test failed: {e}")
        sys.exit(1)

    # 6. Test Loan Approval and Disbursement (BR-005)
    print("[6/8] Testing Loan Approval and Disbursement (BR-005)...")
    try:
        # Approve the loan created earlier
        res = treasurer_ctrl.approve_loan(
            actor_id=admin_id,
            loan_id=loan_id
        )
        assert res['success'] is True
        
        # Verify loan status
        loan = db.get_loan(loan_id)
        assert loan['status'] == 'ACTIVE'
        assert loan['approvedBy'] == admin_id

        # Verify disbursement transaction
        txs = db.get_all_transactions()
        disb_txs = [t for t in txs if t['transactionType'] == 'LOAN_DISBURSEMENT']
        assert len(disb_txs) == 1
        assert Decimal(disb_txs[0]['amount']) == Decimal('5000')
        assert disb_txs[0]['loanId'] == loan_id

        # Verify member balance (added principal of 5000. Balance was 1600. New balance: 6600)
        m = db.get_member(member_id)
        assert Decimal(m['accountBalance']) == Decimal('6600')

        # Verify notification table
        cursor.execute("SELECT type, message, status FROM Notification WHERE type = 'LOAN_APPROVED'")
        notif = cursor.fetchone()
        assert notif is not None
        assert "loan of 5000" in notif[1]
        assert notif[2] == 'PENDING'

        print("    [PASSED] Loan approved. Status set to ACTIVE. Disbursement transaction appended. Balance updated. SMS queued.")
    except Exception as e:
        print(f"[-] Loan approval test failed: {e}")
        sys.exit(1)

    # 7. Test Member Views
    print("[7/8] Testing Member views...")
    try:
        balance_res = member_ctrl.view_personal_balance(actor_id=member_id)
        assert balance_res['data']['accountBalance'] == '6600'

        contrib_res = member_ctrl.view_contribution_history(actor_id=member_id)
        assert len(contrib_res['data']['contributions']) == 1

        tx_res = member_ctrl.view_transaction_history(actor_id=member_id)
        assert len(tx_res['data']['transactions']) == 2 # 1 contribution, 1 disbursement

        print("    [PASSED] Personal views correctly fetch matching records.")
    except Exception as e:
        print(f"[-] Member views test failed: {e}")
        sys.exit(1)

    # 8. Test Immutability Trigger Integration
    print("[8/8] Testing database-level transaction immutability...")
    try:
        txs = db.get_all_transactions()
        tx_id = txs[0]['id']
        cursor.execute("UPDATE \"Transaction\" SET amount = '9999' WHERE id = ?;", (tx_id,))
        conn.commit()
        print("[-] FAILURE: Database allowed Transaction update!")
        sys.exit(1)
    except sqlite3.Error as e:
        assert "Transactions are immutable" in str(e)
        print("    [PASSED] Database prevented transaction modifications.")

    print("\n==========================================================")
    print("ALL TESTS PASSED: Controllers successfully verified.")
    print("==========================================================")

if __name__ == '__main__':
    run_tests()

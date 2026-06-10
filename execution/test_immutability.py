import sqlite3
import os
import sys

def run_immutability_test():
    print("==========================================================")
    print("Testing Transaction Table Immutability (BR-002)...")
    print("==========================================================")

    # Resolve paths
    current_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(current_dir, 'schema.sql')

    if not os.path.exists(schema_path):
        print(f"Error: schema.sql not found at {schema_path}")
        sys.exit(1)

    # Read schema.sql
    with open(schema_path, 'r') as f:
        schema_sql = f.read()

    # Filter out SQLCipher-specific PRAGMAs since native python sqlite3 doesn't support them.
    # Note: Standard SQLite doesn't natively support PRAGMA key = ... or PRAGMA cipher_...
    clean_lines = []
    for line in schema_sql.split('\n'):
        line_upper = line.upper().strip()
        if (line_upper.startswith('PRAGMA KEY') or 
            line_upper.startswith('PRAGMA CIPHER_') or 
            line_upper.startswith('PRAGMA KDF_')):
            continue
        clean_lines.append(line)
    clean_schema = '\n'.join(clean_lines)

    # Connect to in-memory database
    conn = sqlite3.connect(':memory:')
    cursor = conn.cursor()

    try:
        # Enable Foreign Keys & Compile Schema
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.executescript(clean_schema)
        print("[1/4] Schema compiled successfully in memory.")
    except Exception as e:
        print(f"Failed to compile schema: {e}")
        sys.exit(1)

    # Seed Required References (Group and Member)
    group_id = "group-123"
    member_id = "member-456"
    
    try:
        # Insert Group
        cursor.execute("""
            INSERT INTO "Group" (id, name, description, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
            VALUES (?, 'Test Chama', 'A chama for unit testing', '1000', 'MONTHLY', '2026-06-10T12:00:00Z', '2026-06-10T12:00:00Z', 'sig-g');
        """, (group_id,))

        # Insert Member
        cursor.execute("""
            INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, deviceToken, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, 'John Doe', '+254700000000', 'john@chama.org', 'hash123', 'MEMBER', '0', NULL, '2026-06-10T12:00:00Z', '2026-06-10T12:00:00Z', 'sig-m');
        """, (member_id, group_id))

        # Insert Transaction
        tx_id = "tx-789"
        cursor.execute("""
            INSERT INTO "Transaction" (id, memberId, groupId, loanId, amount, transactionType, description, createdBy, timestamp, createdAt, updatedAt, auditSignature)
            VALUES (?, ?, ?, NULL, '1000', 'CONTRIBUTION', 'Monthly Savings Contribution', ?, '2026-06-10T12:05:00Z', '2026-06-10T12:05:00Z', '2026-06-10T12:05:00Z', 'sig-tx');
        """, (tx_id, member_id, group_id, member_id))
        
        conn.commit()
        print("[2/4] Seed data (Group, Member, Transaction) inserted successfully.")

    except Exception as e:
        print(f"Failed to insert seed data: {e}")
        sys.exit(1)

    # Test Immutability: Attempt UPDATE
    try:
        cursor.execute("UPDATE \"Transaction\" SET amount = '2000' WHERE id = ?;", (tx_id,))
        conn.commit()
        print("[-] FAILURE: Database allowed Transaction UPDATE!")
        sys.exit(1)
    except sqlite3.Error as e:
        error_msg = str(e)
        if "Transactions are immutable and cannot be updated" in error_msg:
            print("[3/4] SUCCESS: Database correctly blocked Transaction UPDATE with custom trigger error.")
        else:
            print(f"[-] FAILURE: Database blocked Transaction UPDATE but with unexpected error: {e}")
            sys.exit(1)

    # Test Immutability: Attempt DELETE
    try:
        cursor.execute("DELETE FROM \"Transaction\" WHERE id = ?;", (tx_id,))
        conn.commit()
        print("[-] FAILURE: Database allowed Transaction DELETE!")
        sys.exit(1)
    except sqlite3.Error as e:
        error_msg = str(e)
        if "Transactions are immutable and cannot be deleted" in error_msg:
            print("[4/4] SUCCESS: Database correctly blocked Transaction DELETE with custom trigger error.")
        else:
            print(f"[-] FAILURE: Database blocked Transaction DELETE but with unexpected error: {e}")
            sys.exit(1)

    print("\n==========================================================")
    print("ALL TESTS PASSED: Transaction table is fully immutable at DB level.")
    print("==========================================================")

if __name__ == '__main__':
    run_immutability_test()

import sqlite3
import os

def validate_fks():
    print("Running Self-Healing Check on SQLite Schema Constraints...")
    db_path = ':memory:'
    conn = sqlite3.connect(db_path)
    
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with open(schema_path, 'r') as f:
        schema = f.read()
    
    # SQLite in memory doesn't support sqlcipher pragmas directly.
    # Filter out PRAGMA key/cipher commands so we can run the DDL.
    clean_schema = "\n".join([line for line in schema.split('\n') if not line.upper().startswith('PRAGMA KEY') and not line.upper().startswith('PRAGMA CIPHER') and not line.upper().startswith('PRAGMA KDF')])
    
    try:
        conn.executescript(clean_schema)
        print("Schema compiled successfully in memory.")
    except Exception as e:
        print(f"Error compiling schema: {e}")
        return
        
    expected_relationships = {
        "Member": ["groupId"], 
        "Transaction": ["memberId", "groupId", "loanId", "createdBy"], 
        "Loan": ["memberId", "groupId", "approvedBy"],
        "Notification": ["memberId"],
        "Penalty": ["memberId"]
    }
    
    cursor = conn.cursor()
    all_matched = True
    for table in expected_relationships.keys():
        cursor.execute(f"PRAGMA foreign_key_list('{table}');")
        fks = cursor.fetchall()
        # fk structure: id, seq, table, from, to, on_update, on_delete, match
        actual_fk_columns = [fk[3] for fk in fks]
        
        for expected_col in expected_relationships[table]:
            if expected_col not in actual_fk_columns:
                print(f"FAILED: Table '{table}' is missing foreign key for '{expected_col}'")
                all_matched = False
            else:
                print(f"PASSED: Table '{table}' correctly has foreign key for '{expected_col}'")

    if all_matched:
        print("\nSelf-Healing Check PASSED: All relationships from Section 4 are properly mapped as foreign keys.")
    else:
        print("\nSelf-Healing Check FAILED.")

if __name__ == '__main__':
    validate_fks()

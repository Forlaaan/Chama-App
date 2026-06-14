# execution/test_notification.py
#
# Validation test script for the NotificationService and SyncWorker.
#
# Simulates:
#   1. Offline state — queuing a message
#   2. Connectivity restored but API fails — exponential backoff retry logic
#   3. Connectivity restored and API succeeds — successful dispatch
#   4. Exhausted retries — FAILED status

import sqlite3
import os
import sys
from datetime import datetime, timedelta

# Import project modules
from controllers import DatabaseService, generate_uuid
from notification_service import NotificationService, SyncWorker, MAX_RETRIES, BASE_DELAY_SECONDS


def setup_database():
    """Create an in-memory SQLite database with the project schema."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(current_dir, 'schema.sql')

    if not os.path.exists(schema_path):
        print(f"[-] Error: schema.sql not found at {schema_path}")
        sys.exit(1)

    with open(schema_path, 'r') as f:
        schema_sql = f.read()

    # Strip SQLCipher pragmas (not available in plain sqlite3)
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
    return conn


def seed_data(conn):
    """Seed a Group and a Member for notification tests."""
    cursor = conn.cursor()
    group_id = "group-notif-test"
    member_id = "member-notif-test"

    cursor.execute("""
        INSERT INTO "Group" (id, name, description, contributionAmount, contributionFrequency, createdAt, updatedAt, auditSignature)
        VALUES (?, 'Notif Test Group', 'Notification testing', '500', 'MONTHLY', '2026-06-14T12:00:00Z', '2026-06-14T12:00:00Z', 'sig-g');
    """, (group_id,))

    cursor.execute("""
        INSERT INTO "Member" (id, groupId, fullName, phoneNumber, email, passwordHash, role, accountBalance, deviceToken, createdAt, updatedAt, auditSignature)
        VALUES (?, ?, 'Jane Doe', '+254733333333', 'jane@chama.org', 'pw3', 'MEMBER', '0', NULL, '2026-06-14T12:00:00Z', '2026-06-14T12:00:00Z', 'sig-m');
    """, (member_id, group_id))

    conn.commit()
    return group_id, member_id


def run_tests():
    print("==========================================================")
    print("Running NotificationService & SyncWorker Tests...")
    print("==========================================================")

    # -------------------------------------------------------
    # Setup
    # -------------------------------------------------------
    conn = setup_database()
    db = DatabaseService(conn)
    group_id, member_id = seed_data(conn)
    notif_service = NotificationService(db)
    print("[1/7] Database and seed data initialized.")

    # -------------------------------------------------------
    # TEST 1: Queue a notification (simulates offline state)
    # -------------------------------------------------------
    print("[2/7] Testing offline notification queueing...")
    try:
        result = notif_service.queue_notification(
            member_id=member_id,
            phone_number='+254733333333',
            notification_type='CONTRIBUTION_CONFIRMATION',
            message='Dear Jane, your contribution of 500 has been recorded.',
            actor_id=member_id,
        )
        assert result['status'] == 'QUEUED'
        notification_id = result['notificationId']
        pending_id = result['pendingId']

        # Verify parent Notification exists with PENDING status
        notif = db.get_notification(notification_id)
        assert notif is not None
        assert notif['status'] == 'PENDING'
        assert notif['type'] == 'CONTRIBUTION_CONFIRMATION'

        # Verify pending_notifications queue entry exists
        now = datetime.utcnow().isoformat() + 'Z'
        pending_list = db.get_due_pending_notifications(now)
        assert len(pending_list) == 1
        assert pending_list[0]['notificationId'] == notification_id
        assert pending_list[0]['retryCount'] == 0

        print("    [PASSED] Notification created (PENDING) and queued in pending_notifications.")
    except Exception as e:
        print(f"[-] FAILURE: Queueing test failed: {e}")
        sys.exit(1)

    # -------------------------------------------------------
    # TEST 2: Invalid notification type rejected
    # -------------------------------------------------------
    print("[3/7] Testing invalid notification type rejection...")
    try:
        notif_service.queue_notification(
            member_id=member_id,
            phone_number='+254733333333',
            notification_type='INVALID_TYPE',
            message='This should fail.',
            actor_id=member_id,
        )
        print("[-] FAILURE: Invalid notification type was accepted!")
        sys.exit(1)
    except ValueError as e:
        assert 'Invalid notification type' in str(e)
        print("    [PASSED] Invalid notification type correctly rejected.")

    # -------------------------------------------------------
    # TEST 3: SyncWorker — API failure triggers retry with exponential backoff
    # -------------------------------------------------------
    print("[4/7] Testing SyncWorker retry with exponential backoff (simulated offline)...")
    try:
        call_count = {'value': 0}

        def mock_send_fail(phone, message):
            call_count['value'] += 1
            raise ConnectionError("Simulated network failure: device is offline")

        sync_worker = SyncWorker(
            db_service=db,
            at_username='sandbox',
            at_api_key='test-api-key',
            send_sms_fn=mock_send_fail,
        )

        # First retry attempt
        future_time = (datetime.utcnow() + timedelta(hours=1)).isoformat() + 'Z'
        result = sync_worker.process_queue(current_time=future_time)
        assert result['processed'] == 1
        assert result['retried'] == 1
        assert result['sent'] == 0
        assert call_count['value'] == 1

        # Verify retryCount incremented to 1
        pending_list = db.get_due_pending_notifications(future_time)
        # After retry, nextRetryAt was pushed forward, so it may not be due yet.
        # Query directly from DB to verify state.
        cursor = conn.cursor()
        cursor.execute('SELECT retryCount, status FROM "pending_notifications" WHERE id = ?', (pending_id,))
        row = cursor.fetchone()
        assert row[0] == 1  # retryCount incremented
        assert row[1] == 'QUEUED'  # still queued

        print("    [PASSED] First retry: retryCount=1, status still QUEUED, backoff delay applied.")
    except Exception as e:
        print(f"[-] FAILURE: Retry test failed: {e}")
        sys.exit(1)

    # -------------------------------------------------------
    # TEST 4: SyncWorker — Second retry attempt
    # -------------------------------------------------------
    print("[5/7] Testing SyncWorker second retry attempt...")
    try:
        # Advance time far enough for the backoff delay to expire
        far_future = (datetime.utcnow() + timedelta(hours=2)).isoformat() + 'Z'
        result = sync_worker.process_queue(current_time=far_future)
        assert result['processed'] == 1
        assert result['retried'] == 1
        assert call_count['value'] == 2

        # Verify retryCount incremented to 2
        cursor.execute('SELECT retryCount, status FROM "pending_notifications" WHERE id = ?', (pending_id,))
        row = cursor.fetchone()
        assert row[0] == 2
        assert row[1] == 'QUEUED'

        print("    [PASSED] Second retry: retryCount=2, still QUEUED.")
    except Exception as e:
        print(f"[-] FAILURE: Second retry test failed: {e}")
        sys.exit(1)

    # -------------------------------------------------------
    # TEST 5: SyncWorker — Third retry exhausts limit → FAILED
    # -------------------------------------------------------
    print("[6/7] Testing SyncWorker retry exhaustion (retryCount >= MAX_RETRIES)...")
    try:
        far_future2 = (datetime.utcnow() + timedelta(hours=3)).isoformat() + 'Z'
        result = sync_worker.process_queue(current_time=far_future2)
        assert result['processed'] == 1
        assert result['failed'] == 1
        assert call_count['value'] == 3

        # Verify pending notification removed from queue
        cursor.execute('SELECT COUNT(*) FROM "pending_notifications" WHERE id = ?', (pending_id,))
        count = cursor.fetchone()[0]
        assert count == 0

        # Verify parent Notification marked as FAILED
        notif = db.get_notification(notification_id)
        assert notif['status'] == 'FAILED'

        print("    [PASSED] Third retry failed. Notification marked FAILED. Removed from queue.")
    except Exception as e:
        print(f"[-] FAILURE: Retry exhaustion test failed: {e}")
        sys.exit(1)

    # -------------------------------------------------------
    # TEST 6: SyncWorker — Successful dispatch on connectivity
    # -------------------------------------------------------
    print("[7/7] Testing SyncWorker successful dispatch (simulated connectivity)...")
    try:
        # Queue a fresh notification
        result2 = notif_service.queue_notification(
            member_id=member_id,
            phone_number='+254733333333',
            notification_type='LOAN_APPROVED',
            message='Dear Jane, your loan of 10000 has been approved.',
            actor_id=member_id,
        )
        notif_id_2 = result2['notificationId']
        pending_id_2 = result2['pendingId']

        sent_calls = {'value': 0}

        def mock_send_success(phone, message):
            sent_calls['value'] += 1
            return True  # Simulate successful API response

        sync_success = SyncWorker(
            db_service=db,
            at_username='sandbox',
            at_api_key='test-api-key',
            send_sms_fn=mock_send_success,
        )

        now = (datetime.utcnow() + timedelta(seconds=1)).isoformat() + 'Z'
        result = sync_success.process_queue(current_time=now)
        assert result['processed'] == 1
        assert result['sent'] == 1
        assert result['failed'] == 0
        assert sent_calls['value'] == 1

        # Verify pending notification removed
        cursor.execute('SELECT COUNT(*) FROM "pending_notifications" WHERE id = ?', (pending_id_2,))
        count = cursor.fetchone()[0]
        assert count == 0

        # Verify parent Notification marked as SENT with sentAt timestamp
        notif2 = db.get_notification(notif_id_2)
        assert notif2['status'] == 'SENT'
        assert notif2['sentAt'] is not None

        print("    [PASSED] SMS dispatched successfully. Notification status=SENT. Queue cleared.")
    except Exception as e:
        print(f"[-] FAILURE: Successful dispatch test failed: {e}")
        sys.exit(1)

    print("\n==========================================================")
    print("ALL NOTIFICATION TESTS PASSED")
    print("==========================================================")


if __name__ == '__main__':
    run_tests()

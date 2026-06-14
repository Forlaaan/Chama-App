# execution/notification_service.py
#
# NotificationService: Queues outgoing SMS notifications for offline-first
# dispatch via the Africa's Talking SMS API.
#
# SyncWorker: Drains the pending_notifications queue when connectivity is
# restored, applying exponential backoff (up to 3 retries) before marking
# a notification as FAILED.
#
# Follows BR-010 (Offline First) and the Blueprint notification types:
#   CONTRIBUTION_CONFIRMATION, LOAN_APPROVED, LOAN_REMINDER,
#   PENALTY_ALERT, SYSTEM_ALERT

import json
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable

# Valid notification types per Blueprint Section 3
VALID_NOTIFICATION_TYPES = frozenset({
    'CONTRIBUTION_CONFIRMATION',
    'LOAN_APPROVED',
    'LOAN_REMINDER',
    'PENALTY_ALERT',
    'SYSTEM_ALERT',
})

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY_SECONDS = 2  # Exponential backoff: 2^retryCount * BASE_DELAY_SECONDS


class NotificationService:
    """
    Responsible for creating Notification records and enqueuing them
    into the pending_notifications offline queue.
    """

    def __init__(self, db_service):
        """
        Args:
            db_service: An instance of controllers.DatabaseService with
                        access to the Notification and pending_notifications tables.
        """
        self.db = db_service

    def queue_notification(
        self,
        member_id: str,
        phone_number: str,
        notification_type: str,
        message: str,
        actor_id: str,
    ) -> Dict[str, Any]:
        """
        Create a Notification record (status=PENDING) and enqueue it in the
        pending_notifications table for later dispatch by SyncWorker.

        Args:
            member_id: FK to the Member receiving the SMS.
            phone_number: E.164 formatted phone number (e.g. +254711111111).
            notification_type: One of VALID_NOTIFICATION_TYPES.
            message: The SMS body text.
            actor_id: The actor who triggered this notification.

        Returns:
            Dict with notificationId and pendingId.

        Raises:
            ValueError: If notification_type is not in the allowed set.
        """
        if notification_type not in VALID_NOTIFICATION_TYPES:
            raise ValueError(
                f"Invalid notification type '{notification_type}'. "
                f"Must be one of: {', '.join(sorted(VALID_NOTIFICATION_TYPES))}"
            )

        # 1. Create the parent Notification record
        notif = {
            'memberId': member_id,
            'phoneNumber': phone_number,
            'type': notification_type,
            'message': message,
            'sentAt': None,
            'status': 'PENDING',
        }
        notification_id = self.db.create_notification(notif, actor_id)

        # 2. Enqueue into pending_notifications for offline dispatch
        now = datetime.utcnow().isoformat() + 'Z'
        pending = {
            'notificationId': notification_id,
            'phoneNumber': phone_number,
            'message': message,
            'retryCount': 0,
            'nextRetryAt': now,
            'status': 'QUEUED',
        }
        pending_id = self.db.add_to_pending_queue(pending)

        return {
            'notificationId': notification_id,
            'pendingId': pending_id,
            'status': 'QUEUED',
        }


class SyncWorker:
    """
    Processes the pending_notifications queue. Call process_queue() when
    connectivity is detected. Uses exponential backoff on API failures
    and marks notifications FAILED after MAX_RETRIES attempts.
    """

    AT_API_URL = 'https://api.africastalking.com/version1/messaging'

    def __init__(
        self,
        db_service,
        at_username: str,
        at_api_key: str,
        send_sms_fn: Optional[Callable] = None,
    ):
        """
        Args:
            db_service: An instance of controllers.DatabaseService.
            at_username: Africa's Talking username.
            at_api_key: Africa's Talking API key.
            send_sms_fn: Optional override for the HTTP call (for testing).
                         Signature: send_sms_fn(phone, message) -> bool
        """
        self.db = db_service
        self.at_username = at_username
        self.at_api_key = at_api_key
        self._send_sms_fn = send_sms_fn or self._send_via_africastalking

    def _send_via_africastalking(self, phone_number: str, message: str) -> bool:
        """
        Send an SMS via Africa's Talking REST API.

        Returns True on success (HTTP 201), raises on network/API failure.
        """
        data = urllib.parse.urlencode({
            'username': self.at_username,
            'to': phone_number,
            'message': message,
        }).encode('utf-8')

        req = urllib.request.Request(
            self.AT_API_URL,
            data=data,
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'apiKey': self.at_api_key,
            },
            method='POST',
        )

        response = urllib.request.urlopen(req, timeout=15)
        if response.status == 201:
            return True
        raise ConnectionError(f"Africa's Talking API returned status {response.status}")

    def process_queue(self, current_time: Optional[str] = None) -> Dict[str, Any]:
        """
        Process all due pending notifications.

        Args:
            current_time: ISO 8601 timestamp. Defaults to now.

        Returns:
            Summary dict with counts of sent, retried, and failed messages.
        """
        if current_time is None:
            current_time = datetime.utcnow().isoformat() + 'Z'

        due_notifications = self.db.get_due_pending_notifications(current_time)

        results = {
            'processed': 0,
            'sent': 0,
            'retried': 0,
            'failed': 0,
            'details': [],
        }

        for pending in due_notifications:
            results['processed'] += 1
            outcome = self._process_single(pending)
            results[outcome['result']] += 1
            results['details'].append(outcome)

        return results

    def _process_single(self, pending: Dict[str, Any]) -> Dict[str, Any]:
        """
        Attempt to send a single pending notification.

        On success: Remove from queue, update Notification status to SENT.
        On failure with retries remaining: Increment retryCount, set nextRetryAt
            with exponential backoff.
        On failure with no retries left: Remove from queue, update Notification
            status to FAILED.
        """
        pending_id = pending['id']
        notification_id = pending['notificationId']
        retry_count = pending['retryCount']

        try:
            self._send_sms_fn(pending['phoneNumber'], pending['message'])

            # Success: clean up queue and mark as SENT
            sent_at = datetime.utcnow().isoformat() + 'Z'
            self.db.remove_pending_notification(pending_id)
            self.db.update_notification_status(notification_id, 'SENT', sent_at=sent_at)

            return {
                'pendingId': pending_id,
                'notificationId': notification_id,
                'result': 'sent',
            }

        except Exception as e:
            new_retry_count = retry_count + 1

            if new_retry_count >= MAX_RETRIES:
                # Exhausted retries — mark as FAILED
                self.db.remove_pending_notification(pending_id)
                self.db.update_notification_status(notification_id, 'FAILED')

                return {
                    'pendingId': pending_id,
                    'notificationId': notification_id,
                    'result': 'failed',
                    'reason': f'Max retries ({MAX_RETRIES}) exceeded. Last error: {e}',
                }

            # Exponential backoff: 2^retryCount * BASE_DELAY_SECONDS
            delay = (2 ** new_retry_count) * BASE_DELAY_SECONDS
            next_retry = datetime.utcnow() + timedelta(seconds=delay)
            next_retry_str = next_retry.isoformat() + 'Z'

            self.db.update_pending_notification(pending_id, {
                'retryCount': new_retry_count,
                'nextRetryAt': next_retry_str,
            })

            return {
                'pendingId': pending_id,
                'notificationId': notification_id,
                'result': 'retried',
                'retryCount': new_retry_count,
                'nextRetryAt': next_retry_str,
                'reason': str(e),
            }

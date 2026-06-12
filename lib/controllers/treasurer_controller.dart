// lib/controllers/treasurer_controller.dart

import '../services/database_service.dart';
import '../utils/decimal.dart';

class SecurityException implements Exception {
  final String message;
  SecurityException(this.message);
  @override
  String toString() => message;
}

class TreasurerController {
  final DatabaseService _dbService = DatabaseService();

  // Verify that actor has ADMIN role (Treasurer)
  Future<Member> _verifyIsAdmin(String actorId, String operationName) async {
    final actor = await _dbService.getMember(actorId);
    if (actor == null) {
      throw SecurityException('Unauthorized Access: Actor not found.');
    }
    if (actor.role != 'ADMIN') {
      throw SecurityException('Unauthorized Access: Actor does not have permissions for $operationName.');
    }
    return actor;
  }

  /// BR-003: recordContribution
  /// Validates contribution amount, creates append-only transaction,
  /// updates member account balance, recalculates group totals, and registers an SMS notification.
  Future<Map<String, dynamic>> recordContribution({
    required String actorId,
    required String memberId,
    required String groupId,
    required String amount,
    required String description,
  }) async {
    // 1. Check authorization
    await _verifyIsAdmin(actorId, 'recordContribution');

    // 2. Validate amount
    final Decimal contributionAmount;
    try {
      contributionAmount = Decimal.parse(amount);
    } catch (e) {
      throw ArgumentError('Invalid amount format: $amount');
    }

    if (contributionAmount <= Decimal.zero()) {
      throw ArgumentError('Contribution amount must be greater than zero.');
    }

    // 3. Retrieve member
    final member = await _dbService.getMember(memberId);
    if (member == null) {
      throw ArgumentError('Member not found: $memberId');
    }

    // 4. Create Transaction entity (Appends to ledger)
    final tx = Transaction(
      id: '', // DatabaseService will generate UUID
      memberId: memberId,
      groupId: groupId,
      loanId: null,
      amount: contributionAmount.toString(),
      transactionType: 'CONTRIBUTION',
      description: description,
      createdBy: actorId,
      timestamp: '',
      createdAt: '',
      updatedAt: '',
      auditSignature: '',
    );
    await _dbService.createTransaction(tx, actorId);

    // 5. Update member balance using safe Decimal arithmetic
    final currentBalance = Decimal.parse(member.accountBalance);
    final newBalance = currentBalance + contributionAmount;
    final updatedMember = member.copyWith(
      accountBalance: newBalance.toString(),
    );
    await _dbService.updateMember(updatedMember, actorId);

    // 6. Update group totals
    final allMembers = await _dbService.getAllMembers();
    var groupTotal = Decimal.zero();
    for (var m in allMembers) {
      if (m.groupId == groupId) {
        groupTotal += Decimal.parse(m.accountBalance);
      }
    }

    // 7. Generate SMS confirmation notification
    final notificationMsg = 'Dear ${member.fullName}, your contribution of $amount has been recorded. New balance: $newBalance.';
    final notif = Notification(
      id: '',
      memberId: memberId,
      phoneNumber: member.phoneNumber,
      type: 'CONTRIBUTION_CONFIRMATION',
      message: notificationMsg,
      sentAt: null,
      status: 'PENDING',
      createdAt: '',
      updatedAt: '',
      auditSignature: '',
    );
    await _dbService.createNotification(notif, actorId);

    // 8. Return standardized JSON response
    return {
      'success': true,
      'message': 'Contribution recorded successfully.',
      'data': {
        'memberId': memberId,
        'amount': amount,
        'newBalance': newBalance.toString(),
        'groupTotalBalance': groupTotal.toString(),
      }
    };
  }

  /// BR-005: approveLoan
  /// Updates loan status to ACTIVE, creates disbursement transaction,
  /// updates member account balance, and generates SMS confirmation.
  Future<Map<String, dynamic>> approveLoan({
    required String actorId,
    required String loanId,
  }) async {
    // 1. Check authorization
    await _verifyIsAdmin(actorId, 'approveLoan');

    // 2. Retrieve Loan
    final loan = await _dbService.getLoan(loanId);
    if (loan == null) {
      throw ArgumentError('Loan not found: $loanId');
    }

    if (loan.status != 'PENDING') {
      throw StateError('Only PENDING loans can be approved. Current status: ${loan.status}');
    }

    // 3. Update Loan status to ACTIVE
    final updatedLoan = loan.copyWith(
      status: 'ACTIVE',
      approvedBy: actorId,
    );
    await _dbService.updateLoan(updatedLoan, actorId);

    // 4. Create Loan Disbursement Transaction
    final tx = Transaction(
      id: '',
      memberId: loan.memberId,
      groupId: loan.groupId,
      loanId: loan.id,
      amount: loan.principalAmount,
      transactionType: 'LOAN_DISBURSEMENT',
      description: 'Loan disbursement for approved loan ${loan.id}',
      createdBy: actorId,
      timestamp: '',
      createdAt: '',
      updatedAt: '',
      auditSignature: '',
    );
    await _dbService.createTransaction(tx, actorId);

    // 5. Update Member Balance (add principal to account balance)
    final member = await _dbService.getMember(loan.memberId);
    if (member == null) {
      throw ArgumentError('Member associated with loan not found: ${loan.memberId}');
    }

    final currentBalance = Decimal.parse(member.accountBalance);
    final principal = Decimal.parse(loan.principalAmount);
    final newBalance = currentBalance + principal;
    final updatedMember = member.copyWith(
      accountBalance: newBalance.toString(),
    );
    await _dbService.updateMember(updatedMember, actorId);

    // 6. Send SMS Notification (create Notification record)
    final notificationMsg = 'Dear ${member.fullName}, your loan of ${loan.principalAmount} has been approved. Status: ACTIVE.';
    final notif = Notification(
      id: '',
      memberId: loan.memberId,
      phoneNumber: member.phoneNumber,
      type: 'LOAN_APPROVED',
      message: notificationMsg,
      sentAt: null,
      status: 'PENDING',
      createdAt: '',
      updatedAt: '',
      auditSignature: '',
    );
    await _dbService.createNotification(notif, actorId);

    // 7. Return standardized response
    return {
      'success': true,
      'message': 'Loan approved and disbursed successfully.',
      'data': {
        'loanId': loanId,
        'memberId': loan.memberId,
        'principalAmount': loan.principalAmount,
        'newBalance': newBalance.toString(),
      }
    };
  }
}

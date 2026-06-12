// lib/controllers/member_controller.dart

import '../services/database_service.dart';
import '../utils/decimal.dart';
import 'treasurer_controller.dart' show SecurityException;

class MemberController {
  final DatabaseService _dbService = DatabaseService();

  // Verify actor has either MEMBER or ADMIN role
  Future<Member> _verifyIsMember(String actorId, String operationName) async {
    final actor = await _dbService.getMember(actorId);
    if (actor == null) {
      throw SecurityException('Unauthorized Access: Actor not found.');
    }
    if (actor.role != 'MEMBER' && actor.role != 'ADMIN') {
      throw SecurityException('Unauthorized Access: Actor does not have permissions for $operationName.');
    }
    return actor;
  }

  /// BR-004: requestLoan
  /// Submits a loan request. Status begins as PENDING.
  /// BR-006: interest calculation placeholder:
  /// totalRepayable = principalAmount + (principalAmount * interestRate)
  Future<Map<String, dynamic>> requestLoan({
    required String actorId,
    required String groupId,
    required String principalAmount,
    required String interestRate,
    required String dueDate,
  }) async {
    // 1. Check authorization (Admin or Member)
    await _verifyIsMember(actorId, 'requestLoan');

    // 2. Validate principal
    final Decimal principal;
    final Decimal rate;
    try {
      principal = Decimal.parse(principalAmount);
      rate = Decimal.parse(interestRate);
    } catch (e) {
      throw ArgumentError('Invalid numeric format for principal or interest rate.');
    }

    if (principal <= Decimal.zero()) {
      throw ArgumentError('Principal amount must be greater than zero.');
    }
    if (rate < Decimal.zero()) {
      throw ArgumentError('Interest rate cannot be negative.');
    }

    // 3. Calculate total repayable using exact Decimal arithmetic (BR-006)
    final interest = principal * rate;
    final totalRepayable = principal + interest;

    // 4. Create Loan entity
    final loan = Loan(
      id: '', // DatabaseService will generate UUID
      memberId: actorId,
      groupId: groupId,
      principalAmount: principal.toString(),
      interestRate: rate.toString(),
      totalRepayable: totalRepayable.toString(),
      amountPaid: '0',
      dueDate: dueDate,
      status: 'PENDING',
      approvedBy: null,
      createdAt: '',
      updatedAt: '',
      auditSignature: '',
    );
    await _dbService.createLoan(loan, actorId);

    // 5. Return standardized JSON response
    return {
      'success': true,
      'message': 'Loan request submitted successfully.',
      'data': {
        'memberId': actorId,
        'principalAmount': principal.toString(),
        'interestRate': rate.toString(),
        'totalRepayable': totalRepayable.toString(),
        'status': 'PENDING',
      }
    };
  }

  /// View personal balance
  Future<Map<String, dynamic>> viewPersonalBalance({required String actorId}) async {
    final member = await _verifyIsMember(actorId, 'viewPersonalBalance');

    return {
      'success': true,
      'message': 'Account balance retrieved successfully.',
      'data': {
        'memberId': actorId,
        'accountBalance': member.accountBalance,
      }
    };
  }

  /// View contribution history
  Future<Map<String, dynamic>> viewContributionHistory({required String actorId}) async {
    await _verifyIsMember(actorId, 'viewContributionHistory');

    final transactions = await _dbService.getAllTransactions();
    final contributions = transactions
        .where((tx) => tx.memberId == actorId && tx.transactionType == 'CONTRIBUTION')
        .map((tx) => tx.toMap())
        .toList();

    return {
      'success': true,
      'message': 'Contribution history retrieved successfully.',
      'data': {
        'memberId': actorId,
        'contributions': contributions,
      }
    };
  }

  /// View transaction history
  Future<Map<String, dynamic>> viewTransactionHistory({required String actorId}) async {
    await _verifyIsMember(actorId, 'viewTransactionHistory');

    final transactions = await _dbService.getAllTransactions();
    final personalHistory = transactions
        .where((tx) => tx.memberId == actorId)
        .map((tx) => tx.toMap())
        .toList();

    return {
      'success': true,
      'message': 'Transaction history retrieved successfully.',
      'data': {
        'memberId': actorId,
        'transactions': personalHistory,
      }
    };
  }
}

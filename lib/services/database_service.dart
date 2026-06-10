import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:path/path.dart';
import 'package:flutter/services.dart' show rootBundle;

// ==========================================
// Entity Models
// ==========================================

class Member {
  final String id;
  final String groupId;
  final String fullName;
  final String phoneNumber;
  final String? email;
  final String passwordHash;
  final String role; // 'MEMBER' or 'ADMIN'
  final String accountBalance;
  final String? deviceToken;
  final String createdAt;
  final String updatedAt;
  final String auditSignature;

  Member({
    required this.id,
    required this.groupId,
    required this.fullName,
    required this.phoneNumber,
    this.email,
    required this.passwordHash,
    required this.role,
    required this.accountBalance,
    this.deviceToken,
    required this.createdAt,
    required this.updatedAt,
    required this.auditSignature,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'groupId': groupId,
      'fullName': fullName,
      'phoneNumber': phoneNumber,
      'email': email,
      'passwordHash': passwordHash,
      'role': role,
      'accountBalance': accountBalance,
      'deviceToken': deviceToken,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'auditSignature': auditSignature,
    };
  }

  factory Member.fromMap(Map<String, dynamic> map) {
    return Member(
      id: map['id'] as String,
      groupId: map['groupId'] as String,
      fullName: map['fullName'] as String,
      phoneNumber: map['phoneNumber'] as String,
      email: map['email'] as String?,
      passwordHash: map['passwordHash'] as String,
      role: map['role'] as String,
      accountBalance: map['accountBalance'] as String,
      deviceToken: map['deviceToken'] as String?,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
      auditSignature: map['auditSignature'] as String,
    );
  }

  Member copyWith({
    String? id,
    String? groupId,
    String? fullName,
    String? phoneNumber,
    String? email,
    String? passwordHash,
    String? role,
    String? accountBalance,
    String? deviceToken,
    String? createdAt,
    String? updatedAt,
    String? auditSignature,
  }) {
    return Member(
      id: id ?? this.id,
      groupId: groupId ?? this.groupId,
      fullName: fullName ?? this.fullName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      email: email ?? this.email,
      passwordHash: passwordHash ?? this.passwordHash,
      role: role ?? this.role,
      accountBalance: accountBalance ?? this.accountBalance,
      deviceToken: deviceToken ?? this.deviceToken,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      auditSignature: auditSignature ?? this.auditSignature,
    );
  }
}

class Transaction {
  final String id;
  final String memberId;
  final String groupId;
  final String? loanId;
  final String amount;
  final String transactionType; // CONTRIBUTION, LOAN_DISBURSEMENT, LOAN_REPAYMENT, etc.
  final String? description;
  final String createdBy;
  final String timestamp;
  final String createdAt;
  final String updatedAt;
  final String auditSignature;

  Transaction({
    required this.id,
    required this.memberId,
    required this.groupId,
    this.loanId,
    required this.amount,
    required this.transactionType,
    this.description,
    required this.createdBy,
    required this.timestamp,
    required this.createdAt,
    required this.updatedAt,
    required this.auditSignature,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'memberId': memberId,
      'groupId': groupId,
      'loanId': loanId,
      'amount': amount,
      'transactionType': transactionType,
      'description': description,
      'createdBy': createdBy,
      'timestamp': timestamp,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'auditSignature': auditSignature,
    };
  }

  factory Transaction.fromMap(Map<String, dynamic> map) {
    return Transaction(
      id: map['id'] as String,
      memberId: map['memberId'] as String,
      groupId: map['groupId'] as String,
      loanId: map['loanId'] as String?,
      amount: map['amount'] as String,
      transactionType: map['transactionType'] as String,
      description: map['description'] as String?,
      createdBy: map['createdBy'] as String,
      timestamp: map['timestamp'] as String,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
      auditSignature: map['auditSignature'] as String,
    );
  }

  Transaction copyWith({
    String? id,
    String? memberId,
    String? groupId,
    String? loanId,
    String? amount,
    String? transactionType,
    String? description,
    String? createdBy,
    String? timestamp,
    String? createdAt,
    String? updatedAt,
    String? auditSignature,
  }) {
    return Transaction(
      id: id ?? this.id,
      memberId: memberId ?? this.memberId,
      groupId: groupId ?? this.groupId,
      loanId: loanId ?? this.loanId,
      amount: amount ?? this.amount,
      transactionType: transactionType ?? this.transactionType,
      description: description ?? this.description,
      createdBy: createdBy ?? this.createdBy,
      timestamp: timestamp ?? this.timestamp,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      auditSignature: auditSignature ?? this.auditSignature,
    );
  }
}

class Loan {
  final String id;
  final String memberId;
  final String groupId;
  final String principalAmount;
  final String interestRate;
  final String totalRepayable;
  final String amountPaid;
  final String dueDate;
  final String status; // PENDING, APPROVED, ACTIVE, OVERDUE, PAID, REJECTED
  final String? approvedBy;
  final String createdAt;
  final String updatedAt;
  final String auditSignature;

  Loan({
    required this.id,
    required this.memberId,
    required this.groupId,
    required this.principalAmount,
    required this.interestRate,
    required this.totalRepayable,
    required this.amountPaid,
    required this.dueDate,
    required this.status,
    this.approvedBy,
    required this.createdAt,
    required this.updatedAt,
    required this.auditSignature,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'memberId': memberId,
      'groupId': groupId,
      'principalAmount': principalAmount,
      'interestRate': interestRate,
      'totalRepayable': totalRepayable,
      'amountPaid': amountPaid,
      'dueDate': dueDate,
      'status': status,
      'approvedBy': approvedBy,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'auditSignature': auditSignature,
    };
  }

  factory Loan.fromMap(Map<String, dynamic> map) {
    return Loan(
      id: map['id'] as String,
      memberId: map['memberId'] as String,
      groupId: map['groupId'] as String,
      principalAmount: map['principalAmount'] as String,
      interestRate: map['interestRate'] as String,
      totalRepayable: map['totalRepayable'] as String,
      amountPaid: map['amountPaid'] as String,
      dueDate: map['dueDate'] as String,
      status: map['status'] as String,
      approvedBy: map['approvedBy'] as String?,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
      auditSignature: map['auditSignature'] as String,
    );
  }

  Loan copyWith({
    String? id,
    String? memberId,
    String? groupId,
    String? principalAmount,
    String? interestRate,
    String? totalRepayable,
    String? amountPaid,
    String? dueDate,
    String? status,
    String? approvedBy,
    String? createdAt,
    String? updatedAt,
    String? auditSignature,
  }) {
    return Loan(
      id: id ?? this.id,
      memberId: memberId ?? this.memberId,
      groupId: groupId ?? this.groupId,
      principalAmount: principalAmount ?? this.principalAmount,
      interestRate: interestRate ?? this.interestRate,
      totalRepayable: totalRepayable ?? this.totalRepayable,
      amountPaid: amountPaid ?? this.amountPaid,
      dueDate: dueDate ?? this.dueDate,
      status: status ?? this.status,
      approvedBy: approvedBy ?? this.approvedBy,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      auditSignature: auditSignature ?? this.auditSignature,
    );
  }
}

// ==========================================
// Database Service
// ==========================================

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  static Database? _database;

  factory DatabaseService() {
    return _instance;
  }

  DatabaseService._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    String databasesPath = await getDatabasesPath();
    String path = join(databasesPath, 'chama_app.db');

    // Secure local SQLCipher encryption key (stored securely in practice)
    const String encryptionKey = 'SECRET_KEY';

    return await openDatabase(
      path,
      password: encryptionKey,
      version: 1,
      onCreate: _onCreate,
      onConfigure: _onConfigure,
    );
  }

  Future<void> _onConfigure(Database db) async {
    await db.execute('PRAGMA foreign_keys = ON;');
  }

  Future<void> _onCreate(Database db, int version) async {
    String schema = await rootBundle.loadString('assets/schema.sql');
    List<String> statements = schema.split(';');
    for (String statement in statements) {
      if (statement.trim().isNotEmpty && !statement.trim().toUpperCase().startsWith('PRAGMA')) {
        await db.execute(statement.trim() + ';');
      }
    }
  }

  // ==========================================
  // Helper Methods (Audit & UUID)
  // ==========================================

  String _generateUuid() {
    final random = Random.secure();
    final values = List<int>.generate(16, (i) => random.nextInt(256));
    values[6] = (values[6] & 0x0f) | 0x40; // Set version 4
    values[8] = (values[8] & 0x3f) | 0x80; // Set variant
    final hex = values.map((b) => b.toRadixString(16).padLeft(2, '0')).toList();
    return '${hex[0]}${hex[1]}${hex[2]}${hex[3]}-'
        '${hex[4]}${hex[5]}-'
        '${hex[6]}${hex[7]}-'
        '${hex[8]}${hex[9]}-'
        '${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}';
  }

  String _generateAuditSignature(String recordId, String actorId, String timestamp, String dataPayload) {
    final payload = '$recordId|$actorId|$timestamp|$dataPayload';
    final bytes = utf8.encode(payload);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  // ==========================================
  // Member CRUD
  // ==========================================

  Future<void> createMember(Member member, String actorId) async {
    final db = await database;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final id = member.id.isEmpty ? _generateUuid() : member.id;
    
    final signatureData = '${member.fullName}|${member.phoneNumber}|${member.accountBalance}';
    final signature = _generateAuditSignature(id, actorId, timestamp, signatureData);

    final finalMember = member.copyWith(
      id: id,
      createdAt: timestamp,
      updatedAt: timestamp,
      auditSignature: signature,
    );

    await db.insert('Member', finalMember.toMap());
  }

  Future<Member?> getMember(String id) async {
    final db = await database;
    final maps = await db.query(
      'Member',
      where: 'id = ?',
      whereArgs: [id],
    );

    if (maps.isEmpty) return null;
    return Member.fromMap(maps.first);
  }

  Future<List<Member>> getAllMembers() async {
    final db = await database;
    final maps = await db.query('Member');
    return maps.map((m) => Member.fromMap(m)).toList();
  }

  Future<void> updateMember(Member member, String actorId) async {
    final db = await database;
    final timestamp = DateTime.now().toUtc().toIso8601String();

    final signatureData = '${member.fullName}|${member.phoneNumber}|${member.accountBalance}';
    final signature = _generateAuditSignature(member.id, actorId, timestamp, signatureData);

    final finalMember = member.copyWith(
      updatedAt: timestamp,
      auditSignature: signature,
    );

    await db.update(
      'Member',
      finalMember.toMap(),
      where: 'id = ?',
      whereArgs: [member.id],
    );
  }

  Future<void> deleteMember(String id) async {
    final db = await database;
    await db.delete(
      'Member',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // ==========================================
  // Loan CRUD
  // ==========================================

  Future<void> createLoan(Loan loan, String actorId) async {
    final db = await database;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final id = loan.id.isEmpty ? _generateUuid() : loan.id;

    final signatureData = '${loan.principalAmount}|${loan.interestRate}|${loan.status}';
    final signature = _generateAuditSignature(id, actorId, timestamp, signatureData);

    final finalLoan = loan.copyWith(
      id: id,
      createdAt: timestamp,
      updatedAt: timestamp,
      auditSignature: signature,
    );

    await db.insert('Loan', finalLoan.toMap());
  }

  Future<Loan?> getLoan(String id) async {
    final db = await database;
    final maps = await db.query(
      'Loan',
      where: 'id = ?',
      whereArgs: [id],
    );

    if (maps.isEmpty) return null;
    return Loan.fromMap(maps.first);
  }

  Future<List<Loan>> getAllLoans() async {
    final db = await database;
    final maps = await db.query('Loan');
    return maps.map((l) => Loan.fromMap(l)).toList();
  }

  Future<void> updateLoan(Loan loan, String actorId) async {
    final db = await database;
    final timestamp = DateTime.now().toUtc().toIso8601String();

    final signatureData = '${loan.principalAmount}|${loan.interestRate}|${loan.status}';
    final signature = _generateAuditSignature(loan.id, actorId, timestamp, signatureData);

    final finalLoan = loan.copyWith(
      updatedAt: timestamp,
      auditSignature: signature,
    );

    await db.update(
      'Loan',
      finalLoan.toMap(),
      where: 'id = ?',
      whereArgs: [loan.id],
    );
  }

  Future<void> deleteLoan(String id) async {
    final db = await database;
    await db.delete(
      'Loan',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // ==========================================
  // Transaction (Immutable - Create and Read Only)
  // ==========================================

  Future<void> createTransaction(Transaction transaction, String actorId) async {
    final db = await database;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final id = transaction.id.isEmpty ? _generateUuid() : transaction.id;

    final signatureData = '${transaction.amount}|${transaction.transactionType}';
    final signature = _generateAuditSignature(id, actorId, timestamp, signatureData);

    final finalTransaction = transaction.copyWith(
      id: id,
      timestamp: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      auditSignature: signature,
    );

    await db.insert('Transaction', finalTransaction.toMap());
  }

  Future<Transaction?> getTransaction(String id) async {
    final db = await database;
    final maps = await db.query(
      'Transaction',
      where: 'id = ?',
      whereArgs: [id],
    );

    if (maps.isEmpty) return null;
    return Transaction.fromMap(maps.first);
  }

  Future<List<Transaction>> getAllTransactions() async {
    final db = await database;
    final maps = await db.query('Transaction');
    return maps.map((t) => Transaction.fromMap(t)).toList();
  }

  // Explicitly prevent updates on Transaction
  Future<void> updateTransaction(Transaction transaction, String actorId) async {
    throw UnsupportedError('Transactions are immutable (BR-002) and cannot be updated.');
  }

  // Explicitly prevent deletions on Transaction
  Future<void> deleteTransaction(String id) async {
    throw UnsupportedError('Transactions are immutable (BR-002) and cannot be deleted.');
  }
}

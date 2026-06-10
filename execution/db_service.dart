import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:path/path.dart';
import 'package:flutter/services.dart' show rootBundle;

class DbService {
  static final DbService _instance = DbService._internal();
  static Database? _database;

  factory DbService() {
    return _instance;
  }

  DbService._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    String databasesPath = await getDatabasesPath();
    String path = join(databasesPath, 'chama_app.db');

    // IMPORTANT: Password must be securely obtained in production (e.g., flutter_secure_storage)
    String password = 'SECRET_KEY'; 

    return await openDatabase(
      path,
      password: password,
      version: 1,
      onCreate: _onCreate,
      onConfigure: _onConfigure,
    );
  }

  Future<void> _onConfigure(Database db) async {
    await db.execute('PRAGMA foreign_keys = ON;');
  }

  Future<void> _onCreate(Database db, int version) async {
    // Note: sqflite_sqlcipher applies the PRAGMA key internally via openDatabase password.
    // Read the schema file from assets
    String schema = await rootBundle.loadString('assets/schema.sql');
    
    // Simple naive split for execution
    List<String> statements = schema.split(';');
    for (String statement in statements) {
      if (statement.trim().isNotEmpty && !statement.trim().toUpperCase().startsWith('PRAGMA')) {
        await db.execute(statement.trim() + ';');
      }
    }
  }
}

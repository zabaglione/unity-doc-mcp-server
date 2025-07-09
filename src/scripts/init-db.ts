#!/usr/bin/env tsx

import { DatabaseConnection } from '../database/connection.js';
import { Migration } from '../database/migration.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger().info('Initializing Unity Documentation database...');

  try {
    // データベース接続を初期化
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initialize();
    const db = dbConnection.getDatabase();
    
    // マイグレーションを実行
    const migration = new Migration(db);
    
    if (migration.needsMigration()) {
      logger().info('Database needs migration');
      migration.migrate();
    } else {
      logger().info('Database schema is up to date');
    }
    
    // テーブル情報を表示
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all() as Array<{ name: string }>;
    
    logger().info('Available tables:', { tables: tables.map(t => t.name) });
    
    // ドキュメント数を確認
    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    logger().info(`Total documents in database: ${docCount.count}`);
    
    logger().info('✅ Database initialization completed');
    
  } catch (error) {
    logger().error('Database initialization failed:', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

main().catch(console.error);
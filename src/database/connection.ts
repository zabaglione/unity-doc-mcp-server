import Database from 'better-sqlite3';
import { ConfigManager } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ensureDir } from '../utils/filesystem.js';
import { dirname } from 'path';
import { Migration } from './migration.js';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: Database.Database | null = null;
  private config = ConfigManager.getInstance().getConfig();

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Initialize database connection
   */
  public async initialize(): Promise<void> {
    if (this.db) {
      logger().debug('Database already initialized');
      return;
    }

    try {
      // Ensure database directory exists
      await ensureDir(dirname(this.config.database.path));

      // Create database connection
      this.db = new Database(this.config.database.path, this.config.database.options);
      logger().info('Database connection established', { path: this.config.database.path });

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Set journal mode to WAL for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Run migrations
      const migration = new Migration(this.db);
      migration.migrate();

    } catch (error) {
      logger().error('Failed to initialize database', { error });
      throw error;
    }
  }

  /**
   * Get database instance
   */
  public getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger().info('Database connection closed');
    }
  }

  /**
   * Execute a transaction
   */
  public transaction<T>(fn: (db: Database.Database) => T): T {
    const db = this.getDatabase();
    return db.transaction(fn)(db);
  }

  /**
   * Prepare a statement
   */
  public prepare(sql: string): Database.Statement {
    return this.getDatabase().prepare(sql);
  }

  /**
   * Execute SQL
   */
  public exec(sql: string): void {
    this.getDatabase().exec(sql);
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Get database statistics
   */
  public getStats(): {
    documentCount: number;
    databaseSize: number;
    walSize: number;
  } {
    const db = this.getDatabase();

    const documentCount = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }).count;
    
    const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
    const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
    const databaseSize = pageCount * pageSize;

    const walPages = (db.prepare('PRAGMA wal_autocheckpoint').get() as { wal_autocheckpoint: number }).wal_autocheckpoint;
    const walSize = walPages * pageSize;

    return {
      documentCount,
      databaseSize,
      walSize,
    };
  }

  /**
   * Vacuum database to reclaim space
   */
  public vacuum(): void {
    const db = this.getDatabase();
    logger().info('Starting database vacuum');
    db.exec('VACUUM');
    logger().info('Database vacuum completed');
  }

  /**
   * Backup database
   */
  public async backup(destinationPath: string): Promise<void> {
    const db = this.getDatabase();
    
    // Ensure backup directory exists
    await ensureDir(dirname(destinationPath));
    
    logger().info('Starting database backup', { destination: destinationPath });
    
    await db.backup(destinationPath);
    
    logger().info('Database backup completed');
  }
}

// Export convenience functions
export const getDb = (): Database.Database => DatabaseConnection.getInstance().getDatabase();
export const initializeDb = async (): Promise<void> => DatabaseConnection.getInstance().initialize();
export const closeDb = (): void => DatabaseConnection.getInstance().close();
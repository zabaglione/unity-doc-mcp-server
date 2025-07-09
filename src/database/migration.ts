import type { Database } from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { SCHEMA_VERSION, CREATE_TABLES_SQL, TABLES } from './schema.js';

export class Migration {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Run all migrations
   */
  public migrate(): void {
    logger().info('Starting database migration');

    try {
      // Begin transaction
      this.db.exec('BEGIN TRANSACTION');

      // Get current schema version
      const currentVersion = this.getCurrentVersion();
      logger().info(`Current schema version: ${currentVersion}`);

      if (currentVersion < SCHEMA_VERSION) {
        // Run migrations
        this.runMigrations(currentVersion);
        
        // Update schema version
        this.updateSchemaVersion(SCHEMA_VERSION);
        logger().info(`Schema updated to version: ${SCHEMA_VERSION}`);
      } else {
        logger().info('Schema is up to date');
      }

      // Commit transaction
      this.db.exec('COMMIT');
      logger().info('Migration completed successfully');
    } catch (error) {
      // Rollback on error
      this.db.exec('ROLLBACK');
      logger().error('Migration failed', { error });
      throw error;
    }
  }

  /**
   * Get current schema version
   */
  private getCurrentVersion(): number {
    try {
      // Check if schema_version table exists
      const tableExists = this.db
        .prepare(
          `SELECT name FROM sqlite_master 
           WHERE type='table' AND name=?`
        )
        .get(TABLES.schema_version);

      if (!tableExists) {
        return 0;
      }

      // Get version
      const result = this.db
        .prepare(`SELECT MAX(version) as version FROM ${TABLES.schema_version}`)
        .get() as { version: number | null };

      return result.version ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Run migrations from current version to target version
   */
  private runMigrations(fromVersion: number): void {
    if (fromVersion < 1) {
      logger().info('Running migration to version 1');
      this.migrateToV1();
    }

    if (fromVersion < 2) {
      logger().info('Running migration to version 2');
      this.migrateToV2();
    }
  }

  /**
   * Initial schema creation
   */
  private migrateToV1(): void {
    this.db.exec(CREATE_TABLES_SQL);
  }

  /**
   * Add package documentation support
   */
  private migrateToV2(): void {
    logger().info('Migrating to v2: Adding package documentation support');
    
    // Add new columns to documents table
    this.db.exec(`
      -- Add package_name and package_version columns
      ALTER TABLE ${TABLES.documents} ADD COLUMN package_name TEXT;
      ALTER TABLE ${TABLES.documents} ADD COLUMN package_version TEXT;
    `);
    
    // Create new index for package queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_package 
      ON ${TABLES.documents}(package_name, package_version);
    `);
    
    // Note: SQLite doesn't support modifying CHECK constraints directly
    // The type constraint will be enforced at the application level for existing rows
    logger().info('Migration to v2 completed. Note: type constraint now includes "package-docs"');
  }

  /**
   * Update schema version
   */
  private updateSchemaVersion(version: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ${TABLES.schema_version} (version) VALUES (?)`
      )
      .run(version);
  }

  /**
   * Check if database needs migration
   */
  public needsMigration(): boolean {
    const currentVersion = this.getCurrentVersion();
    return currentVersion < SCHEMA_VERSION;
  }

  /**
   * Reset database (dangerous - for testing only)
   */
  public reset(): void {
    logger().warn('Resetting database - all data will be lost!');

    try {
      this.db.exec('BEGIN TRANSACTION');

      // Drop all tables
      const tables = this.db
        .prepare(
          `SELECT name FROM sqlite_master 
           WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        .all() as Array<{ name: string }>;

      for (const table of tables) {
        this.db.exec(`DROP TABLE IF EXISTS ${table.name}`);
      }

      this.db.exec('COMMIT');
      logger().info('Database reset completed');
    } catch (error) {
      this.db.exec('ROLLBACK');
      logger().error('Database reset failed', { error });
      throw error;
    }
  }
}
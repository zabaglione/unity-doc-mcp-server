import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseConnection, getDb, initializeDb, closeDb } from '../src/database/connection.js';
import { Migration } from '../src/database/migration.js';
import { TABLES, DocumentRow } from '../src/database/schema.js';
import { ConfigManager } from '../src/config/index.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

describe('Database', () => {
  let testDbPath: string;

  beforeEach(async () => {
    // Clear singleton instances
    vi.clearAllMocks();
    // @ts-expect-error - accessing private static property for testing
    DatabaseConnection.instance = undefined;
    // @ts-expect-error - accessing private static property for testing
    ConfigManager.instance = undefined;

    // Create unique test database path
    const tempDir = await fs.mkdtemp(join(tmpdir(), 'db-test-'));
    testDbPath = join(tempDir, 'test.db');

    // Set test database path
    process.env.PORT = '3000'; // Set required config
    const configManager = ConfigManager.getInstance();
    configManager.updateConfig({
      database: {
        path: testDbPath,
        options: {
          verbose: undefined,
          readonly: false,
          fileMustExist: false,
        },
      },
    });
  });

  afterEach(async () => {
    // Close database connection
    try {
      closeDb();
    } catch {
      // Ignore if not initialized
    }

    // Clean up test database
    try {
      await fs.unlink(testDbPath);
      await fs.rmdir(dirname(testDbPath));
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('DatabaseConnection', () => {
    it('should be a singleton', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize database', async () => {
      await initializeDb();
      const conn = DatabaseConnection.getInstance();
      expect(conn.isInitialized()).toBe(true);
    });

    it('should throw error when accessing database before initialization', () => {
      const conn = DatabaseConnection.getInstance();
      expect(() => conn.getDatabase()).toThrow('Database not initialized');
    });

    it('should create database file', async () => {
      await initializeDb();
      
      const stats = await fs.stat(testDbPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should close database connection', async () => {
      await initializeDb();
      const conn = DatabaseConnection.getInstance();
      
      expect(conn.isInitialized()).toBe(true);
      closeDb();
      expect(conn.isInitialized()).toBe(false);
    });

    it('should execute transactions', async () => {
      await initializeDb();
      const conn = DatabaseConnection.getInstance();
      
      const result = conn.transaction((db) => {
        db.exec(`INSERT INTO ${TABLES.documents} 
          (id, unity_version, type, title, file_path, content, html) 
          VALUES ('test-1', '6000.0', 'manual', 'Test', '/test.html', 'content', '<html>')`);
        
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${TABLES.documents}`).get() as { count: number };
        return count.count;
      });
      
      expect(result).toBe(1);
    });

    it('should rollback transaction on error', async () => {
      await initializeDb();
      const conn = DatabaseConnection.getInstance();
      
      expect(() => {
        conn.transaction((db) => {
          db.exec(`INSERT INTO ${TABLES.documents} 
            (id, unity_version, type, title, file_path, content, html) 
            VALUES ('test-1', '6000.0', 'manual', 'Test', '/test.html', 'content', '<html>')`);
          
          // This should fail due to duplicate ID
          db.exec(`INSERT INTO ${TABLES.documents} 
            (id, unity_version, type, title, file_path, content, html) 
            VALUES ('test-1', '6000.0', 'manual', 'Test2', '/test2.html', 'content2', '<html2>')`);
        });
      }).toThrow();
      
      // Check that no documents were inserted
      const count = conn.prepare(`SELECT COUNT(*) as count FROM ${TABLES.documents}`).get() as { count: number };
      expect(count.count).toBe(0);
    });

    it('should get database statistics', async () => {
      await initializeDb();
      const conn = DatabaseConnection.getInstance();
      
      const stats = conn.getStats();
      expect(stats.documentCount).toBe(0);
      expect(stats.databaseSize).toBeGreaterThan(0);
      expect(stats.walSize).toBeGreaterThanOrEqual(0);
    });

    it('should backup database', async () => {
      await initializeDb();
      const conn = DatabaseConnection.getInstance();
      
      // Insert test data
      conn.exec(`INSERT INTO ${TABLES.documents} 
        (id, unity_version, type, title, file_path, content, html) 
        VALUES ('test-1', '6000.0', 'manual', 'Test', '/test.html', 'content', '<html>')`);
      
      const backupPath = join(dirname(testDbPath), 'backup.db');
      await conn.backup(backupPath);
      
      // Check backup file exists
      const stats = await fs.stat(backupPath);
      expect(stats.isFile()).toBe(true);
      
      // Clean up backup
      await fs.unlink(backupPath);
    });
  });

  describe('Migration', () => {
    it('should create initial schema', async () => {
      await initializeDb();
      const db = getDb();
      
      // Check tables exist
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      ).all() as Array<{ name: string }>;
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain(TABLES.documents);
      expect(tableNames).toContain(TABLES.schema_version);
    });

    it('should create FTS table', async () => {
      await initializeDb();
      const db = getDb();
      
      // Check FTS table exists
      const ftsTable = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(TABLES.documents_fts);
      
      expect(ftsTable).toBeTruthy();
    });

    it('should track schema version', async () => {
      await initializeDb();
      const db = getDb();
      
      const version = db.prepare(
        `SELECT version FROM ${TABLES.schema_version} ORDER BY version DESC LIMIT 1`
      ).get() as { version: number };
      
      expect(version.version).toBe(1);
    });

    it('should detect if migration is needed', async () => {
      const conn = DatabaseConnection.getInstance();
      await conn.initialize();
      const db = conn.getDatabase();
      
      const migration = new Migration(db);
      expect(migration.needsMigration()).toBe(false);
    });

    it('should keep FTS in sync with main table', async () => {
      await initializeDb();
      const db = getDb();
      
      // Insert document
      db.exec(`INSERT INTO ${TABLES.documents} 
        (id, unity_version, type, title, file_path, content, html) 
        VALUES ('test-1', '6000.0', 'manual', 'Test Title', '/test.html', 'Test content', '<html>')`);
      
      // Check FTS table
      const ftsResult = db.prepare(
        `SELECT title, content FROM ${TABLES.documents_fts} WHERE title MATCH 'Test'`
      ).all() as Array<{ title: string; content: string }>;
      
      expect(ftsResult).toHaveLength(1);
      expect(ftsResult[0].title).toBe('Test Title');
      expect(ftsResult[0].content).toBe('Test content');
      
      // Update document
      db.exec(`UPDATE ${TABLES.documents} SET title = 'Updated Title' WHERE id = 'test-1'`);
      
      // Check FTS updated
      const ftsUpdated = db.prepare(
        `SELECT title FROM ${TABLES.documents_fts} WHERE title MATCH 'Updated'`
      ).all() as Array<{ title: string }>;
      
      expect(ftsUpdated).toHaveLength(1);
      expect(ftsUpdated[0].title).toBe('Updated Title');
      
      // Delete document
      db.exec(`DELETE FROM ${TABLES.documents} WHERE id = 'test-1'`);
      
      // Check FTS deleted
      const ftsDeleted = db.prepare(
        `SELECT COUNT(*) as count FROM ${TABLES.documents_fts}`
      ).get() as { count: number };
      
      expect(ftsDeleted.count).toBe(0);
    });

    it('should reset database', async () => {
      await initializeDb();
      const db = getDb();
      
      // Insert test data
      db.exec(`INSERT INTO ${TABLES.documents} 
        (id, unity_version, type, title, file_path, content, html) 
        VALUES ('test-1', '6000.0', 'manual', 'Test', '/test.html', 'content', '<html>')`);
      
      // Reset database
      const migration = new Migration(db);
      await migration.reset();
      
      // Check all tables are gone
      const tables = db.prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      ).get() as { count: number };
      
      expect(tables.count).toBe(0);
    });
  });

  describe('Document operations', () => {
    it('should enforce type constraints', async () => {
      await initializeDb();
      const db = getDb();
      
      // Should fail with invalid type
      expect(() => {
        db.exec(`INSERT INTO ${TABLES.documents} 
          (id, unity_version, type, title, file_path, content, html) 
          VALUES ('test-1', '6000.0', 'invalid', 'Test', '/test.html', 'content', '<html>')`);
      }).toThrow();
    });

    it('should update timestamp on update', async () => {
      await initializeDb();
      const db = getDb();
      
      // Insert document with specific timestamp
      db.exec(`INSERT INTO ${TABLES.documents} 
        (id, unity_version, type, title, file_path, content, html, created_at, updated_at) 
        VALUES ('test-1', '6000.0', 'manual', 'Test', '/test.html', 'content', '<html>', 
                '2023-01-01 00:00:00', '2023-01-01 00:00:00')`);
      
      const original = db.prepare(
        `SELECT created_at, updated_at FROM ${TABLES.documents} WHERE id = ?`
      ).get('test-1') as { created_at: string; updated_at: string };
      
      // Update document - trigger should update the timestamp
      db.exec(`UPDATE ${TABLES.documents} SET title = 'Updated' WHERE id = 'test-1'`);
      
      const updated = db.prepare(
        `SELECT created_at, updated_at FROM ${TABLES.documents} WHERE id = ?`
      ).get('test-1') as { created_at: string; updated_at: string };
      
      expect(updated.created_at).toBe(original.created_at);
      expect(updated.updated_at).not.toBe(original.updated_at);
    });
  });
});
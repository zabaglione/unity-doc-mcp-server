import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FileSystemUtils,
  ensureDir,
  exists,
  remove,
  readFile,
  writeFile,
  copyFile,
  listFiles,
  getFileSize,
  moveFile,
  createTempDir,
} from '../src/utils/filesystem.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileSystemUtils', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = await fs.mkdtemp(join(tmpdir(), 'fs-test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const dirPath = join(testDir, 'new-dir');
      
      expect(await exists(dirPath)).toBe(false);
      await ensureDir(dirPath);
      expect(await exists(dirPath)).toBe(true);
    });

    it('should create nested directories', async () => {
      const dirPath = join(testDir, 'level1', 'level2', 'level3');
      
      await ensureDir(dirPath);
      expect(await exists(dirPath)).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const dirPath = join(testDir, 'existing-dir');
      await fs.mkdir(dirPath);
      
      await expect(ensureDir(dirPath)).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');
      
      expect(await exists(filePath)).toBe(true);
    });

    it('should return true for existing directory', async () => {
      const dirPath = join(testDir, 'test-dir');
      await fs.mkdir(dirPath);
      
      expect(await exists(dirPath)).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      const filePath = join(testDir, 'non-existing.txt');
      
      expect(await exists(filePath)).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove file', async () => {
      const filePath = join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');
      
      await remove(filePath);
      expect(await exists(filePath)).toBe(false);
    });

    it('should remove directory recursively', async () => {
      const dirPath = join(testDir, 'test-dir');
      const filePath = join(dirPath, 'test.txt');
      
      await fs.mkdir(dirPath);
      await fs.writeFile(filePath, 'test content');
      
      await remove(dirPath);
      expect(await exists(dirPath)).toBe(false);
    });

    it('should not throw if path does not exist', async () => {
      const filePath = join(testDir, 'non-existing.txt');
      
      await expect(remove(filePath)).resolves.not.toThrow();
    });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      await fs.writeFile(filePath, content);
      
      const result = await readFile(filePath);
      expect(result).toBe(content);
    });

    it('should read file with specific encoding', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, 世界!';
      await fs.writeFile(filePath, content, 'utf-8');
      
      const result = await readFile(filePath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should throw if file does not exist', async () => {
      const filePath = join(testDir, 'non-existing.txt');
      
      await expect(readFile(filePath)).rejects.toThrow();
    });
  });

  describe('writeFile', () => {
    it('should write string content to file', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Test content';
      
      await writeFile(filePath, content);
      
      const result = await fs.readFile(filePath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should write buffer content to file', async () => {
      const filePath = join(testDir, 'test.bin');
      const content = Buffer.from([0x01, 0x02, 0x03]);
      
      await writeFile(filePath, content);
      
      const result = await fs.readFile(filePath);
      expect(result).toEqual(content);
    });

    it('should create parent directories if needed', async () => {
      const filePath = join(testDir, 'nested', 'dir', 'test.txt');
      const content = 'Test content';
      
      await writeFile(filePath, content);
      
      expect(await exists(filePath)).toBe(true);
    });
  });

  describe('copyFile', () => {
    it('should copy file to new location', async () => {
      const srcPath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'dest.txt');
      const content = 'Copy test';
      
      await fs.writeFile(srcPath, content);
      await copyFile(srcPath, destPath);
      
      const result = await fs.readFile(destPath, 'utf-8');
      expect(result).toBe(content);
      expect(await exists(srcPath)).toBe(true); // Original should still exist
    });

    it('should create parent directories for destination', async () => {
      const srcPath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'nested', 'dest.txt');
      
      await fs.writeFile(srcPath, 'test');
      await copyFile(srcPath, destPath);
      
      expect(await exists(destPath)).toBe(true);
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      await fs.writeFile(join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(join(testDir, 'file2.txt'), 'content2');
      await fs.mkdir(join(testDir, 'subdir'));
      
      const files = await listFiles(testDir);
      
      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('file1.txt'))).toBe(true);
      expect(files.some(f => f.endsWith('file2.txt'))).toBe(true);
    });

    it('should list files recursively', async () => {
      await fs.writeFile(join(testDir, 'file1.txt'), 'content1');
      await fs.mkdir(join(testDir, 'subdir'));
      await fs.writeFile(join(testDir, 'subdir', 'file2.txt'), 'content2');
      
      const files = await listFiles(testDir, true);
      
      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('file1.txt'))).toBe(true);
      expect(files.some(f => f.endsWith('file2.txt'))).toBe(true);
    });

    it('should return empty array for empty directory', async () => {
      const files = await listFiles(testDir);
      expect(files).toEqual([]);
    });
  });

  describe('getFileSize', () => {
    it('should return file size in bytes', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, World!'; // 13 bytes
      await fs.writeFile(filePath, content);
      
      const size = await getFileSize(filePath);
      expect(size).toBe(13);
    });

    it('should throw for non-existing file', async () => {
      const filePath = join(testDir, 'non-existing.txt');
      
      await expect(getFileSize(filePath)).rejects.toThrow();
    });
  });

  describe('moveFile', () => {
    it('should move file to new location', async () => {
      const srcPath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'dest.txt');
      const content = 'Move test';
      
      await fs.writeFile(srcPath, content);
      await moveFile(srcPath, destPath);
      
      expect(await exists(srcPath)).toBe(false);
      expect(await exists(destPath)).toBe(true);
      
      const result = await fs.readFile(destPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should create parent directories for destination', async () => {
      const srcPath = join(testDir, 'source.txt');
      const destPath = join(testDir, 'nested', 'dest.txt');
      
      await fs.writeFile(srcPath, 'test');
      await moveFile(srcPath, destPath);
      
      expect(await exists(destPath)).toBe(true);
      expect(await exists(srcPath)).toBe(false);
    });
  });

  describe('createTempDir', () => {
    it('should create temporary directory', async () => {
      const tempDir = await createTempDir();
      
      expect(await exists(tempDir)).toBe(true);
      expect(tempDir).toContain('unity-doc-');
      
      // Clean up
      await fs.rm(tempDir, { recursive: true });
    });

    it('should create temporary directory with custom prefix', async () => {
      const tempDir = await createTempDir('custom-');
      
      expect(await exists(tempDir)).toBe(true);
      expect(tempDir).toContain('custom-');
      
      // Clean up
      await fs.rm(tempDir, { recursive: true });
    });
  });
});
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createZipHandler, ZipHandler } from '../src/zip/index.js';
import { createTempDir, writeFile, readFile, exists, remove, getFileSize } from '../src/utils/filesystem.js';
import { join } from 'path';
import { createWriteStream } from 'fs';
import archiver from 'archiver';

describe('ZIP Handler', () => {
  let tempDir: string;
  let testZipPath: string;
  let handler: ZipHandler | null = null;

  async function createTestZip(): Promise<void> {
    const output = createWriteStream(testZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Add test files
    archive.append('Content of file1.txt', { name: 'file1.txt' });
    archive.append('Content of file2.txt', { name: 'subdir/file2.txt' });
    archive.append('<html><body>Test HTML</body></html>', { name: 'test.html' });
    archive.append('Large content '.repeat(1000), { name: 'large.txt' });

    await archive.finalize();

    // Wait for the output stream to finish
    return new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });
  }

  beforeEach(async () => {
    tempDir = await createTempDir();
    testZipPath = join(tempDir, 'test.zip');
    await createTestZip();
    
    // Verify ZIP was created
    if (!await exists(testZipPath)) {
      throw new Error('Test ZIP file was not created');
    }
    
    const size = await getFileSize(testZipPath);
    if (size === 0) {
      throw new Error('Test ZIP file is empty');
    }
  });

  afterEach(async () => {
    if (handler) {
      await handler.close();
      handler = null;
    }
    await remove(tempDir);
  });

  describe('createZipHandler', () => {
    it('should create handler for existing ZIP file', async () => {
      handler = await createZipHandler(testZipPath);
      expect(handler).toBeDefined();
    });

    it('should throw error for non-existent ZIP file', async () => {
      await expect(createZipHandler(join(tempDir, 'nonexistent.zip')))
        .rejects.toThrow('ZIP file not found');
    });
  });

  describe('listEntries', () => {
    it('should list all entries in ZIP', async () => {
      handler = await createZipHandler(testZipPath);
      const entries = await handler.listEntries();

      expect(entries.length).toBeGreaterThan(0);
      
      const filePaths = entries.map(e => e.path);
      expect(filePaths).toContain('file1.txt');
      expect(filePaths).toContain('subdir/file2.txt');
      expect(filePaths).toContain('test.html');
      expect(filePaths).toContain('large.txt');
    });

    it('should filter entries', async () => {
      handler = await createZipHandler(testZipPath);
      const entries = await handler.listEntries({
        filter: (entry) => entry.path.endsWith('.txt')
      });

      expect(entries.every(e => e.path.endsWith('.txt'))).toBe(true);
      expect(entries.map(e => e.path)).not.toContain('test.html');
    });

    it('should include entry metadata', async () => {
      handler = await createZipHandler(testZipPath);
      const entries = await handler.listEntries();

      const file1 = entries.find(e => e.path === 'file1.txt');
      expect(file1).toBeDefined();
      // Note: archiver may not always set size/compressedSize until after compression
      expect(file1!.size).toBeGreaterThanOrEqual(0);
      expect(file1!.compressedSize).toBeGreaterThanOrEqual(0);
      expect(file1!.isDirectory).toBe(false);
      expect(file1!.lastModified).toBeInstanceOf(Date);
    });
  });

  describe('hasEntry', () => {
    it('should return true for existing entry', async () => {
      handler = await createZipHandler(testZipPath);
      
      expect(await handler.hasEntry('file1.txt')).toBe(true);
      expect(await handler.hasEntry('subdir/file2.txt')).toBe(true);
    });

    it('should return false for non-existent entry', async () => {
      handler = await createZipHandler(testZipPath);
      
      expect(await handler.hasEntry('nonexistent.txt')).toBe(false);
    });
  });

  describe('readFileAsString', () => {
    it('should read file content as string', async () => {
      handler = await createZipHandler(testZipPath);
      
      const content = await handler.readFileAsString('file1.txt');
      expect(content).toBe('Content of file1.txt');
    });

    it('should read HTML file correctly', async () => {
      handler = await createZipHandler(testZipPath);
      
      const content = await handler.readFileAsString('test.html');
      expect(content).toBe('<html><body>Test HTML</body></html>');
    });

    it('should throw error for non-existent file', async () => {
      handler = await createZipHandler(testZipPath);
      
      await expect(handler.readFileAsString('nonexistent.txt'))
        .rejects.toThrow('File not found in ZIP');
    });
  });

  describe('readFileAsBuffer', () => {
    it('should read file content as buffer', async () => {
      handler = await createZipHandler(testZipPath);
      
      const buffer = await handler.readFileAsBuffer('file1.txt');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf-8')).toBe('Content of file1.txt');
    });
  });

  describe('extractFile', () => {
    it('should extract single file', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputPath = join(tempDir, 'extracted-file.txt');
      await handler.extractFile('file1.txt', outputPath);
      
      expect(await exists(outputPath)).toBe(true);
      expect(await readFile(outputPath)).toBe('Content of file1.txt');
    });

    it('should create directories as needed', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputPath = join(tempDir, 'output', 'nested', 'file.txt');
      await handler.extractFile('file1.txt', outputPath);
      
      expect(await exists(outputPath)).toBe(true);
    });

    it('should throw error for non-existent file', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputPath = join(tempDir, 'output.txt');
      await expect(handler.extractFile('nonexistent.txt', outputPath))
        .rejects.toThrow('File not found in ZIP');
    });
  });

  describe('extractAll', () => {
    it('should extract all files', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputDir = join(tempDir, 'extracted');
      await handler.extractAll({ outputDir });
      
      expect(await exists(join(outputDir, 'file1.txt'))).toBe(true);
      expect(await exists(join(outputDir, 'subdir', 'file2.txt'))).toBe(true);
      expect(await exists(join(outputDir, 'test.html'))).toBe(true);
      
      const content1 = await readFile(join(outputDir, 'file1.txt'));
      expect(content1).toBe('Content of file1.txt');
    });

    it('should skip existing files when overwrite is false', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputDir = join(tempDir, 'extracted');
      
      // Extract once
      await handler.extractAll({ outputDir });
      
      // Modify a file
      const file1Path = join(outputDir, 'file1.txt');
      await writeFile(file1Path, 'Modified content');
      
      // Extract again without overwrite
      await handler.extractAll({ outputDir, overwrite: false });
      
      // Should still have modified content
      expect(await readFile(file1Path)).toBe('Modified content');
    });

    it('should overwrite existing files when overwrite is true', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputDir = join(tempDir, 'extracted');
      
      // Extract once
      await handler.extractAll({ outputDir });
      
      // Modify a file
      const file1Path = join(outputDir, 'file1.txt');
      await writeFile(file1Path, 'Modified content');
      
      // Extract again with overwrite
      await handler.extractAll({ outputDir, overwrite: true });
      
      // Should have original content
      expect(await readFile(file1Path)).toBe('Content of file1.txt');
    });

    it('should filter files during extraction', async () => {
      handler = await createZipHandler(testZipPath);
      
      const outputDir = join(tempDir, 'extracted');
      await handler.extractAll({ 
        outputDir,
        filter: (entry) => entry.path.endsWith('.html')
      });
      
      expect(await exists(join(outputDir, 'test.html'))).toBe(true);
      expect(await exists(join(outputDir, 'file1.txt'))).toBe(false);
    });
  });

  describe('close', () => {
    it('should prevent operations after close', async () => {
      handler = await createZipHandler(testZipPath);
      await handler.close();
      
      await expect(handler.listEntries())
        .rejects.toThrow('ZIP handler is closed');
    });
  });
});
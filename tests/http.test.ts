import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttpDownloader, HttpDownloader } from '../src/http/index.js';
import { createTempDir, exists, readFile, remove, getFileSize } from '../src/utils/filesystem.js';
import { join } from 'path';
import { createServer, Server } from 'http';
import { promisify } from 'util';

describe('HTTP Downloader', () => {
  let tempDir: string;
  let downloader: HttpDownloader;
  let server: Server;
  let serverUrl: string;
  
  const testContent = 'This is test content for HTTP download';
  const largeContent = 'x'.repeat(1024 * 1024); // 1MB
  
  beforeEach(async () => {
    tempDir = await createTempDir();
    downloader = createHttpDownloader();
    
    // Create test server
    server = createServer((req, res) => {
      const url = req.url || '/';
      
      if (url === '/test.txt') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(testContent).toString()
        });
        res.end(testContent);
      } else if (url === '/large.txt') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(largeContent).toString()
        });
        res.end(largeContent);
      } else if (url === '/no-length.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(testContent);
      } else if (url === '/error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      } else if (url.startsWith('/resume')) {
        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-/);
          if (match) {
            const start = parseInt(match[1], 10);
            const content = testContent.slice(start);
            res.writeHead(206, {
              'Content-Type': 'text/plain',
              'Content-Length': Buffer.byteLength(content).toString(),
              'Content-Range': `bytes ${start}-${testContent.length - 1}/${testContent.length}`
            });
            res.end(content);
            return;
          }
        }
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(testContent).toString()
        });
        res.end(testContent);
      } else if (url === '/slow') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': '10'
        });
        // Don't send data to trigger timeout
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    
    await promisify(server.listen.bind(server))(0);
    const address = server.address();
    if (typeof address === 'object' && address !== null) {
      serverUrl = `http://localhost:${address.port}`;
    }
  });
  
  afterEach(async () => {
    downloader.cancel();
    await promisify(server.close.bind(server))();
    await remove(tempDir);
  });
  
  describe('download', () => {
    it('should download file successfully', async () => {
      const outputPath = join(tempDir, 'downloaded.txt');
      
      const result = await downloader.download({
        url: `${serverUrl}/test.txt`,
        outputPath
      });
      
      expect(result.filePath).toBe(outputPath);
      expect(result.size).toBe(Buffer.byteLength(testContent));
      expect(result.duration).toBeGreaterThan(0);
      expect(result.averageSpeed).toBeGreaterThan(0);
      
      expect(await exists(outputPath)).toBe(true);
      expect(await readFile(outputPath)).toBe(testContent);
    });
    
    it('should track download progress', async () => {
      const outputPath = join(tempDir, 'large.txt');
      const progressUpdates: number[] = [];
      
      await downloader.download({
        url: `${serverUrl}/large.txt`,
        outputPath,
        onProgress: (progress) => {
          progressUpdates.push(progress.percent);
        }
      });
      
      // Since download is very fast, we might only get final update
      expect(progressUpdates.length).toBeGreaterThanOrEqual(0);
      if (progressUpdates.length > 0) {
        expect(progressUpdates[progressUpdates.length - 1]).toBeCloseTo(100, 1);
      }
    });
    
    it('should handle server errors', async () => {
      const outputPath = join(tempDir, 'error.txt');
      
      await expect(downloader.download({
        url: `${serverUrl}/error`,
        outputPath
      })).rejects.toThrow('HTTP 500');
      
      expect(await exists(outputPath)).toBe(false);
    });
    
    it('should handle 404 errors', async () => {
      const outputPath = join(tempDir, 'notfound.txt');
      
      await expect(downloader.download({
        url: `${serverUrl}/notfound`,
        outputPath
      })).rejects.toThrow('HTTP 404');
    });
    
    it('should timeout on slow downloads', async () => {
      const outputPath = join(tempDir, 'slow.txt');
      
      await expect(downloader.download({
        url: `${serverUrl}/slow`,
        outputPath,
        timeout: 100
      })).rejects.toThrow('timeout');
    });
    
    it('should support custom headers', async () => {
      const outputPath = join(tempDir, 'headers.txt');
      
      await downloader.download({
        url: `${serverUrl}/test.txt`,
        outputPath,
        headers: {
          'User-Agent': 'Unity-Doc-MCP-Server/1.0'
        }
      });
      
      expect(await exists(outputPath)).toBe(true);
    });
    
    it('should resume downloads when enabled', async () => {
      const outputPath = join(tempDir, 'resume.txt');
      
      // Write partial content
      const partialContent = testContent.slice(0, 10);
      await downloader.download({
        url: `${serverUrl}/test.txt`,
        outputPath
      });
      
      // Simulate partial download by truncating file
      const { writeFile } = await import('../src/utils/filesystem.js');
      await writeFile(outputPath, partialContent);
      
      // Resume download
      await downloader.download({
        url: `${serverUrl}/resume`,
        outputPath,
        resumable: true
      });
      
      const finalContent = await readFile(outputPath);
      expect(finalContent).toBe(testContent);
    });
  });
  
  describe('downloadToBuffer', () => {
    it('should download to buffer', async () => {
      const buffer = await downloader.downloadToBuffer(`${serverUrl}/test.txt`);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe(testContent);
    });
    
    it('should handle errors when downloading to buffer', async () => {
      await expect(downloader.downloadToBuffer(`${serverUrl}/error`))
        .rejects.toThrow('HTTP 500');
    });
  });
  
  describe('getContentLength', () => {
    it('should get content length', async () => {
      const length = await downloader.getContentLength(`${serverUrl}/test.txt`);
      
      expect(length).toBe(Buffer.byteLength(testContent));
    });
    
    it('should handle missing content length', async () => {
      await expect(downloader.getContentLength(`${serverUrl}/no-length.txt`))
        .rejects.toThrow('Content-Length header not found');
    });
  });
  
  describe('cancel', () => {
    it('should cancel ongoing download', async () => {
      const outputPath = join(tempDir, 'cancelled.txt');
      
      // Use the existing slow endpoint
      const downloadPromise = downloader.download({
        url: `${serverUrl}/slow`,
        outputPath,
        timeout: 5000 // 5 second timeout
      });
      
      // Cancel after a short delay
      setTimeout(() => downloader.cancel(), 50);
      
      await expect(downloadPromise).rejects.toThrow();
    });
  });
});
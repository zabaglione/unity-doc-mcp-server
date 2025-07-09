import fetch, { Response } from 'node-fetch';
import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import { dirname } from 'path';
import { HttpDownloader, DownloadOptions, DownloadResult, DownloadProgress } from './types.js';
import { logger } from '../utils/logger.js';
import { ensureDir, exists, getFileSize } from '../utils/filesystem.js';

export class NodeFetchDownloader implements HttpDownloader {
  private abortController: AbortController | null = null;

  async download(options: DownloadOptions): Promise<DownloadResult> {
    const { url, outputPath, headers = {}, timeout = 30000, onProgress, resumable = false } = options;
    
    logger().info('Starting download', { url, outputPath });
    
    const startTime = Date.now();
    let bytesDownloaded = 0;
    let totalBytes = 0;
    
    try {
      // Ensure output directory exists
      await ensureDir(dirname(outputPath));
      
      // Check if we can resume
      let resumeFrom = 0;
      if (resumable && await exists(outputPath)) {
        resumeFrom = await getFileSize(outputPath);
        if (resumeFrom > 0) {
          headers['Range'] = `bytes=${resumeFrom}-`;
          bytesDownloaded = resumeFrom;
          logger().info('Resuming download', { from: resumeFrom });
        }
      }
      
      // Create abort controller for cancellation
      this.abortController = new AbortController();
      
      // Fetch with timeout
      const response = await this.fetchWithTimeout(url, {
        headers,
        signal: this.abortController.signal,
        timeout
      });
      
      if (!response.ok && response.status !== 206) { // 206 is partial content
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Get total size
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        totalBytes = parseInt(contentLength, 10) + resumeFrom;
      }
      
      // Setup progress tracking
      let lastProgressTime = Date.now();
      let lastBytesDownloaded = bytesDownloaded;
      
      // Create write stream
      const writeStream = createWriteStream(outputPath, { 
        flags: resumable ? 'a' : 'w' 
      });
      
      if (onProgress && response.body) {
        // Track progress manually
        response.body.on('data', (chunk: Buffer) => {
          bytesDownloaded += chunk.length;
          
          const now = Date.now();
          const timeDiff = (now - lastProgressTime) / 1000;
          
          if (timeDiff >= 0.1) { // Update every 100ms
            const bytesDiff = bytesDownloaded - lastBytesDownloaded;
            const bytesPerSecond = bytesDiff / timeDiff;
            const estimatedTimeRemaining = totalBytes > 0 
              ? (totalBytes - bytesDownloaded) / bytesPerSecond 
              : 0;
            
            const progress: DownloadProgress = {
              bytesDownloaded,
              totalBytes,
              percent: totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0,
              bytesPerSecond,
              estimatedTimeRemaining
            };
            
            onProgress(progress);
            
            lastProgressTime = now;
            lastBytesDownloaded = bytesDownloaded;
          }
        });
      }
      
      await pipeline(response.body!, writeStream);
      
      const duration = Date.now() - startTime;
      const finalSize = await getFileSize(outputPath);
      
      const result: DownloadResult = {
        filePath: outputPath,
        size: finalSize,
        duration,
        averageSpeed: finalSize / (duration / 1000)
      };
      
      logger().info('Download completed', { ...result });
      
      return result;
      
    } catch (error) {
      logger().error('Download failed', { url, error });
      
      // Clean up partial file if not resumable
      if (!resumable && await exists(outputPath)) {
        await fs.unlink(outputPath);
      }
      
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  async downloadToBuffer(url: string, options: Partial<DownloadOptions> = {}): Promise<Buffer> {
    const { headers = {}, timeout = 30000 } = options;
    
    logger().debug('Downloading to buffer', { url });
    
    try {
      this.abortController = new AbortController();
      
      const response = await this.fetchWithTimeout(url, {
        headers,
        signal: this.abortController.signal,
        timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      logger().debug('Downloaded to buffer', { url, size: buffer.length });
      
      return buffer;
      
    } catch (error) {
      logger().error('Buffer download failed', { url, error });
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  async getContentLength(url: string): Promise<number> {
    logger().debug('Getting content length', { url });
    
    try {
      const response = await fetch(url, { method: 'HEAD' });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentLength = response.headers.get('content-length');
      if (!contentLength) {
        throw new Error('Content-Length header not found');
      }
      
      return parseInt(contentLength, 10);
      
    } catch (error) {
      logger().error('Failed to get content length', { url, error });
      throw error;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      logger().info('Download cancelled');
    }
  }

  private async fetchWithTimeout(
    url: string, 
    options: { headers: Record<string, string>; signal: AbortSignal; timeout: number }
  ): Promise<Response> {
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        this.abortController.abort();
      }
    }, options.timeout);
    
    try {
      const response = await fetch(url, {
        headers: options.headers,
        signal: options.signal
      });
      
      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Download timeout after ${options.timeout}ms`);
      }
      
      throw error;
    }
  }
}

export function createHttpDownloader(): HttpDownloader {
  return new NodeFetchDownloader();
}
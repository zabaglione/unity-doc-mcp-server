import * as path from 'path';
import unzipper from 'unzipper';
import { createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';
import { ZipHandler, ZipEntry, ZipExtractOptions, ZipListOptions } from './types.js';
import { logger } from '../utils/logger.js';
import { ensureDir, exists } from '../utils/filesystem.js';

interface UnzipperEntry extends Readable {
  path: string;
  type: 'Directory' | 'File';
  vars?: {
    uncompressedSize?: number;
    compressedSize?: number;
    lastModifiedDate?: Date | number;
  };
  uncompressedSize?: number;
  compressedSize?: number;
  lastModified?: Date | number;
  autodrain(): void;
}

export class UnzipperHandler implements ZipHandler {
  private zipPath: string;
  private isClosed = false;

  constructor(zipPath: string) {
    this.zipPath = zipPath;
  }

  async extractAll(options: ZipExtractOptions): Promise<void> {
    this.ensureNotClosed();
    
    const { outputDir, overwrite = false, filter } = options;
    
    logger().info('Starting ZIP extraction', { 
      zipPath: this.zipPath, 
      outputDir,
      overwrite 
    });

    await ensureDir(outputDir);

    let extractedCount = 0;
    let skippedCount = 0;
    let pendingWrites = 0;
    let parsingComplete = false;

    return new Promise((resolve, reject) => {
      const checkComplete = () => {
        if (parsingComplete && pendingWrites === 0) {
          logger().info('ZIP extraction completed', { 
            extractedCount,
            skippedCount 
          });
          resolve();
        }
      };
      createReadStream(this.zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: UnzipperEntry) => {
          const entryPath = entry.path;
          const outputPath = path.join(outputDir, entryPath);
          
          const lastMod = entry.vars?.lastModifiedDate ?? entry.lastModified;
          const zipEntry: ZipEntry = {
            path: entryPath,
            size: entry.vars?.uncompressedSize ?? entry.uncompressedSize ?? 0,
            compressedSize: entry.vars?.compressedSize ?? entry.compressedSize ?? 0,
            isDirectory: entry.type === 'Directory',
            lastModified: lastMod instanceof Date ? lastMod : new Date(lastMod ?? Date.now()),
          };

          if (filter && !filter(zipEntry)) {
            entry.autodrain();
            skippedCount++;
            return;
          }

          if (zipEntry.isDirectory) {
            ensureDir(outputPath)
              .then(() => entry.autodrain())
              .catch(reject);
          } else {
            ensureDir(path.dirname(outputPath))
              .then(async () => {
                if (!overwrite && await exists(outputPath)) {
                  logger().debug('Skipping existing file', { path: entryPath });
                  entry.autodrain();
                  skippedCount++;
                  return;
                }

                pendingWrites++;
                const writeStream = createWriteStream(outputPath);
                entry.pipe(writeStream)
                  .on('finish', () => {
                    extractedCount++;
                    pendingWrites--;
                    checkComplete();
                  })
                  .on('error', (err) => {
                    pendingWrites--;
                    reject(err);
                  });
              })
              .catch(reject);
          }
        })
        .on('error', reject)
        .on('close', () => {
          parsingComplete = true;
          checkComplete();
        });
    });
  }

  async extractFile(filePath: string, outputPath: string): Promise<void> {
    this.ensureNotClosed();
    
    logger().debug('Extracting single file', { filePath, outputPath });

    await ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      let found = false;

      createReadStream(this.zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: UnzipperEntry) => {
          if (entry.path === filePath) {
            found = true;
            const writeStream = createWriteStream(outputPath);
            entry.pipe(writeStream)
              .on('finish', resolve)
              .on('error', reject);
          } else {
            entry.autodrain();
          }
        })
        .on('error', reject)
        .on('close', () => {
          if (!found) {
            reject(new Error(`File not found in ZIP: ${filePath}`));
          }
        });
    });
  }

  async listEntries(options: ZipListOptions = {}): Promise<ZipEntry[]> {
    this.ensureNotClosed();
    
    const { filter } = options;
    const entries: ZipEntry[] = [];

    return new Promise((resolve, reject) => {
      createReadStream(this.zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: UnzipperEntry) => {
          const lastMod = entry.vars?.lastModifiedDate ?? entry.lastModified;
          const zipEntry: ZipEntry = {
            path: entry.path,
            size: entry.vars?.uncompressedSize ?? entry.uncompressedSize ?? 0,
            compressedSize: entry.vars?.compressedSize ?? entry.compressedSize ?? 0,
            isDirectory: entry.type === 'Directory',
            lastModified: lastMod instanceof Date ? lastMod : new Date(lastMod ?? Date.now()),
          };

          if (!filter || filter(zipEntry)) {
            entries.push(zipEntry);
          }

          entry.autodrain();
        })
        .on('error', reject)
        .on('close', () => resolve(entries));
    });
  }

  async hasEntry(filePath: string): Promise<boolean> {
    this.ensureNotClosed();
    
    const entries = await this.listEntries({
      filter: (entry) => entry.path === filePath
    });

    return entries.length > 0;
  }

  async readFileAsString(filePath: string): Promise<string> {
    const buffer = await this.readFileAsBuffer(filePath);
    return buffer.toString('utf-8');
  }

  async readFileAsBuffer(filePath: string): Promise<Buffer> {
    this.ensureNotClosed();
    
    return new Promise((resolve, reject) => {
      let found = false;

      createReadStream(this.zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: UnzipperEntry) => {
          if (entry.path === filePath) {
            found = true;
            const chunks: Buffer[] = [];
            
            entry.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
            });
            
            entry.on('end', () => {
              resolve(Buffer.concat(chunks));
            });
            
            entry.on('error', reject);
          } else {
            entry.autodrain();
          }
        })
        .on('error', reject)
        .on('close', () => {
          if (!found) {
            reject(new Error(`File not found in ZIP: ${filePath}`));
          }
        });
    });
  }

  async close(): Promise<void> {
    this.isClosed = true;
    logger().debug('ZIP handler closed', { zipPath: this.zipPath });
  }

  private ensureNotClosed(): void {
    if (this.isClosed) {
      throw new Error('ZIP handler is closed');
    }
  }
}

export async function createZipHandler(zipPath: string): Promise<ZipHandler> {
  if (!await exists(zipPath)) {
    throw new Error(`ZIP file not found: ${zipPath}`);
  }

  return new UnzipperHandler(zipPath);
}
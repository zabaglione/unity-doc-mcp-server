import { promises as fs } from 'fs';
import { join, dirname, normalize } from 'path';
import { logger } from './logger.js';

export class FileSystemUtils {
  /**
   * Ensure directory exists, create if not
   */
  public static async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      logger().debug(`Directory ensured: ${dirPath}`);
    } catch (error) {
      logger().error(`Failed to create directory: ${dirPath}`, { error });
      throw error;
    }
  }

  /**
   * Check if file or directory exists
   */
  public static async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove file or directory recursively
   */
  public static async remove(path: string): Promise<void> {
    try {
      const stats = await fs.stat(path);
      if (stats.isDirectory()) {
        await fs.rm(path, { recursive: true, force: true });
      } else {
        await fs.unlink(path);
      }
      logger().debug(`Removed: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger().error(`Failed to remove: ${path}`, { error });
        throw error;
      }
    }
  }

  /**
   * Read file content as string
   */
  public static async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    try {
      const content = await fs.readFile(filePath, encoding);
      logger().debug(`Read file: ${filePath}`);
      return content;
    } catch (error) {
      logger().error(`Failed to read file: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Write content to file
   */
  public static async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    try {
      await this.ensureDir(dirname(filePath));
      await fs.writeFile(filePath, content);
      logger().debug(`Wrote file: ${filePath}`);
    } catch (error) {
      logger().error(`Failed to write file: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Copy file from source to destination
   */
  public static async copyFile(src: string, dest: string): Promise<void> {
    try {
      const normalizedSrc = normalize(src);
      const normalizedDest = normalize(dest);
      await this.ensureDir(dirname(normalizedDest));
      await fs.copyFile(normalizedSrc, normalizedDest);
      logger().debug(`Copied file: ${normalizedSrc} -> ${normalizedDest}`);
    } catch (error) {
      logger().error(`Failed to copy file: ${src} -> ${dest}`, { error });
      throw error;
    }
  }

  /**
   * List files in directory
   */
  public static async listFiles(dirPath: string, recursive = false): Promise<string[]> {
    const walk = async (dir: string, files: string[]): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = normalize(join(dir, entry.name));
        
        if (entry.isDirectory() && recursive) {
          await walk(fullPath, files);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };

    try {
      const files: string[] = [];
      await walk(normalize(dirPath), files);
      logger().debug(`Listed ${files.length} files in: ${dirPath}`);
      return files;
    } catch (error) {
      logger().error(`Failed to list files in: ${dirPath}`, { error });
      throw error;
    }
  }

  /**
   * Get file size in bytes
   */
  public static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      logger().error(`Failed to get file size: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Move file from source to destination
   */
  public static async moveFile(src: string, dest: string): Promise<void> {
    try {
      const normalizedSrc = normalize(src);
      const normalizedDest = normalize(dest);
      await this.ensureDir(dirname(normalizedDest));
      await fs.rename(normalizedSrc, normalizedDest);
      logger().debug(`Moved file: ${normalizedSrc} -> ${normalizedDest}`);
    } catch (error) {
      // If rename fails (e.g., across partitions), fall back to copy and delete
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await this.copyFile(src, dest);
        await this.remove(src);
      } else {
        logger().error(`Failed to move file: ${src} -> ${dest}`, { error });
        throw error;
      }
    }
  }

  /**
   * Create a temporary directory
   */
  public static async createTempDir(prefix = 'unity-doc-'): Promise<string> {
    try {
      const tmpDir = process.platform === 'win32' ? process.env.TEMP || process.env.TMP || 'C:\\tmp' : '/tmp';
      const tempDir = await fs.mkdtemp(join(tmpDir, prefix));
      logger().debug(`Created temp directory: ${tempDir}`);
      return tempDir;
    } catch (error) {
      logger().error('Failed to create temp directory', { error });
      throw error;
    }
  }
}

// Export convenience functions
export const ensureDir = FileSystemUtils.ensureDir.bind(FileSystemUtils);
export const exists = FileSystemUtils.exists.bind(FileSystemUtils);
export const remove = FileSystemUtils.remove.bind(FileSystemUtils);
export const readFile = FileSystemUtils.readFile.bind(FileSystemUtils);
export const writeFile = FileSystemUtils.writeFile.bind(FileSystemUtils);
export const copyFile = FileSystemUtils.copyFile.bind(FileSystemUtils);
export const listFiles = FileSystemUtils.listFiles.bind(FileSystemUtils);
export const getFileSize = FileSystemUtils.getFileSize.bind(FileSystemUtils);
export const moveFile = FileSystemUtils.moveFile.bind(FileSystemUtils);
export const createTempDir = FileSystemUtils.createTempDir.bind(FileSystemUtils);
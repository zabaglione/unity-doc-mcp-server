import winston from 'winston';
import { ConfigManager } from '../config/index.js';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    const config = ConfigManager.getInstance().getConfig();
    this.logger = this.createLogger(config.logging);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogger(loggingConfig: { level: string; file?: string }): winston.Logger {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${String(timestamp)} [${String(level)}]: ${String(message)}${metaStr}`;
          })
        ),
      }),
    ];

    if (loggingConfig.file) {
      transports.push(
        new winston.transports.File({
          filename: loggingConfig.file,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );
    }

    return winston.createLogger({
      level: loggingConfig.level,
      transports,
    });
  }

  public async setLogFile(filepath: string): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(filepath), { recursive: true });
    
    // Remove existing file transport if any
    const fileTransport = this.logger.transports.find(
      (transport) => transport instanceof winston.transports.File
    );
    if (fileTransport) {
      this.logger.remove(fileTransport);
    }

    // Add new file transport
    this.logger.add(
      new winston.transports.File({
        filename: filepath,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );
  }

  public error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  public setLevel(level: string): void {
    this.logger.level = level;
  }

  public getLogger(): winston.Logger {
    return this.logger;
  }
}

// Export convenient functions
export const logger = (): Logger => Logger.getInstance();
export const error = (message: string, meta?: Record<string, unknown>): void => 
  logger().error(message, meta);
export const warn = (message: string, meta?: Record<string, unknown>): void => 
  logger().warn(message, meta);
export const info = (message: string, meta?: Record<string, unknown>): void => 
  logger().info(message, meta);
export const debug = (message: string, meta?: Record<string, unknown>): void => 
  logger().debug(message, meta);
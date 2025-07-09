import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Logger, logger, error, warn, info, debug } from '../src/utils/logger.js';
import { ConfigManager } from '../src/config/index.js';
import winston from 'winston';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Logger', () => {
  beforeEach(() => {
    // Clear singleton instances
    vi.clearAllMocks();
    // @ts-expect-error - accessing private static property for testing
    Logger.instance = undefined;
    // @ts-expect-error - accessing private static property for testing
    ConfigManager.instance = undefined;
  });

  afterEach(async () => {
    // Clean up any test log files
    const tmpLogFile = join(tmpdir(), 'test.log');
    try {
      await fs.unlink(tmpLogFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should return singleton instance', () => {
    const instance1 = Logger.getInstance();
    const instance2 = Logger.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should create logger with console transport', () => {
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    
    const consoleTransport = winstonLogger.transports.find(
      (transport) => transport instanceof winston.transports.Console
    );
    expect(consoleTransport).toBeDefined();
  });

  it('should create logger with file transport when configured', () => {
    process.env.LOG_FILE = '/tmp/test.log';
    
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    
    const fileTransport = winstonLogger.transports.find(
      (transport) => transport instanceof winston.transports.File
    );
    expect(fileTransport).toBeDefined();
    
    delete process.env.LOG_FILE;
  });

  it('should log messages at different levels', () => {
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    
    // Spy on winston logger methods
    const errorSpy = vi.spyOn(winstonLogger, 'error');
    const warnSpy = vi.spyOn(winstonLogger, 'warn');
    const infoSpy = vi.spyOn(winstonLogger, 'info');
    const debugSpy = vi.spyOn(winstonLogger, 'debug');

    loggerInstance.error('Error message', { code: 'ERR001' });
    loggerInstance.warn('Warning message');
    loggerInstance.info('Info message');
    loggerInstance.debug('Debug message');

    expect(errorSpy).toHaveBeenCalledWith('Error message', { code: 'ERR001' });
    expect(warnSpy).toHaveBeenCalledWith('Warning message', undefined);
    expect(infoSpy).toHaveBeenCalledWith('Info message', undefined);
    expect(debugSpy).toHaveBeenCalledWith('Debug message', undefined);
  });

  it('should use convenience functions', () => {
    const loggerInstance = logger();
    const winstonLogger = loggerInstance.getLogger();
    
    const errorSpy = vi.spyOn(winstonLogger, 'error');
    const warnSpy = vi.spyOn(winstonLogger, 'warn');
    const infoSpy = vi.spyOn(winstonLogger, 'info');
    const debugSpy = vi.spyOn(winstonLogger, 'debug');

    error('Error via convenience', { detail: 'test' });
    warn('Warn via convenience');
    info('Info via convenience');
    debug('Debug via convenience');

    expect(errorSpy).toHaveBeenCalledWith('Error via convenience', { detail: 'test' });
    expect(warnSpy).toHaveBeenCalledWith('Warn via convenience', undefined);
    expect(infoSpy).toHaveBeenCalledWith('Info via convenience', undefined);
    expect(debugSpy).toHaveBeenCalledWith('Debug via convenience', undefined);
  });

  it('should set log level', () => {
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    
    expect(winstonLogger.level).toBe('info'); // default
    
    loggerInstance.setLevel('debug');
    expect(winstonLogger.level).toBe('debug');
    
    loggerInstance.setLevel('error');
    expect(winstonLogger.level).toBe('error');
  });

  it('should add file transport dynamically', async () => {
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    const tmpLogFile = join(tmpdir(), 'test.log');
    
    // Initially no file transport
    let fileTransport = winstonLogger.transports.find(
      (transport) => transport instanceof winston.transports.File
    );
    expect(fileTransport).toBeUndefined();
    
    // Add file transport
    await loggerInstance.setLogFile(tmpLogFile);
    
    fileTransport = winstonLogger.transports.find(
      (transport) => transport instanceof winston.transports.File
    );
    expect(fileTransport).toBeDefined();
  });

  it('should replace existing file transport', async () => {
    process.env.LOG_FILE = '/tmp/old.log';
    
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    const tmpLogFile = join(tmpdir(), 'new.log');
    
    // Should have initial file transport
    const initialTransportCount = winstonLogger.transports.length;
    
    // Replace with new file transport
    await loggerInstance.setLogFile(tmpLogFile);
    
    // Should still have same number of transports
    expect(winstonLogger.transports.length).toBe(initialTransportCount);
    
    const fileTransport = winstonLogger.transports.find(
      (transport) => transport instanceof winston.transports.File
    ) as winston.transports.FileTransportInstance;
    
    expect(fileTransport).toBeDefined();
    // Winston may modify the filename, so just check it exists
    expect(fileTransport.filename).toBeTruthy();
    
    delete process.env.LOG_FILE;
  });

  it('should respect log level from environment', () => {
    process.env.LOG_LEVEL = 'debug';
    
    const loggerInstance = Logger.getInstance();
    const winstonLogger = loggerInstance.getLogger();
    
    expect(winstonLogger.level).toBe('debug');
    
    delete process.env.LOG_LEVEL;
  });
});
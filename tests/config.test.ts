import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../src/config/index.js';
import type { Config } from '../src/config/types.js';

describe('ConfigManager', () => {
  beforeEach(() => {
    // Clear the singleton instance before each test
    vi.clearAllMocks();
    // @ts-expect-error - accessing private static property for testing
    ConfigManager.instance = undefined;
    
    // Reset environment variables
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.NODE_ENV;
    delete process.env.CACHE_ENABLED;
    delete process.env.CACHE_MAX_SIZE;
    delete process.env.CACHE_TTL;
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FILE;
  });

  it('should return singleton instance', () => {
    const instance1 = ConfigManager.getInstance();
    const instance2 = ConfigManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should load default configuration', () => {
    const manager = ConfigManager.getInstance();
    const config = manager.getConfig();

    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('localhost');
    expect(config.unity.defaultVersion).toBe('6000.1');
    expect(config.unity.supportedVersions).toContain('6000.0');
    expect(config.cache.enabled).toBe(true);
    expect(config.cache.maxSize).toBe(1000);
    expect(config.cache.ttl).toBe(3600);
    expect(config.logging.level).toBe('info');
  });

  it('should load configuration from environment variables', () => {
    process.env.PORT = '8080';
    process.env.HOST = '0.0.0.0';
    process.env.CACHE_ENABLED = 'false';
    process.env.CACHE_MAX_SIZE = '500';
    process.env.CACHE_TTL = '1800';
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FILE = '/tmp/test.log';

    const manager = ConfigManager.getInstance();
    const config = manager.getConfig();

    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.cache.enabled).toBe(false);
    expect(config.cache.maxSize).toBe(500);
    expect(config.cache.ttl).toBe(1800);
    expect(config.logging.level).toBe('debug');
    expect(config.logging.file).toBe('/tmp/test.log');
  });

  it('should get specific config sections', () => {
    const manager = ConfigManager.getInstance();
    
    const serverConfig = manager.get('server');
    expect(serverConfig).toHaveProperty('port');
    expect(serverConfig).toHaveProperty('host');

    const unityConfig = manager.get('unity');
    expect(unityConfig).toHaveProperty('supportedVersions');
    expect(unityConfig).toHaveProperty('defaultVersion');
  });

  it('should update configuration', () => {
    const manager = ConfigManager.getInstance();
    const originalConfig = manager.getConfig();
    
    const updates: Partial<Config> = {
      server: {
        port: 4000,
        host: '127.0.0.1',
      },
    };

    manager.updateConfig(updates);
    const updatedConfig = manager.getConfig();

    expect(updatedConfig.server.port).toBe(4000);
    expect(updatedConfig.server.host).toBe('127.0.0.1');
    // Other configs should remain unchanged
    expect(updatedConfig.unity).toEqual(originalConfig.unity);
  });

  it('should have correct path configurations', () => {
    const manager = ConfigManager.getInstance();
    const config = manager.getConfig();

    expect(config.paths.dataDir).toContain('data');
    expect(config.paths.zipsDir).toContain('unity-zips');
    expect(config.paths.extractedDir).toContain('extracted');
    expect(config.paths.databaseFile).toContain('unity.db');
  });

  it('should enable verbose database mode in development', () => {
    process.env.NODE_ENV = 'development';
    
    const manager = ConfigManager.getInstance();
    const config = manager.getConfig();

    expect(config.database.options.verbose).toBeInstanceOf(Function);
  });
});
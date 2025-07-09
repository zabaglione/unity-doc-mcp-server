import { Config } from './types.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getConfig(): Config {
    return this.config;
  }

  public get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  private loadConfig(): Config {
    const rootDir = join(__dirname, '..', '..');
    const dataDir = join(rootDir, 'data');

    const config: Config = {
      server: {
        port: parseInt(process.env.PORT ?? '3000', 10),
        host: process.env.HOST ?? 'localhost',
      },
      database: {
        path: join(dataDir, 'unity.db'),
        options: {
          verbose: process.env.NODE_ENV === 'development' 
            ? /* eslint-disable-next-line no-console */
              console.log.bind(console) 
            : undefined,
          readonly: false,
          fileMustExist: false,
        },
      },
      unity: {
        supportedVersions: ['6000.0', '6000.1', '6000.2', '6000.3'],
        defaultVersion: '6000.1',
        downloadUrl: 'https://cloudmedia-docs.unity3d.com/docscloudstorage/en/{version}/UnityDocumentation.zip',
      },
      paths: {
        dataDir,
        zipsDir: join(dataDir, 'unity-zips'),
        extractedDir: join(dataDir, 'extracted'),
        databaseFile: join(dataDir, 'unity.db'),
      },
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        maxSize: parseInt(process.env.CACHE_MAX_SIZE ?? '1000', 10),
        ttl: parseInt(process.env.CACHE_TTL ?? '3600', 10),
      },
      logging: {
        level: (process.env.LOG_LEVEL as Config['logging']['level']) ?? 'info',
        file: process.env.LOG_FILE,
      },
    };

    return config;
  }

  public updateConfig(updates: Partial<Config>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Export singleton instance getter
export const getConfig = (): Config => ConfigManager.getInstance().getConfig();
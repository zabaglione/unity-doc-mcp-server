export interface Config {
  // Server settings
  server: {
    port: number;
    host: string;
  };

  // Database settings
  database: {
    path: string;
    options: {
      verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
      readonly?: boolean;
      fileMustExist?: boolean;
    };
  };

  // Unity documentation settings
  unity: {
    supportedVersions: string[];
    defaultVersion: string;
    downloadUrl: string;
  };

  // File paths
  paths: {
    dataDir: string;
    zipsDir: string;
    extractedDir: string;
    databaseFile: string;
  };

  // Cache settings
  cache: {
    enabled: boolean;
    maxSize: number;
    ttl: number; // Time to live in seconds
  };

  // Logging settings
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    file?: string;
  };
}
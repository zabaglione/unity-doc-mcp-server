import { join } from 'path';
import { existsSync, mkdirSync, createWriteStream, createReadStream, unlinkSync } from 'fs';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';
import { Extract } from 'unzipper';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../utils/paths.js';

export interface PackageInfo {
  name: string;
  version: string;
  displayName: string;
  documentation: {
    url?: string;
    offline?: string;
  };
}

// 既知のUnityパッケージとそのドキュメントURL
const KNOWN_PACKAGES: Record<string, PackageInfo> = {
  'com.unity.entities': {
    name: 'com.unity.entities',
    version: '1.3.14',
    displayName: 'Unity ECS (Entities)',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.entities@1.3/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.entities@1.3/com.unity.entities.zip'
    }
  },
  'com.unity.inputsystem': {
    name: 'com.unity.inputsystem',
    version: '1.11.0',
    displayName: 'Unity Input System',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/com.unity.inputsystem.zip'
    }
  },
  'com.unity.render-pipelines.universal': {
    name: 'com.unity.render-pipelines.universal',
    version: '17.0.3',
    displayName: 'Universal Render Pipeline (URP)',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/com.unity.render-pipelines.universal.zip'
    }
  }
};

export class PackageDocumentationDownloader {
  private packagesDir: string;

  constructor() {
    this.packagesDir = join(DATA_DIR, 'unity-packages');
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    if (!existsSync(this.packagesDir)) {
      mkdirSync(this.packagesDir, { recursive: true });
    }
  }

  /**
   * 利用可能なパッケージ一覧を取得
   */
  public getAvailablePackages(): PackageInfo[] {
    return Object.values(KNOWN_PACKAGES);
  }

  /**
   * パッケージドキュメントをダウンロード
   */
  public async downloadPackageDocumentation(packageName: string): Promise<string> {
    const packageInfo = KNOWN_PACKAGES[packageName];
    if (!packageInfo) {
      throw new Error(`Unknown package: ${packageName}`);
    }

    if (!packageInfo.documentation.offline) {
      throw new Error(`No offline documentation available for package: ${packageName}`);
    }

    const downloadUrl = packageInfo.documentation.offline;
    const zipFileName = `${packageName}-${packageInfo.version}.zip`;
    const zipFilePath = join(this.packagesDir, zipFileName);
    const extractPath = join(this.packagesDir, packageName, packageInfo.version);

    // 既に展開済みかチェック
    if (existsSync(extractPath)) {
      logger().info(`Package documentation already exists: ${packageName}@${packageInfo.version}`);
      return extractPath;
    }

    logger().info(`Downloading package documentation: ${packageName}@${packageInfo.version}`);
    logger().info(`Download URL: ${downloadUrl}`);

    try {
      // ZIPファイルをダウンロード
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      // ディレクトリを作成
      mkdirSync(join(this.packagesDir, packageName), { recursive: true });

      // ZIPファイルを保存
      const fileStream = createWriteStream(zipFilePath);
      await pipeline(response.body as NodeJS.ReadableStream, fileStream);
      
      logger().info(`Downloaded ZIP file: ${zipFilePath}`);

      // ZIPファイルを展開
      logger().info(`Extracting to: ${extractPath}`);
      mkdirSync(extractPath, { recursive: true });

      await pipeline(
        createReadStream(zipFilePath),
        Extract({ path: extractPath })
      );

      logger().info(`Successfully extracted package documentation: ${packageName}@${packageInfo.version}`);

      // ZIPファイルを削除（オプション）
      unlinkSync(zipFilePath);

      return extractPath;
    } catch (error) {
      logger().error(`Failed to download package documentation: ${packageName}`, { error });
      throw error;
    }
  }

  /**
   * パッケージドキュメントのパスを取得
   */
  public getPackageDocumentationPath(packageName: string, version?: string): string | null {
    const packageInfo = KNOWN_PACKAGES[packageName];
    if (!packageInfo) {
      return null;
    }

    const useVersion = version ?? packageInfo.version;
    const extractPath = join(this.packagesDir, packageName, useVersion);

    if (existsSync(extractPath)) {
      return extractPath;
    }

    return null;
  }

  /**
   * パッケージ情報を取得
   */
  public getPackageInfo(packageName: string): PackageInfo | null {
    return KNOWN_PACKAGES[packageName] || null;
  }
}
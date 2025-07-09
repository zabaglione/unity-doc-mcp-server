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
  category: 'core' | 'popular' | 'specialized';
  priority: number; // 1-10 (1が最高優先度)
  estimatedSize: string; // 推定サイズ（例: "8MB"）
  description: string;
  documentation: {
    url?: string;
    offline?: string;
  };
}

// 既知のUnityパッケージとそのドキュメントURL
const KNOWN_PACKAGES: Record<string, PackageInfo> = {
  // Core packages - 基本的な開発で必要
  'com.unity.inputsystem': {
    name: 'com.unity.inputsystem',
    version: '1.11.0',
    displayName: 'Unity Input System',
    category: 'core',
    priority: 1,
    estimatedSize: '12MB',
    description: 'Modern input handling system for Unity',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/com.unity.inputsystem.zip'
    }
  },
  'com.unity.render-pipelines.universal': {
    name: 'com.unity.render-pipelines.universal',
    version: '17.0.3',
    displayName: 'Universal Render Pipeline (URP)',
    category: 'core',
    priority: 2,
    estimatedSize: '15MB',
    description: 'Optimized render pipeline for various platforms',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/com.unity.render-pipelines.universal.zip'
    }
  },
  'com.unity.cinemachine': {
    name: 'com.unity.cinemachine',
    version: '2.10.0',
    displayName: 'Cinemachine',
    category: 'core',
    priority: 3,
    estimatedSize: '8MB',
    description: 'Smart camera system for Unity',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.cinemachine@2.10/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.cinemachine@2.10/com.unity.cinemachine.zip'
    }
  },

  // Popular packages - よく使われるパッケージ
  'com.unity.entities': {
    name: 'com.unity.entities',
    version: '1.3.14',
    displayName: 'Unity ECS (Entities)',
    category: 'popular',
    priority: 1,
    estimatedSize: '25MB',
    description: 'Data-oriented technology stack for high-performance gameplay',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.entities@1.3/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.entities@1.3/com.unity.entities.zip'
    }
  },
  'com.unity.addressables': {
    name: 'com.unity.addressables',
    version: '1.21.21',
    displayName: 'Addressables',
    category: 'popular',
    priority: 2,
    estimatedSize: '10MB',
    description: 'Asset management system for Unity',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.addressables@1.21/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.addressables@1.21/com.unity.addressables.zip'
    }
  },
  'com.unity.timeline': {
    name: 'com.unity.timeline',
    version: '1.8.7',
    displayName: 'Timeline',
    category: 'popular',
    priority: 3,
    estimatedSize: '6MB',
    description: 'Visual tool for creating cinematic sequences',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.timeline@1.8/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.timeline@1.8/com.unity.timeline.zip'
    }
  },
  'com.unity.animation.rigging': {
    name: 'com.unity.animation.rigging',
    version: '1.3.1',
    displayName: 'Animation Rigging',
    category: 'popular',
    priority: 4,
    estimatedSize: '7MB',
    description: 'Runtime character rigging and animation',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/com.unity.animation.rigging.zip'
    }
  },

  // Specialized packages - 特定用途向け
  'com.unity.render-pipelines.high-definition': {
    name: 'com.unity.render-pipelines.high-definition',
    version: '17.0.3',
    displayName: 'High Definition Render Pipeline (HDRP)',
    category: 'specialized',
    priority: 1,
    estimatedSize: '20MB',
    description: 'High-fidelity rendering for high-end platforms',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/com.unity.render-pipelines.high-definition.zip'
    }
  },
  'com.unity.netcode.gameobjects': {
    name: 'com.unity.netcode.gameobjects',
    version: '1.12.0',
    displayName: 'Netcode for GameObjects',
    category: 'specialized',
    priority: 2,
    estimatedSize: '18MB',
    description: 'Networking solution for Unity',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@1.12/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@1.12/com.unity.netcode.gameobjects.zip'
    }
  },
  'com.unity.xr.interaction.toolkit': {
    name: 'com.unity.xr.interaction.toolkit',
    version: '3.0.7',
    displayName: 'XR Interaction Toolkit',
    category: 'specialized',
    priority: 3,
    estimatedSize: '14MB',
    description: 'Framework for creating XR interactions',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/com.unity.xr.interaction.toolkit.zip'
    }
  },
  'com.unity.ai.navigation': {
    name: 'com.unity.ai.navigation',
    version: '1.1.5',
    displayName: 'AI Navigation',
    category: 'specialized',
    priority: 4,
    estimatedSize: '5MB',
    description: 'AI pathfinding and navigation system',
    documentation: {
      url: 'https://docs.unity3d.com/Packages/com.unity.ai.navigation@1.1/',
      offline: 'https://docs.unity3d.com/Packages/com.unity.ai.navigation@1.1/com.unity.ai.navigation.zip'
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

  /**
   * カテゴリ別のパッケージ一覧を取得
   */
  public getPackagesByCategory(category: 'core' | 'popular' | 'specialized'): PackageInfo[] {
    return Object.values(KNOWN_PACKAGES)
      .filter(pkg => pkg.category === category)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * 複数のパッケージを一括ダウンロード
   */
  public async batchDownloadPackages(packageNames: string[], onProgress?: (completed: number, total: number, current: string) => void): Promise<{ successful: string[], failed: Array<{ package: string, error: string }> }> {
    const results = {
      successful: [] as string[],
      failed: [] as Array<{ package: string, error: string }>
    };

    for (let i = 0; i < packageNames.length; i++) {
      const packageName = packageNames[i];
      
      try {
        onProgress?.(i, packageNames.length, packageName);
        logger().info(`Downloading package ${i + 1}/${packageNames.length}: ${packageName}`);
        
        await this.downloadPackageDocumentation(packageName);
        results.successful.push(packageName);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ package: packageName, error: errorMessage });
        logger().error(`Failed to download ${packageName}:`, { error: errorMessage });
      }
    }

    return results;
  }

  /**
   * カテゴリ別一括ダウンロード
   */
  public async downloadPackagesByCategory(category: 'core' | 'popular' | 'specialized', onProgress?: (completed: number, total: number, current: string) => void): Promise<{ successful: string[], failed: Array<{ package: string, error: string }> }> {
    const packages = this.getPackagesByCategory(category);
    const packageNames = packages.map(pkg => pkg.name);
    
    logger().info(`Starting batch download for ${category} packages (${packageNames.length} packages)`);
    
    return await this.batchDownloadPackages(packageNames, onProgress);
  }

  /**
   * 推奨パッケージ（優先度の高いパッケージ）を取得
   */
  public getRecommendedPackages(maxCount: number = 5): PackageInfo[] {
    return Object.values(KNOWN_PACKAGES)
      .filter(pkg => pkg.priority <= 3) // 優先度3以下のパッケージ
      .sort((a, b) => {
        // カテゴリ別優先度: core > popular > specialized
        const categoryOrder = { core: 1, popular: 2, specialized: 3 };
        const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
        if (categoryDiff !== 0) return categoryDiff;
        
        // 同じカテゴリ内では優先度順
        return a.priority - b.priority;
      })
      .slice(0, maxCount);
  }

  /**
   * ダウンロード統計情報を取得
   */
  public getDownloadStatistics(): { total: number, downloaded: number, categories: Record<string, { total: number, downloaded: number }>, estimatedTotalSize: string } {
    const allPackages = Object.values(KNOWN_PACKAGES);
    const categories = { core: { total: 0, downloaded: 0 }, popular: { total: 0, downloaded: 0 }, specialized: { total: 0, downloaded: 0 } };
    
    let downloadedCount = 0;
    let totalEstimatedSize = 0;

    for (const pkg of allPackages) {
      categories[pkg.category].total++;
      
      // パッケージがダウンロード済みかチェック
      if (this.getPackageDocumentationPath(pkg.name)) {
        downloadedCount++;
        categories[pkg.category].downloaded++;
      }
      
      // 推定サイズを計算（MB表記から数値に変換）
      const sizeMatch = pkg.estimatedSize.match(/(\d+)MB/);
      if (sizeMatch) {
        totalEstimatedSize += parseInt(sizeMatch[1]);
      }
    }

    return {
      total: allPackages.length,
      downloaded: downloadedCount,
      categories,
      estimatedTotalSize: `${totalEstimatedSize}MB`
    };
  }
}
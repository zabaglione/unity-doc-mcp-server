#!/usr/bin/env tsx
/**
 * Unity パッケージドキュメントをデータベースにインデックスするスクリプト
 * 
 * 使用方法:
 *   npm run index-package-docs [package-name]
 * 
 * 例:
 *   npm run index-package-docs com.unity.entities
 *   npm run index-package-docs  # 全てのダウンロード済みパッケージをインデックス
 */

import { join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { DatabaseConnection } from '../database/connection.js';
import { HtmlParser } from '../parser/index.js';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../utils/paths.js';
import { PackageDocumentationDownloader } from '../downloader/package-downloader.js';
import crypto from 'crypto';

interface IndexingStats {
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  startTime: number;
}

async function findHtmlFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const htmlFiles: string[] = [];
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // 再帰的にディレクトリを探索
        const subFiles = await findHtmlFiles(fullPath, baseDir);
        htmlFiles.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        // 相対パスを計算
        const relativePath = fullPath.substring(baseDir.length + 1);
        htmlFiles.push(relativePath);
      }
    }
  } catch (error) {
    logger().error(`Failed to read directory: ${dir}`, { error });
  }
  
  return htmlFiles;
}

async function indexPackageDocumentation(packageName: string, packageVersion: string, docsPath: string): Promise<void> {
  const stats: IndexingStats = {
    totalFiles: 0,
    processedFiles: 0,
    failedFiles: 0,
    startTime: Date.now(),
  };
  
  console.log(`\nIndexing package documentation: ${packageName}@${packageVersion}`);
  console.log(`Documentation path: ${docsPath}`);
  console.log('======================================\n');
  
  // HTMLファイルを検索
  const htmlFiles = await findHtmlFiles(docsPath);
  stats.totalFiles = htmlFiles.length;
  
  console.log(`Found ${stats.totalFiles} HTML files\n`);
  
  const db = DatabaseConnection.getInstance();
  const database = db.getDatabase();
  const parser = new HtmlParser();
  
  // バッチインサート用の準備
  const insertStmt = database.prepare(`
    INSERT OR REPLACE INTO documents (
      id, unity_version, type, title, file_path, url, 
      content, html, package_name, package_version,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  
  const transaction = database.transaction((files: string[]) => {
    for (const relativePath of files) {
      try {
        const fullPath = join(docsPath, relativePath);
        const html = readFileSync(fullPath, 'utf-8');
        
        // HTMLをパース
        const parsed = parser.parse(html, relativePath);
        
        // ドキュメントIDを生成（パッケージ名を含む）
        const docId = `${packageName}/${relativePath}`;
        const idHash = crypto.createHash('sha256').update(docId).digest('hex').substring(0, 16);
        
        // Unity バージョンは6000.1固定（パッケージはUnity 6用）
        const unityVersion = '6000.1';
        
        // URLを構築（オプション）
        const url = `https://docs.unity3d.com/Packages/${packageName}@${packageVersion}/${relativePath}`;
        
        const now = new Date().toISOString();
        
        insertStmt.run(
          idHash,
          unityVersion,
          'package-docs',
          parsed.title,
          relativePath,
          url,
          parsed.content,
          html,
          packageName,
          packageVersion,
          now,
          now
        );
        
        stats.processedFiles++;
        
        if (stats.processedFiles % 100 === 0) {
          const progress = ((stats.processedFiles / stats.totalFiles) * 100).toFixed(1);
          console.log(`Progress: ${progress}% (${stats.processedFiles}/${stats.totalFiles})`);
        }
      } catch (error) {
        stats.failedFiles++;
        logger().error(`Failed to process file: ${relativePath}`, { error });
      }
    }
  });
  
  // トランザクション実行
  try {
    transaction(htmlFiles);
    
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
    
    console.log('\n======================================');
    console.log('Indexing completed!');
    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Processed: ${stats.processedFiles}`);
    console.log(`Failed: ${stats.failedFiles}`);
    console.log(`Duration: ${duration} seconds`);
    console.log('======================================\n');
    
  } catch (error) {
    logger().error('Transaction failed', { error });
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const packageName = args[0];
  
  console.log('\n🚀 Unity Package Documentation Indexer');
  console.log('=====================================');
  
  try {
    // データベース接続を初期化
    await DatabaseConnection.getInstance().initialize();
    
    const downloader = new PackageDocumentationDownloader();
    const packagesDir = join(DATA_DIR, 'unity-packages');
    
    if (packageName) {
      // 特定のパッケージをインデックス
      const packageInfo = downloader.getPackageInfo(packageName);
      if (!packageInfo) {
        console.error(`Error: Unknown package "${packageName}"`);
        process.exit(1);
      }
      
      const docsPath = downloader.getPackageDocumentationPath(packageName);
      if (!docsPath) {
        console.error(`Error: Package documentation not found for "${packageName}"`);
        console.log(`Run "npm run download-package-docs ${packageName}" first`);
        process.exit(1);
      }
      
      await indexPackageDocumentation(packageName, packageInfo.version, docsPath);
      
    } else {
      // 全てのダウンロード済みパッケージをインデックス
      if (!existsSync(packagesDir)) {
        console.log('No package documentation found.');
        console.log('Run "npm run download-package-docs <package-name>" first');
        process.exit(0);
      }
      
      const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      if (packageDirs.length === 0) {
        console.log('No package documentation found.');
        console.log('Run "npm run download-package-docs <package-name>" first');
        process.exit(0);
      }
      
      for (const pkgName of packageDirs) {
        const pkgDir = join(packagesDir, pkgName);
        const versionDirs = readdirSync(pkgDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        
        for (const version of versionDirs) {
          const docsPath = join(pkgDir, version);
          await indexPackageDocumentation(pkgName, version, docsPath);
        }
      }
    }
    
    console.log('✅ All package documentation indexed successfully!');
    
  } catch (error) {
    console.error('\n❌ Indexing failed:', error instanceof Error ? error.message : error);
    logger().error('Package documentation indexing failed', { error });
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
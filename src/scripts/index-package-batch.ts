#!/usr/bin/env tsx
/**
 * Unity パッケージドキュメントを一括インデックスするスクリプト
 * 
 * 使用方法:
 *   npm run index-package-batch [category|all]
 * 
 * 例:
 *   npm run index-package-batch core           # Coreパッケージのみ
 *   npm run index-package-batch popular       # Popularパッケージのみ
 *   npm run index-package-batch specialized   # Specializedパッケージのみ
 *   npm run index-package-batch all           # 全てのダウンロード済みパッケージ
 *   npm run index-package-batch               # 全てのダウンロード済みパッケージ（デフォルト）
 */

import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';
import { DatabaseConnection } from '../database/connection.js';
import { HtmlParser } from '../parser/index.js';
import { logger } from '../utils/logger.js';
import { PackageDocumentationDownloader } from '../downloader/package-downloader.js';
import crypto from 'crypto';

interface IndexingStats {
  totalPackages: number;
  processedPackages: number;
  failedPackages: number;
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
        const subFiles = await findHtmlFiles(fullPath, baseDir);
        htmlFiles.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const relativePath = fullPath.substring(baseDir.length + 1);
        htmlFiles.push(relativePath);
      }
    }
  } catch (error) {
    logger().error(`Failed to read directory: ${dir}`, { error });
  }
  
  return htmlFiles;
}

async function indexPackageDocumentation(packageName: string, packageVersion: string, docsPath: string): Promise<{ success: boolean, fileCount: number }> {
  console.log(`\n  Indexing: ${packageName}@${packageVersion}`);
  console.log(`  Path: ${docsPath}`);
  
  const htmlFiles = await findHtmlFiles(docsPath);
  
  if (htmlFiles.length === 0) {
    console.log(`  ⚠️  No HTML files found`);
    return { success: false, fileCount: 0 };
  }
  
  console.log(`  Found ${htmlFiles.length} HTML files`);
  
  const db = DatabaseConnection.getInstance();
  const database = db.getDatabase();
  const parser = new HtmlParser();
  
  const insertStmt = database.prepare(`
    INSERT OR REPLACE INTO documents (
      id, unity_version, type, title, file_path, url, 
      content, html, package_name, package_version,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  
  let processedFiles = 0;
  let failedFiles = 0;
  
  const transaction = database.transaction((files: string[]) => {
    for (const relativePath of files) {
      try {
        const fullPath = join(docsPath, relativePath);
        const html = readFileSync(fullPath, 'utf-8');
        
        const parsed = parser.parse(html, relativePath);
        
        const docId = `${packageName}/${relativePath}`;
        const idHash = crypto.createHash('sha256').update(docId).digest('hex').substring(0, 16);
        
        const unityVersion = '6000.1';
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
        
        processedFiles++;
      } catch (error) {
        failedFiles++;
        logger().error(`Failed to process file: ${relativePath}`, { error });
      }
    }
  });
  
  try {
    transaction(htmlFiles);
    console.log(`  ✅ Indexed ${processedFiles} files`);
    
    if (failedFiles > 0) {
      console.log(`  ⚠️  ${failedFiles} files failed`);
    }
    
    return { success: true, fileCount: processedFiles };
  } catch (error) {
    console.log(`  ❌ Transaction failed: ${error}`);
    return { success: false, fileCount: 0 };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const category = args[0] || 'all';
  
  console.log('\n🚀 Unity Package Documentation Batch Indexer');
  console.log('============================================');
  
  try {
    await DatabaseConnection.getInstance().initialize();
    
    const downloader = new PackageDocumentationDownloader();
    
    let packagesToIndex: string[] = [];
    
    if (category === 'all') {
      // 全てのダウンロード済みパッケージを検索
      const allPackages = downloader.getAvailablePackages();
      packagesToIndex = allPackages
        .filter(pkg => downloader.getPackageDocumentationPath(pkg.name))
        .map(pkg => pkg.name);
    } else if (category === 'core' || category === 'popular' || category === 'specialized') {
      // 特定カテゴリのダウンロード済みパッケージを検索
      const categoryPackages = downloader.getPackagesByCategory(category);
      packagesToIndex = categoryPackages
        .filter(pkg => downloader.getPackageDocumentationPath(pkg.name))
        .map(pkg => pkg.name);
    } else {
      console.error(`Error: Unknown category "${category}"`);
      console.log('\nSupported categories: core, popular, specialized, all');
      process.exit(1);
    }
    
    if (packagesToIndex.length === 0) {
      console.log('\nNo downloaded packages found for indexing.');
      console.log('Run "npm run download-package-batch <category>" to download packages first.');
      process.exit(0);
    }
    
    const stats: IndexingStats = {
      totalPackages: packagesToIndex.length,
      processedPackages: 0,
      failedPackages: 0,
      totalFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
      startTime: Date.now()
    };
    
    console.log(`\nCategory: ${category.toUpperCase()}`);
    console.log(`Packages to index: ${stats.totalPackages}`);
    console.log('\nStarting batch indexing...');
    
    for (const packageName of packagesToIndex) {
      const packageInfo = downloader.getPackageInfo(packageName);
      if (!packageInfo) {
        console.log(`\n❌ Package info not found: ${packageName}`);
        stats.failedPackages++;
        continue;
      }
      
      const docsPath = downloader.getPackageDocumentationPath(packageName);
      if (!docsPath) {
        console.log(`\n❌ Package documentation not found: ${packageName}`);
        stats.failedPackages++;
        continue;
      }
      
      try {
        const result = await indexPackageDocumentation(packageName, packageInfo.version, docsPath);
        
        if (result.success) {
          stats.processedPackages++;
          stats.processedFiles += result.fileCount;
        } else {
          stats.failedPackages++;
        }
        
      } catch (error) {
        console.log(`\n❌ Failed to index ${packageName}:`, error);
        stats.failedPackages++;
      }
    }
    
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
    
    console.log('\n============================================');
    console.log('Batch indexing completed!');
    console.log(`Packages processed: ${stats.processedPackages}/${stats.totalPackages}`);
    console.log(`Files processed: ${stats.processedFiles}`);
    console.log(`Failed packages: ${stats.failedPackages}`);
    console.log(`Duration: ${duration} seconds`);
    console.log('============================================\n');
    
    if (stats.processedPackages > 0) {
      console.log('✅ Package documentation is now searchable!');
      console.log('\nNext steps:');
      console.log('1. Use the search_unity_docs tool with type="package-docs"');
      console.log('2. Use the search_unity_docs tool with type="all" to search all documentation');
    }
    
  } catch (error) {
    console.error('\n❌ Batch indexing failed:', error instanceof Error ? error.message : error);
    logger().error('Package documentation batch indexing failed', { category, error });
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
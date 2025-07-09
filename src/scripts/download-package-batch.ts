#!/usr/bin/env tsx
/**
 * Unity パッケージドキュメントを一括ダウンロードするスクリプト
 * 
 * 使用方法:
 *   npm run download-package-batch <category|recommended|all>
 *   npm run download-package-batch --list
 * 
 * 例:
 *   npm run download-package-batch core           # Coreパッケージのみ
 *   npm run download-package-batch popular       # Popularパッケージのみ
 *   npm run download-package-batch specialized   # Specializedパッケージのみ
 *   npm run download-package-batch recommended   # 推奨パッケージのみ
 *   npm run download-package-batch all           # 全てのパッケージ
 *   npm run download-package-batch --list        # 利用可能なオプション表示
 */

import { PackageDocumentationDownloader } from '../downloader/package-downloader.js';
import { logger } from '../utils/logger.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Unity Package Documentation Batch Downloader

Usage:
  npm run download-package-batch <category|recommended|all>
  npm run download-package-batch --list

Options:
  core         - Download core packages (Input System, URP, Cinemachine)
  popular      - Download popular packages (ECS, Addressables, Timeline, etc.)
  specialized  - Download specialized packages (HDRP, Netcode, XR, etc.)
  recommended  - Download recommended packages (top priority packages)
  all          - Download all available packages
  --list       - Show available packages by category

Examples:
  npm run download-package-batch core
  npm run download-package-batch recommended
  npm run download-package-batch all
`);
    process.exit(0);
  }

  const downloader = new PackageDocumentationDownloader();

  if (args[0] === '--list') {
    console.log('\nAvailable Unity Package Categories:');
    console.log('==================================\n');
    
    const categories = ['core', 'popular', 'specialized'] as const;
    
    for (const category of categories) {
      const packages = downloader.getPackagesByCategory(category);
      console.log(`${category.toUpperCase()} (${packages.length} packages):`);
      
      packages.forEach(pkg => {
        console.log(`  - ${pkg.displayName} (${pkg.estimatedSize})`);
        console.log(`    ${pkg.description}`);
      });
      console.log();
    }
    
    console.log('RECOMMENDED (Top priority packages):');
    const recommended = downloader.getRecommendedPackages();
    recommended.forEach(pkg => {
      console.log(`  - ${pkg.displayName} (${pkg.category}, ${pkg.estimatedSize})`);
    });
    console.log();
    
    // 統計情報を表示
    const stats = downloader.getDownloadStatistics();
    console.log(`Total packages: ${stats.total}`);
    console.log(`Downloaded: ${stats.downloaded}`);
    console.log(`Estimated total size: ${stats.estimatedTotalSize}`);
    
    process.exit(0);
  }

  const option = args[0];
  
  try {
    console.log(`\nUnity Package Documentation Batch Downloader`);
    console.log('============================================\n');
    
    let packageNames: string[] = [];
    let categoryName = '';
    
    if (option === 'core' || option === 'popular' || option === 'specialized') {
      const packages = downloader.getPackagesByCategory(option);
      packageNames = packages.map(pkg => pkg.name);
      categoryName = option.toUpperCase();
    } else if (option === 'recommended') {
      const packages = downloader.getRecommendedPackages();
      packageNames = packages.map(pkg => pkg.name);
      categoryName = 'RECOMMENDED';
    } else if (option === 'all') {
      const packages = downloader.getAvailablePackages();
      packageNames = packages.map(pkg => pkg.name);
      categoryName = 'ALL';
    } else {
      console.error(`Error: Unknown option "${option}"`);
      console.log('\nRun with --list to see available options');
      process.exit(1);
    }
    
    console.log(`Category: ${categoryName}`);
    console.log(`Packages to download: ${packageNames.length}`);
    
    // 推定サイズを計算
    const packages = downloader.getAvailablePackages();
    let totalEstimatedSize = 0;
    packageNames.forEach(name => {
      const pkg = packages.find(p => p.name === name);
      if (pkg) {
        const sizeMatch = pkg.estimatedSize.match(/(\d+)MB/);
        if (sizeMatch) {
          totalEstimatedSize += parseInt(sizeMatch[1]);
        }
      }
    });
    
    console.log(`Estimated download size: ${totalEstimatedSize}MB`);
    console.log(`\nStarting batch download...`);
    console.log('=====================================\n');
    
    const results = await downloader.batchDownloadPackages(packageNames, (completed, total, current) => {
      const progress = ((completed / total) * 100).toFixed(1);
      console.log(`[${completed}/${total}] ${progress}% - Downloading: ${current}`);
    });
    
    console.log('\n=====================================');
    console.log('Batch download completed!');
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    if (results.successful.length > 0) {
      console.log('\nSuccessfully downloaded:');
      results.successful.forEach(pkg => {
        console.log(`  ✅ ${pkg}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\nFailed to download:');
      results.failed.forEach(failure => {
        console.log(`  ❌ ${failure.package}: ${failure.error}`);
      });
    }
    
    console.log('\nNext steps:');
    console.log('1. Run "npm run index-package-batch" to index all downloaded packages');
    console.log('2. Use the search_unity_docs tool with type="package-docs" to search package documentation');
    
  } catch (error) {
    console.error('\n❌ Batch download failed:', error instanceof Error ? error.message : error);
    logger().error('Package documentation batch download failed', { option, error });
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
#!/usr/bin/env tsx
/**
 * Unity パッケージドキュメントをダウンロードするスクリプト
 * 
 * 使用方法:
 *   npm run download-package-docs <package-name>
 *   npm run download-package-docs --list
 * 
 * 例:
 *   npm run download-package-docs com.unity.entities
 *   npm run download-package-docs --list
 */

import { PackageDocumentationDownloader } from '../downloader/package-downloader.js';
import { logger } from '../utils/logger.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Unity Package Documentation Downloader

Usage:
  npm run download-package-docs <package-name>
  npm run download-package-docs --list

Examples:
  npm run download-package-docs com.unity.entities
  npm run download-package-docs --list

Available packages:
  - com.unity.entities (Unity ECS)
  - com.unity.inputsystem (Unity Input System)
  - com.unity.render-pipelines.universal (URP)
`);
    process.exit(0);
  }

  const downloader = new PackageDocumentationDownloader();

  if (args[0] === '--list') {
    console.log('\nAvailable Unity packages:');
    console.log('========================\n');
    
    const packages = downloader.getAvailablePackages();
    packages.forEach(pkg => {
      console.log(`${pkg.name} (${pkg.displayName})`);
      console.log(`  Version: ${pkg.version}`);
      console.log(`  Documentation: ${pkg.documentation.url || 'N/A'}`);
      console.log();
    });
    
    process.exit(0);
  }

  const packageName = args[0];
  
  try {
    console.log(`\nDownloading documentation for: ${packageName}`);
    console.log('==========================================\n');
    
    const packageInfo = downloader.getPackageInfo(packageName);
    if (!packageInfo) {
      console.error(`Error: Unknown package "${packageName}"`);
      console.log('\nRun with --list to see available packages');
      process.exit(1);
    }
    
    console.log(`Package: ${packageInfo.displayName}`);
    console.log(`Version: ${packageInfo.version}`);
    console.log(`\nStarting download...`);
    
    const extractPath = await downloader.downloadPackageDocumentation(packageName);
    
    console.log('\n✅ Download completed successfully!');
    console.log(`Documentation extracted to: ${extractPath}`);
    console.log('\nNext steps:');
    console.log('1. Run "npm run index-package-docs" to index the documentation');
    console.log('2. Use the search_unity_docs tool with type="package-docs" to search package documentation');
    
  } catch (error) {
    console.error('\n❌ Download failed:', error instanceof Error ? error.message : error);
    logger().error('Package documentation download failed', { packageName, error });
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
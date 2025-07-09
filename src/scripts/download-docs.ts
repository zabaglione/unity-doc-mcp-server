#!/usr/bin/env tsx

import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { createHttpDownloader } from '../http/downloader.js';
import { createZipHandler } from '../zip/handler.js';
import { logger } from '../utils/logger.js';

async function main() {
  const version = process.argv[2];
  
  if (!version) {
    console.error('使用方法: npm run download-docs <version>');
    console.error('例: npm run download-docs 6000.1');
    process.exit(1);
  }

  logger().info(`Unity ${version} ドキュメントのダウンロードを開始します`);

  try {
    // データディレクトリの確認
    const dataDir = join(process.cwd(), 'data');
    const zipsDir = join(dataDir, 'unity-zips');
    const extractedDir = join(dataDir, 'extracted');

    if (!existsSync(zipsDir)) {
      mkdirSync(zipsDir, { recursive: true });
    }
    if (!existsSync(extractedDir)) {
      mkdirSync(extractedDir, { recursive: true });
    }

    // ダウンロード
    const downloader = createHttpDownloader();
    const zipPath = join(zipsDir, `unity-${version}.zip`);
    const url = `https://cloudmedia-docs.unity3d.com/docscloudstorage/en/${version}/UnityDocumentation.zip`;
    
    if (existsSync(zipPath)) {
      logger().info('ZIPファイルは既に存在します。スキップします。');
    } else {
      logger().info('ダウンロード中...');
      await downloader.download({
        url,
        outputPath: zipPath,
        onProgress: (progress) => {
          process.stdout.write(`\rダウンロード中: ${progress.percent.toFixed(1)}%`);
        }
      });
      process.stdout.write('\n');
      logger().info('ダウンロード完了');
    }

    // 解凍
    const extractPath = join(extractedDir, `unity-${version}`);
    if (existsSync(extractPath)) {
      logger().info('既に解凍済みです。スキップします。');
    } else {
      logger().info('解凍中...');
      const zipHandler = await createZipHandler(zipPath);
      await zipHandler.extractAll({ outputDir: extractPath, overwrite: true });
      logger().info('解凍完了');
    }

    logger().info(`✅ Unity ${version} ドキュメントの準備が完了しました`);
    logger().info(`解凍先: ${extractPath}`);

  } catch (error) {
    logger().error('エラーが発生しました:', { error });
    process.exit(1);
  }
}

main().catch(console.error);

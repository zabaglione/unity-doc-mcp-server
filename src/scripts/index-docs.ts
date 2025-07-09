#!/usr/bin/env tsx

import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { DatabaseConnection } from '../database/connection.js';
import { HtmlParser } from '../parser/index.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

async function main() {
  const version = process.argv[2] || '6000.1';
  
  logger().info(`Starting document indexing for Unity ${version}`);

  try {
    // データベース接続
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initialize();
    const db = dbConnection.getDatabase();
    
    // パーサーを初期化
    const parser = new HtmlParser();
    
    // ドキュメントディレクトリ
    const docsPath = join(process.cwd(), 'data', 'extracted', `unity-${version}`);
    
    // 既存のドキュメントをクリア（バージョンごと）
    const deleteStmt = db.prepare('DELETE FROM documents WHERE unity_version = ?');
    deleteStmt.run(version);
    logger().info('Cleared existing documents for version', { version });
    
    // インサート用のステートメントを準備
    const insertStmt = db.prepare(`
      INSERT INTO documents (
        id, unity_version, type, title, file_path, url, content, html
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    
    // HTMLファイルを再帰的に探索
    let processedCount = 0;
    let errorCount = 0;
    
    async function processDirectory(dirPath: string) {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await processDirectory(fullPath);
        } else if (entry.name.endsWith('.html')) {
          try {
            // HTMLファイルを読み込み
            const html = await readFile(fullPath, 'utf-8');
            
            // 相対パスを計算
            const relativePath = fullPath.replace(docsPath + '/', '');
            
            // パース
            const parsed = parser.parse(html, relativePath);
            
            // IDを生成（ファイルパスのハッシュ）
            const id = crypto
              .createHash('sha256')
              .update(`${version}:${relativePath}`)
              .digest('hex')
              .substring(0, 16);
            
            // URLを構築
            const url = `unity://${version}/${relativePath}`;
            
            // データベースに挿入
            insertStmt.run(
              id,
              version,
              parsed.type,
              parsed.title,
              relativePath,
              url,
              parsed.content,
              html
            );
            
            processedCount++;
            
            if (processedCount % 100 === 0) {
              logger().info(`Processed ${processedCount} documents...`);
            }
            
          } catch (error) {
            logger().error('Failed to process document', { 
              file: fullPath, 
              error: error instanceof Error ? error.message : String(error) 
            });
            errorCount++;
          }
        }
      }
    }
    
    // インデックス作成開始
    logger().info('Starting document processing...');
    await processDirectory(docsPath);
    
    // 統計情報を表示
    const stats = db.prepare(`
      SELECT 
        type,
        COUNT(*) as count
      FROM documents
      WHERE unity_version = ?
      GROUP BY type
    `).all(version) as Array<{ type: string; count: number }>;
    
    logger().info('Indexing completed', {
      totalProcessed: processedCount,
      errors: errorCount,
      stats
    });
    
    // FTSインデックスを最適化
    logger().info('Optimizing FTS index...');
    db.exec("INSERT INTO documents_fts(documents_fts) VALUES('optimize')");
    
    logger().info('✅ Document indexing completed successfully');
    
  } catch (error) {
    logger().error('Indexing failed:', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

main().catch(console.error);
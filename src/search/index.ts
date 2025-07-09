import { DatabaseConnection } from '../database/connection.js';
import { DocumentRow } from '../database/schema.js';
import { logger } from '../utils/logger.js';

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  type?: 'all' | 'manual' | 'script-reference' | 'package-docs';
  version?: string;
  packageName?: string;
  packageVersion?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'manual' | 'script-reference' | 'package-docs';
  filePath: string;
  url?: string;
  snippet: string;
  score: number;
  packageName?: string;
  packageVersion?: string;
}

export class DocumentSearch {
  private db: DatabaseConnection;
  
  constructor() {
    this.db = DatabaseConnection.getInstance();
  }
  
  /**
   * FTS5検索クエリをサニタイズして特殊文字をエスケープ
   */
  private sanitizeSearchQuery(query: string): string {
    // FTS5の特殊文字をエスケープ
    // ドット、ハイフン、その他の特殊文字を適切に処理
    return query
      .replace(/[.]/g, '') // ドットを削除
      .replace(/[()]/g, '') // 括弧を削除
      .replace(/[*]/g, '') // アスタリスクを削除
      .replace(/[?]/g, '') // クエスチョンマークを削除
      .replace(/[{}]/g, '') // 波括弧を削除
      .replace(/[[\]]/g, '') // 角括弧を削除
      .replace(/[^a-zA-Z0-9\s_-]/g, ' ') // 英数字、スペース、アンダースコア、ハイフン以外を空白に置換
      .replace(/\s+/g, ' ') // 複数の空白を1つに統合
      .trim(); // 前後の空白を削除
  }

  /**
   * Unity ドキュメントを検索
   */
  public search(options: SearchOptions): SearchResult[] {
    const { 
      query, 
      limit = 10, 
      offset = 0, 
      type = 'all',
      version = '6000.1',
      packageName,
      packageVersion
    } = options;
    
    logger().debug('Searching documents', { query, limit, offset, type, version });
    
    try {
      // 検索クエリをサニタイズ
      const sanitizedQuery = this.sanitizeSearchQuery(query);
      
      if (!sanitizedQuery.trim()) {
        logger().warn('Empty search query after sanitization', { originalQuery: query });
        return [];
      }
      
      // FTS5を使用した全文検索
      let sql = `
        SELECT 
          d.id,
          d.title,
          d.type,
          d.file_path,
          d.url,
          d.package_name,
          d.package_version,
          snippet(documents_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
          rank as score
        FROM documents_fts fts
        INNER JOIN documents d ON d.rowid = fts.rowid
        WHERE documents_fts MATCH ?
          AND d.unity_version = ?
      `;
      
      const params: (string | number)[] = [sanitizedQuery, version];
      
      // タイプフィルタ
      if (type !== 'all') {
        sql += ' AND d.type = ?';
        params.push(type);
      }
      
      // パッケージフィルタ
      if (packageName) {
        sql += ' AND d.package_name = ?';
        params.push(packageName);
      }
      
      if (packageVersion) {
        sql += ' AND d.package_version = ?';
        params.push(packageVersion);
      }
      
      // ランキング順でソート
      sql += ' ORDER BY rank LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const results = this.db.getDatabase()
        .prepare(sql)
        .all(...params) as Array<{
          id: string;
          title: string;
          type: 'manual' | 'script-reference' | 'package-docs';
          file_path: string;
          url?: string;
          package_name?: string;
          package_version?: string;
          snippet: string;
          score: number;
        }>;
      
      return results.map(row => ({
        id: row.id,
        title: row.title,
        type: row.type,
        filePath: row.file_path,
        url: row.url,
        packageName: row.package_name,
        packageVersion: row.package_version,
        snippet: row.snippet,
        score: Math.abs(row.score) // FTS5のrankは負の値
      }));
      
    } catch (error) {
      logger().error('Search failed', { error });
      throw error;
    }
  }
  
  /**
   * IDでドキュメントを取得
   */
  public getDocument(id: string): DocumentRow | null {
    try {
      const doc = this.db.getDatabase()
        .prepare('SELECT * FROM documents WHERE id = ?')
        .get(id) as DocumentRow | undefined;
      
      return doc ?? null;
    } catch (error) {
      logger().error('Failed to get document', { id, error });
      throw error;
    }
  }
  
  /**
   * ファイルパスでドキュメントを取得
   */
  public getDocumentByPath(filePath: string, version: string = '6000.1'): DocumentRow | null {
    try {
      const doc = this.db.getDatabase()
        .prepare('SELECT * FROM documents WHERE file_path = ? AND unity_version = ?')
        .get(filePath, version) as DocumentRow | undefined;
      
      return doc ?? null;
    } catch (error) {
      logger().error('Failed to get document by path', { filePath, error });
      throw error;
    }
  }
  
  /**
   * 類似ドキュメントを検索
   */
  public async findSimilar(documentId: string, limit: number = 5): Promise<SearchResult[]> {
    try {
      // 元のドキュメントを取得
      const doc = this.getDocument(documentId);
      if (!doc) {
        return [];
      }
      
      // タイトルから重要な単語を抽出して検索
      const keywords = doc.title
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 3)
        .join(' ');
      
      const results = this.search({
        query: keywords,
        limit: limit + 1, // 自分自身を除外するため+1
        type: doc.type,
        version: doc.unity_version
      });
      
      return results.filter(r => r.id !== documentId).slice(0, limit);
      
    } catch (error) {
      logger().error('Failed to find similar documents', { documentId, error });
      return [];
    }
  }
}
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

export interface ParsedDocument {
  title: string;
  content: string;
  type: 'manual' | 'script-reference';
  sections: Array<{
    title: string;
    content: string;
  }>;
}

export class HtmlParser {
  /**
   * Unity HTMLドキュメントをパース
   */
  public parse(html: string, filePath: string): ParsedDocument {
    const $ = cheerio.load(html);
    
    // ドキュメントタイプを判定
    const type = this.detectDocumentType(filePath);
    
    // タイトルを抽出
    const title = this.extractTitle($);
    
    // コンテンツを抽出
    const content = this.extractContent($);
    
    // セクションを抽出
    const sections = this.extractSections($);
    
    logger().debug('Parsed document', { title, type, contentLength: content.length });
    
    return {
      title,
      content,
      type,
      sections,
    };
  }
  
  /**
   * ファイルパスからドキュメントタイプを判定
   */
  private detectDocumentType(filePath: string): 'manual' | 'script-reference' {
    if (filePath.includes('Manual/') || filePath.includes('/Manual/')) {
      return 'manual';
    }
    if (filePath.includes('ScriptReference/') || filePath.includes('/ScriptReference/')) {
      return 'script-reference';
    }
    
    // デフォルトはマニュアル
    return 'manual';
  }
  
  /**
   * タイトルを抽出
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    // 複数のセレクタを試行
    let title = $('h1').first().text().trim();
    
    if (!title) {
      title = $('title').text().trim();
    }
    
    if (!title) {
      title = $('.heading').first().text().trim();
    }
    
    // Unity ドキュメントのサフィックスを削除（安全な正規表現使用）
    title = title.replace(/\s*-\s*Unity\s*\d+\.\d+.*$/, '');
    title = title.replace(/\s*\|\s*Unity\s*Documentation.*$/, '');
    
    // HTML エンティティをデコード
    title = title.replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'");
    
    return title || 'Untitled';
  }
  
  /**
   * コンテンツを抽出（検索用テキスト）
   */
  private extractContent($: cheerio.CheerioAPI): string {
    // スクリプトとスタイルを削除
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('.toolbar').remove();
    $('.sidebar').remove();
    
    // メインコンテンツを探す
    let content = '';
    
    // Unity ドキュメントの一般的なコンテンツコンテナ
    const containers = [
      '.content',
      '.section',
      '#content',
      'article',
      'main',
      '.documentation-content',
      '.reference-content',
    ];
    
    for (const selector of containers) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }
    
    // コンテナが見つからない場合は body 全体
    if (!content) {
      content = $('body').text();
    }
    
    // テキストをクリーンアップ（安全な処理）
    content = content
      .replace(/\s+/g, ' ')  // 複数の空白を単一スペースに
      .replace(/\n\s*\n/g, '\n')  // 複数の改行を単一改行に
      .replace(/[\r\n\t]+/g, ' ')  // 制御文字を空白に置換
      .trim();
    
    // HTML エンティティをデコード
    content = content.replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/&amp;/g, '&')
                     .replace(/&quot;/g, '"')
                     .replace(/&#39;/g, "'")
                     .replace(/&nbsp;/g, ' ');
    
    return content;
  }
  
  /**
   * セクションを抽出
   */
  private extractSections($: cheerio.CheerioAPI): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    
    // h2, h3 タグをセクションの区切りとして使用
    $('h2, h3').each((_index, element) => {
      const heading = $(element);
      const title = heading.text().trim();
      
      if (title) {
        // 次の見出しまでの内容を取得
        let content = '';
        let current = heading.next();
        
        while (current.length > 0 && !current.is('h2, h3')) {
          content += current.text() + ' ';
          current = current.next();
        }
        
        content = content.trim();
        
        if (content) {
          sections.push({ title, content });
        }
      }
    });
    
    return sections;
  }
  
  /**
   * コードブロックを抽出
   */
  public extractCodeBlocks($: cheerio.CheerioAPI): string[] {
    const codeBlocks: string[] = [];
    
    $('pre code, .code-block, .highlight').each((_index, element) => {
      const code = $(element).text().trim();
      if (code) {
        codeBlocks.push(code);
      }
    });
    
    return codeBlocks;
  }
}
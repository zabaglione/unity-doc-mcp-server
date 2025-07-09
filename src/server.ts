#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { logger } from './utils/logger.js';
import { DocumentSearch } from './search/index.js';
import { HtmlParser } from './parser/index.js';
import { DatabaseConnection } from './database/connection.js';
import { PackageDocumentationDownloader } from './downloader/package-downloader.js';
import * as cheerio from 'cheerio';

// セクション情報の型定義
interface DocumentSection {
  id: string;
  title: string;
  level: number;
  start: number;
  end: number;
  content: string;
}

// HTMLからセクションを抽出する関数
function extractSections(html: string): DocumentSection[] {
  const $ = cheerio.load(html);
  const sections: DocumentSection[] = [];
  
  // 見出しを抽出
  const headings = $('h1, h2, h3, h4, h5, h6').toArray();
  
  headings.forEach((heading, index) => {
    const $heading = $(heading);
    const level = parseInt(heading.tagName.substring(1));
    const title = $heading.text().trim();
    const id = `section-${index}`;
    
    // 次の見出しまでのコンテンツを抽出
    let nextHeading = null;
    for (let i = index + 1; i < headings.length; i++) {
      const nextLevel = parseInt(headings[i].tagName.substring(1));
      if (nextLevel <= level) {
        nextHeading = headings[i];
        break;
      }
    }
    
    // セクションのコンテンツを抽出
    let sectionContent = title + '\n\n';
    let current = $heading.next();
    
    while (current.length > 0 && (!nextHeading || !current.is(nextHeading))) {
      if (current.is('h1, h2, h3, h4, h5, h6')) {
        break;
      }
      const currentText = current.text().trim();
      if (currentText) {
        sectionContent += currentText + '\n';
      }
      current = current.next();
    }
    
    sections.push({
      id,
      title,
      level,
      start: 0, // 実際の位置は後で計算
      end: 0,
      content: sectionContent.trim()
    });
  });
  
  return sections;
}

// MCPサーバーインスタンスを作成
const server = new Server(
  {
    name: 'unity-docs',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Unity ドキュメント検索ツール
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_unity_docs',
        description: 'Search Unity 6 documentation for information about Unity features, APIs, and components',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "Rigidbody", "Input System", "particle system")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
              default: 10,
            },
            type: {
              type: 'string',
              enum: ['all', 'manual', 'script-reference', 'package-docs'],
              description: 'Type of documentation to search (default: all)',
              default: 'all',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_unity_doc',
        description: 'Read a specific Unity documentation page by its path with optional pagination',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the documentation file (e.g., "Manual/RigidbodiesOverview.html")',
            },
            offset: {
              type: 'number',
              description: 'Character offset to start reading from (default: 0)',
              default: 0,
            },
            limit: {
              type: 'number',
              description: 'Maximum number of characters to return (default: 2000)',
              default: 2000,
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_unity_doc_sections',
        description: 'List all sections in a Unity documentation page',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the documentation file (e.g., "Manual/RigidbodiesOverview.html")',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'read_unity_doc_section',
        description: 'Read a specific section from a Unity documentation page',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the documentation file (e.g., "Manual/RigidbodiesOverview.html")',
            },
            section_id: {
              type: 'string',
              description: 'ID of the section to read (from list_unity_doc_sections)',
            },
          },
          required: ['path', 'section_id'],
        },
      },
      {
        name: 'get_unity_version_info',
        description: 'Get information about the Unity documentation version currently available',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'list_unity_packages',
        description: 'List available Unity package documentation',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'download_unity_package_docs',
        description: 'Download Unity package documentation for offline access',
        inputSchema: {
          type: 'object',
          properties: {
            packageName: {
              type: 'string',
              description: 'Package name (e.g., "com.unity.entities")',
            },
          },
          required: ['packageName'],
        },
      },
    ],
  };
});

// ツール実行ハンドラー
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'search_unity_docs') {
      const { query, limit = 10, type = 'all' } = args as any;
      
      logger().info('Searching Unity docs', { query, limit, type });
      
      // ドキュメント検索を実行
      const search = new DocumentSearch();
      const results = await search.search({
        query,
        limit,
        type: type === 'all' ? 'all' : type,
      });
      
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No results found for "${query}"`,
            },
          ],
        };
      }
      
      // バージョン情報を取得
      const dbConnection = DatabaseConnection.getInstance();
      const db = dbConnection.getDatabase();
      let unityVersion = '6000.1'; // デフォルト値
      
      try {
        const versionResult = db.prepare('SELECT value FROM version_info WHERE key = ?').get('unity_version') as { value: string } | undefined;
        if (versionResult) {
          unityVersion = versionResult.value;
        }
      } catch (error) {
        // エラーの場合はデフォルト値を使用
        logger().warn('Could not retrieve Unity version from database', { error });
      }
      
      // 結果をフォーマット
      let response = `Found ${results.length} results for "${query}" (Unity ${unityVersion}):\n\n`;
      
      results.forEach((result, index) => {
        response += `${index + 1}. **${result.title}** (${result.type})\n`;
        response += `   Path: ${result.filePath}\n`;
        if (result.packageName) {
          response += `   Package: ${result.packageName} ${result.packageVersion || ''}\n`;
        }
        response += `   ${result.snippet}\n\n`;
      });
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'read_unity_doc') {
      const { path, offset = 0, limit = 2000 } = args as any;
      
      logger().info('Reading Unity doc', { path, offset, limit });
      
      // バージョン情報を取得
      const dbConnection = DatabaseConnection.getInstance();
      const db = dbConnection.getDatabase();
      let unityVersion = '6000.1'; // デフォルト値
      
      try {
        const versionResult = db.prepare('SELECT value FROM version_info WHERE key = ?').get('unity_version') as { value: string } | undefined;
        if (versionResult) {
          unityVersion = versionResult.value;
        }
      } catch (error) {
        logger().warn('Could not retrieve Unity version from database', { error });
      }
      
      // データベースからドキュメントを取得
      const search = new DocumentSearch();
      const doc = await search.getDocumentByPath(path);
      
      if (!doc) {
        // ファイルシステムから直接読み込みを試みる
        const docPath = join(process.cwd(), 'data', 'extracted', 'unity-6000.1', path);
        
        if (!existsSync(docPath)) {
          return {
            content: [
              {
                type: 'text',
                text: `Documentation file not found: ${path}`,
              },
            ],
          };
        }
        
        // HTMLを読み込んでパース
        const html = await readFile(docPath, 'utf-8');
        const parser = new HtmlParser();
        const parsed = parser.parse(html, path);
        
        let response = `# ${parsed.title}\n\n`;
        response += `**Type:** ${parsed.type}\n`;
        response += `**Unity Version:** ${unityVersion}\n\n`;
        
        // オフセットとリミットを適用
        const contentChunk = parsed.content.substring(offset, offset + limit);
        response += contentChunk;
        
        const totalLength = parsed.content.length;
        const hasMore = (offset + limit) < totalLength;
        
        if (hasMore) {
          response += '\n\n... (content truncated)';
          response += `\n\n**Pagination Info:**`;
          response += `\n- Total length: ${totalLength} characters`;
          response += `\n- Current position: ${offset}-${offset + limit}`;
          response += `\n- Next offset: ${offset + limit}`;
        } else {
          response += `\n\n**Complete content shown** (${totalLength} characters)`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }
      
      // データベースから取得したドキュメントを表示
      const $ = cheerio.load(doc.html);
      const parser = new HtmlParser();
      
      // コードブロックを抽出
      const codeBlocks = parser.extractCodeBlocks($);
      
      let response = `# ${doc.title}\n\n`;
      response += `**Type:** ${doc.type}\n`;
      response += `**Unity Version:** ${unityVersion}\n`;
      response += `**Path:** ${doc.file_path}\n\n`;
      
      // オフセットとリミットを適用してコンテンツを表示
      const contentChunk = doc.content.substring(offset, offset + limit);
      response += contentChunk;
      
      const totalLength = doc.content.length;
      const hasMore = (offset + limit) < totalLength;
      
      if (hasMore) {
        response += '\n\n... (content truncated)';
        response += `\n\n**Pagination Info:**`;
        response += `\n- Total length: ${totalLength} characters`;
        response += `\n- Current position: ${offset}-${offset + limit}`;
        response += `\n- Next offset: ${offset + limit}`;
      } else {
        response += `\n\n**Complete content shown** (${totalLength} characters)`;
      }
      
      // コードブロックがあれば表示
      if (codeBlocks.length > 0) {
        response += '\n\n## Code Examples:\n\n';
        codeBlocks.slice(0, 3).forEach((code) => {
          response += `\`\`\`csharp\n${code}\n\`\`\`\n\n`;
        });
      }
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'list_unity_doc_sections') {
      const { path } = args as any;
      
      logger().info('Listing Unity doc sections', { path });
      
      // バージョン情報を取得
      const dbConnection = DatabaseConnection.getInstance();
      const db = dbConnection.getDatabase();
      let unityVersion = '6000.1'; // デフォルト値
      
      try {
        const versionResult = db.prepare('SELECT value FROM version_info WHERE key = ?').get('unity_version') as { value: string } | undefined;
        if (versionResult) {
          unityVersion = versionResult.value;
        }
      } catch (error) {
        logger().warn('Could not retrieve Unity version from database', { error });
      }
      
      // データベースからドキュメントを取得
      const search = new DocumentSearch();
      const doc = await search.getDocumentByPath(path);
      
      if (!doc) {
        return {
          content: [
            {
              type: 'text',
              text: `Documentation file not found: ${path}`,
            },
          ],
        };
      }
      
      // セクションを抽出
      const sections = extractSections(doc.html);
      
      let response = `# Sections in ${doc.title}\n\n`;
      response += `**Unity Version:** ${unityVersion}\n`;
      response += `**Path:** ${path}\n`;
      response += `**Total sections:** ${sections.length}\n\n`;
      
      sections.forEach((section, index) => {
        const indent = '  '.repeat(section.level - 1);
        response += `${index + 1}. ${indent}**${section.title}** (Level ${section.level})\n`;
        response += `   ${indent}ID: \`${section.id}\`\n`;
        response += `   ${indent}Content length: ${section.content.length} characters\n\n`;
      });
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'read_unity_doc_section') {
      const { path, section_id } = args as any;
      
      logger().info('Reading Unity doc section', { path, section_id });
      
      // バージョン情報を取得
      const dbConnection = DatabaseConnection.getInstance();
      const db = dbConnection.getDatabase();
      let unityVersion = '6000.1'; // デフォルト値
      
      try {
        const versionResult = db.prepare('SELECT value FROM version_info WHERE key = ?').get('unity_version') as { value: string } | undefined;
        if (versionResult) {
          unityVersion = versionResult.value;
        }
      } catch (error) {
        logger().warn('Could not retrieve Unity version from database', { error });
      }
      
      // データベースからドキュメントを取得
      const search = new DocumentSearch();
      const doc = await search.getDocumentByPath(path);
      
      if (!doc) {
        return {
          content: [
            {
              type: 'text',
              text: `Documentation file not found: ${path}`,
            },
          ],
        };
      }
      
      // セクションを抽出
      const sections = extractSections(doc.html);
      const targetSection = sections.find(s => s.id === section_id);
      
      if (!targetSection) {
        return {
          content: [
            {
              type: 'text',
              text: `Section not found: ${section_id}. Available sections: ${sections.map(s => s.id).join(', ')}`,
            },
          ],
        };
      }
      
      let response = `# ${targetSection.title}\n\n`;
      response += `**Document:** ${doc.title}\n`;
      response += `**Unity Version:** ${unityVersion}\n`;
      response += `**Path:** ${path}\n`;
      response += `**Section ID:** ${section_id}\n`;
      response += `**Level:** ${targetSection.level}\n\n`;
      response += `---\n\n`;
      response += targetSection.content;
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'get_unity_version_info') {
      logger().info('Getting Unity version info');
      
      // データベースから統計情報を取得
      const dbConnection = DatabaseConnection.getInstance();
      const db = dbConnection.getDatabase();
      
      // バージョン情報の取得
      const versionInfo = {
        unityVersion: '6000.1', // 現在対応しているUnityバージョン
        releaseDate: '2024-11-20', // Unity 6のリリース日
        documentCount: 0,
        manualPages: 0,
        scriptReferencePages: 0,
        lastUpdated: new Date().toISOString(),
        databaseSize: 0,
      };
      
      try {
        // ドキュメント数の取得
        const totalDocs = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
        versionInfo.documentCount = totalDocs.count;
        
        const manualDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE type = ?').get('manual') as { count: number };
        versionInfo.manualPages = manualDocs.count;
        
        const scriptDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE type = ?').get('script-reference') as { count: number };
        versionInfo.scriptReferencePages = scriptDocs.count;
        
        // データベースサイズの取得
        const pageCount = db.prepare('PRAGMA page_count').get() as { page_count: number };
        const pageSize = db.prepare('PRAGMA page_size').get() as { page_size: number };
        versionInfo.databaseSize = pageCount.page_count * pageSize.page_size;
        
        // 最終更新時刻の取得
        const lastDoc = db.prepare('SELECT MAX(updated_at) as last_updated FROM documents').get() as { last_updated: string };
        if (lastDoc.last_updated) {
          versionInfo.lastUpdated = lastDoc.last_updated;
        }
      } catch (error) {
        logger().warn('Could not retrieve complete version info', { error });
      }
      
      let response = `# Unity Documentation Version Information\n\n`;
      response += `**Unity Version:** ${versionInfo.unityVersion}\n`;
      response += `**Release Date:** ${versionInfo.releaseDate}\n`;
      response += `**Total Documents:** ${versionInfo.documentCount.toLocaleString()}\n`;
      response += `**Manual Pages:** ${versionInfo.manualPages.toLocaleString()}\n`;
      response += `**Script Reference Pages:** ${versionInfo.scriptReferencePages.toLocaleString()}\n`;
      response += `**Database Size:** ${(versionInfo.databaseSize / 1024 / 1024).toFixed(2)} MB\n`;
      response += `**Last Updated:** ${new Date(versionInfo.lastUpdated).toLocaleString()}\n\n`;
      
      response += `## Version Details\n\n`;
      response += `This MCP server provides offline access to Unity 6 (6000.1) documentation.\n`;
      response += `The documentation includes:\n`;
      response += `- Unity Manual: Comprehensive guides and tutorials\n`;
      response += `- Script Reference: Complete API documentation\n`;
      response += `- Full-text search with special character support\n`;
      response += `- Offline operation with SQLite FTS5\n\n`;
      
      response += `## Search Capabilities\n\n`;
      response += `- Query sanitization for special characters (dots, brackets, etc.)\n`;
      response += `- HTML entity decoding for proper text display\n`;
      response += `- Cross-platform file path handling\n`;
      response += `- Pagination support for large documents\n`;
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'list_unity_packages') {
      logger().info('Listing Unity packages');
      
      const downloader = new PackageDocumentationDownloader();
      const packages = downloader.getAvailablePackages();
      
      // データベースから既存のパッケージドキュメント数を取得
      const dbConnection = DatabaseConnection.getInstance();
      const db = dbConnection.getDatabase();
      
      let response = `# Available Unity Package Documentation\n\n`;
      response += `Total available packages: ${packages.length}\n\n`;
      
      for (const pkg of packages) {
        response += `## ${pkg.displayName}\n`;
        response += `- **Package:** ${pkg.name}\n`;
        response += `- **Version:** ${pkg.version}\n`;
        
        // このパッケージがダウンロード済みかチェック
        const docsPath = downloader.getPackageDocumentationPath(pkg.name);
        if (docsPath) {
          response += `- **Status:** ✅ Downloaded\n`;
          
          // インデックス済みドキュメント数を取得
          try {
            const docCount = db.prepare(
              'SELECT COUNT(*) as count FROM documents WHERE package_name = ?'
            ).get(pkg.name) as { count: number };
            
            if (docCount.count > 0) {
              response += `- **Indexed documents:** ${docCount.count}\n`;
            } else {
              response += `- **Indexed documents:** 0 (run \`index-package-docs\` to index)\n`;
            }
          } catch (error) {
            // エラーは無視
          }
        } else {
          response += `- **Status:** ❌ Not downloaded\n`;
          response += `- **Download:** Use \`download_unity_package_docs\` tool\n`;
        }
        
        response += `- **Documentation URL:** ${pkg.documentation.url || 'N/A'}\n\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'download_unity_package_docs') {
      const { packageName } = args as any;
      
      logger().info('Downloading Unity package docs', { packageName });
      
      const downloader = new PackageDocumentationDownloader();
      const packageInfo = downloader.getPackageInfo(packageName);
      
      if (!packageInfo) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown package: ${packageName}\n\nUse \`list_unity_packages\` to see available packages.`,
            },
          ],
        };
      }
      
      // 既にダウンロード済みかチェック
      const existingPath = downloader.getPackageDocumentationPath(packageName);
      if (existingPath) {
        return {
          content: [
            {
              type: 'text',
              text: `Package documentation already downloaded: ${packageName}@${packageInfo.version}\n\nPath: ${existingPath}\n\nNext step: Run the indexing process to make it searchable.`,
            },
          ],
        };
      }
      
      try {
        // ダウンロードを実行
        const extractPath = await downloader.downloadPackageDocumentation(packageName);
        
        let response = `# Package Documentation Downloaded Successfully\n\n`;
        response += `**Package:** ${packageInfo.displayName}\n`;
        response += `**Version:** ${packageInfo.version}\n`;
        response += `**Path:** ${extractPath}\n\n`;
        response += `## Next Steps\n\n`;
        response += `The documentation has been downloaded but needs to be indexed for searching.\n\n`;
        response += `To index the documentation, run:\n`;
        response += `\`\`\`bash\nnpm run index-package-docs ${packageName}\n\`\`\`\n\n`;
        response += `After indexing, you can search package documentation using:\n`;
        response += `- \`search_unity_docs\` with \`type="package-docs"\`\n`;
        response += `- Or search all documentation types with \`type="all"\`\n`;
        
        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      } catch (error) {
        logger().error('Failed to download package documentation', { packageName, error });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to download package documentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    logger().error('Tool execution failed', { name, error });
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
});

// リソース一覧（利用可能なドキュメント）
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'unity://docs/manual',
        name: 'Unity Manual',
        description: 'Unity 6 user manual and guides',
        mimeType: 'text/html',
      },
      {
        uri: 'unity://docs/script-reference',
        name: 'Unity Script Reference',
        description: 'Unity 6 API documentation',
        mimeType: 'text/html',
      },
    ],
  };
});

// リソース読み込み
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  try {
    if (uri === 'unity://docs/manual') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Unity Manual - Available sections:\n- Getting Started\n- Graphics\n- Physics\n- Scripting\n- UI\n- Animation\n- Audio\n- and more...',
          },
        ],
      };
    }
    
    if (uri === 'unity://docs/script-reference') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Unity Script Reference - Available namespaces:\n- UnityEngine\n- UnityEngine.UI\n- UnityEngine.Rendering\n- UnityEngine.Physics\n- and more...',
          },
        ],
      };
    }
    
    throw new Error(`Unknown resource: ${uri}`);
  } catch (error) {
    logger().error('Resource read failed', { uri, error });
    throw error;
  }
});

// サーバー起動
async function main() {
  // MCPサーバーとして動作する場合、ログ出力がJSON-RPCを妨げる可能性があるため
  // 環境変数で制御
  if (process.env.MCP_MODE !== 'debug') {
    // ロガーを無効化またはファイル出力に
    process.env.LOG_LEVEL = 'error';
  }
  
  // Unity ドキュメントの存在確認
  const docsPath = join(process.cwd(), 'data', 'extracted', 'unity-6000.1');
  if (!existsSync(docsPath)) {
    // MCPモードでは標準出力にログを出さない
    if (process.env.MCP_MODE === 'debug') {
      logger().warn('Unity documentation not found. Please run: npm run download-docs 6000.1');
    }
  }
  
  // データベースを初期化
  try {
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initialize();
    if (process.env.MCP_MODE === 'debug') {
      logger().info('Database initialized');
    }
  } catch (error) {
    if (process.env.MCP_MODE === 'debug') {
      logger().error('Failed to initialize database', { error });
    }
    // エラーでも継続
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  if (process.env.MCP_MODE === 'debug') {
    logger().info('Unity Documentation MCP Server is running');
  }
}

main().catch((error) => {
  logger().error('Server startup failed', { error });
  process.exit(1);
});
# Unity Documentation MCP Server

Unity公式ドキュメント（Unity 6）をModel Context Protocol経由で提供するMCPサーバー。

## 必要条件

- Node.js 18以上（推奨: v20.10.0）
- npm または yarn

## 機能

- Unity 6 (6000.x) 公式ZIPドキュメントのダウンロード・解析
- SQLite FTS5による高速全文検索
- MCPプロトコル経由でのドキュメント検索
- メモリキャッシュによる高速レスポンス

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Unity ドキュメントのダウンロード

```bash
npm run download-docs 6000.1
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

## MCP設定

Claude Desktopなどで使用する場合は、以下の設定を追加してください：

```json
{
  "mcpServers": {
    "unity-docs": {
      "command": "node",
      "args": ["dist/server.js"]
    }
  }
}
```

## 開発

### テスト実行

```bash
npm test                # 単体テスト実行
npm run test:watch      # ウォッチモード
npm run test:coverage   # カバレッジレポート生成
```

### ビルド

```bash
npm run build          # TypeScriptのビルド
npm run typecheck      # 型チェックのみ
npm run lint           # ESLintの実行
```

## プロジェクト構成

```
unity-doc-mcp-server/
├── src/
│   ├── server.ts         # MCPサーバーメイン
│   ├── downloader.ts     # Unity ZIPダウンロード
│   ├── parser.ts         # HTMLパーサー
│   ├── database.ts       # SQLiteデータベース
│   └── search.ts         # 検索エンジン
├── data/
│   ├── unity-zips/       # ダウンロードしたZIP
│   ├── extracted/        # 展開したHTML
│   └── unity.db         # SQLiteデータベース
└── tests/
    └── *.test.ts        # テストファイル
```

## ライセンス

MIT
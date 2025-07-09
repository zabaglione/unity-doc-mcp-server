# Unity Documentation MCP Server

Unity 6公式ドキュメントをModel Context Protocol経由で提供するMCPサーバー。Claude Code等のAIアシスタントがUnity開発時に正確なドキュメント情報を参照できるようにします。

## 主な機能

- **Unity 6 (6000.x) 公式ドキュメント**のダウンロード・解析・検索
- **SQLite FTS5による高速全文検索**（特殊文字対応済み）
- **ページネーション対応**で大きなドキュメントも完全取得可能
- **セクション分割機能**でドキュメントを論理的に分割
- **完全オフライン動作**でネットワーク不要
- **堅牢な文字列処理**でHTMLエンティティやエスケープ文字に対応

## 必要条件

- **Node.js 18以上**（推奨: v20.10.0、最大: v22.x）
  - ⚠️ **注意**: Node.js v23以降は互換性問題があります
- **npm 8以上** または yarn
- **macOS, Linux, Windows**（WSL2推奨）
- **空きディスク容量**: 約500MB（Unity ドキュメント + データベース）

## クイックスタート

### 1. 自動セットアップ（推奨）

```bash
# 実行権限を付与
chmod +x setup.sh

# セットアップスクリプトを実行
./setup.sh
```

### 2. 完全セットアップ手順

```bash
# 1. 依存関係のインストール
npm install

# 2. ビルド
npm run build

# 3. データベース初期化
npm run init-db

# 4. Unity ドキュメントのダウンロード（約400MB）
npm run download-docs 6000.1

# 5. ドキュメントのインデックス作成（約4000件、数分かかります）
npm run index-docs

# 6. サーバー起動テスト
npm run dev  # Ctrl+Cで終了
```

## MCPツール

### バージョン情報の確認

**get_unity_version_info**: 現在利用可能なUnity ドキュメントのバージョン情報を取得
- パラメータ: なし
- 戻り値: Unity バージョン、リリース日、ドキュメント数、データベースサイズなど

```bash
# 使用例
get_unity_version_info
```

### 基本検索

**search_unity_docs**: Unity ドキュメントを検索
- `query`: 検索クエリ（例: "Rigidbody", "Input System"）
- `limit`: 結果数（デフォルト: 10）
- `type`: "all" | "manual" | "script-reference"

```bash
# 使用例
search_unity_docs query="Animator component" limit=5
search_unity_docs query="Unity 6000 ECS" type="manual"  # ドット文字も対応
search_unity_docs query="Input System" type="script-reference"
```

### ドキュメント読み取り

**read_unity_doc**: 特定のドキュメントを読む（ページネーション対応）
- `path`: ドキュメントパス（例: "Manual/RigidbodiesOverview.html"）
- `offset`: 開始位置（デフォルト: 0）
- `limit`: 最大文字数（デフォルト: 2000）

```bash
# 使用例
read_unity_doc path="Manual/class-Animator.html" offset=0 limit=2000
```

### セクション分割

**list_unity_doc_sections**: ドキュメントのセクション一覧を取得
- `path`: ドキュメントパス

**read_unity_doc_section**: 特定のセクションを読む
- `path`: ドキュメントパス
- `section_id`: セクションID（list_unity_doc_sectionsから取得）

```bash
# 使用例
list_unity_doc_sections path="Manual/class-Animator.html"
read_unity_doc_section path="Manual/class-Animator.html" section_id="section-2"
```

## 大きなドキュメントの効率的な取得

Unity ドキュメントには長いページが含まれているため、以下の2つのアプローチで効率的にコンテンツを取得できます：

### 1. ページネーション（推奨）

```bash
# 最初の2000文字を取得
read_unity_doc path="Manual/class-Animator.html" offset=0 limit=2000

# 次の2000文字を取得
read_unity_doc path="Manual/class-Animator.html" offset=2000 limit=2000
```

### 2. セクション分割

```bash
# セクション一覧を取得
list_unity_doc_sections path="Manual/class-Animator.html"

# 特定のセクションを読む
read_unity_doc_section path="Manual/class-Animator.html" section_id="section-2"
```

HTMLの見出し構造に基づいて論理的なセクションに分割します。

## MCP設定

Claude Desktopなどで使用する場合は、以下の設定を `~/Library/Application Support/Claude/claude_desktop_config.json` に追加してください：

```json
{
  "mcpServers": {
    "unity-docs": {
      "command": "node",
      "args": ["/絶対パス/unity-doc-mcp-server/dist/server.js"]
    }
  }
}
```

**注意**: `args` のパスはプロジェクトの絶対パスを指定してください。

## 最新の改善点

### v0.1.1の主な改善

1. **バージョン情報の明確化**
   - 新しいツール `get_unity_version_info` を追加
   - 全ての検索結果とドキュメント表示にUnityバージョンを表示
   - データベースにバージョンメタデータを保存

2. **FTS5検索の修正**
   - ドット（.）文字を含むクエリで発生していた構文エラーを修正
   - 「Unity 6.0」「6000.1」などの検索が正常に動作

3. **文字列処理の改善**
   - HTMLエンティティ（&amp;、&lt;など）の適切なデコード
   - エスケープ文字の正規化

4. **クロスプラットフォーム対応**
   - Windows/macOS/Linux でのファイルパス処理を改善
   - 一時ディレクトリの作成をプラットフォーム別に最適化

5. **安全性の向上**
   - 特殊文字を含む検索クエリの安全な処理
   - 不正な文字列の適切なサニタイゼーション

## トラブルシューティング

### Node.jsバージョンエラー

Node.js v23以降を使用している場合、以下のようなエラーが発生する可能性があります：
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

**解決方法**:
1. Node.js v20またはv22を使用する（推奨）
2. nvm/fnmなどのバージョン管理ツールを使用：
   ```bash
   nvm install 20
   nvm use 20
   ```

### download-docsスクリプトエラー

`npm run download-docs`実行時にファイルが見つからないエラーが出る場合：

**解決方法**:
```bash
# スクリプトディレクトリを作成
mkdir -p src/scripts

# セットアップスクリプトを実行してスクリプトを生成
./setup.sh
```

### 検索でドットを含むクエリが動作しない

「Unity 6.0」「Input System 2.0」などの検索でエラーが発生する場合：

**解決方法**:
1. 最新版に更新してください（v0.1.0以降で修正済み）
2. データベースを再作成：
   ```bash
   npm run clean
   npm run setup
   ```

### MCPサーバー接続エラー

Claude Desktopでサーバーが認識されない場合：

1. **絶対パス確認**: `args` のパスが正しいか確認
2. **ビルド確認**: `npm run build` が完了しているか確認
3. **ログ確認**: `~/Library/Logs/Claude/mcp-server-unity-docs.log` を確認
4. **権限確認**: 実行ファイルの権限が正しいか確認

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
│   ├── parser/           # HTMLパーサー（エンティティデコード対応）
│   ├── search/           # 検索エンジン（クエリサニタイゼーション）
│   ├── database/         # SQLiteデータベース
│   ├── utils/            # ユーティリティ（クロスプラットフォーム対応）
│   ├── zip/              # ZIPハンドラー
│   ├── http/             # HTTPダウンローダー
│   └── scripts/          # セットアップスクリプト
├── data/
│   ├── unity-zips/       # ダウンロードしたZIP
│   ├── extracted/        # 展開したHTML
│   └── unity.db         # SQLiteデータベース
├── dist/                 # ビルド結果
└── tests/                # テストファイル（90+テスト）
```

## 技術詳細

- **検索エンジン**: SQLite FTS5（Full-Text Search）
  - 特殊文字（ドット、括弧など）の安全な処理
  - クエリサニタイゼーション機能
- **データベース**: SQLite3 with better-sqlite3
- **HTMLパーサー**: Cheerio
  - HTMLエンティティの適切なデコード
  - 安全な文字列処理
- **プロトコル**: Model Context Protocol (MCP)
- **通信**: JSON-RPC over stdio
- **クロスプラットフォーム**: Windows/macOS/Linux対応

## ライセンス

MIT License

---

Unity Documentation MCP Server - Unity 6公式ドキュメントをAIアシスタントに提供
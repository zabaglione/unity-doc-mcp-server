# Contributing to Unity Documentation MCP Server

Unity Documentation MCP Serverへの貢献をお待ちしています！

## 開発環境のセットアップ

### 必要条件

- Node.js 18以上 (推奨: v20.10.0)
- npm 8以上
- Git

### セットアップ手順

```bash
# 1. リポジトリをフォーク & クローン
git clone https://github.com/yourusername/unity-doc-mcp-server.git
cd unity-doc-mcp-server

# 2. 依存関係のインストール
npm install

# 3. TypeScriptのビルド
npm run build

# 4. データベース初期化
npm run init-db

# 5. テストの実行
npm test
```

## 開発ワークフロー

### ブランチ戦略

- `main`: 安定版（本番環境）
- `develop`: 開発版（新機能の統合）
- `feature/*`: 機能開発ブランチ
- `fix/*`: バグ修正ブランチ

### コミット規則

[Conventional Commits](https://www.conventionalcommits.org/)に従ってください：

```
feat: 新機能の追加
fix: バグ修正
docs: ドキュメントの更新
style: コードフォーマットの変更
refactor: リファクタリング
test: テストの追加・修正
chore: ビルドプロセスやツールの変更
```

例：
```
feat: Add Unity package documentation support
fix: Fix FTS5 search error with dot characters
docs: Update README with new MCP tools
```

## コード品質

### コーディングスタイル

- TypeScript Strict Mode
- ESLint設定に従う
- Prettier（自動フォーマット）

### 実行コマンド

```bash
# リンティング
npm run lint

# 型チェック
npm run typecheck

# テスト
npm test
npm run test:watch  # 監視モード
npm run test:coverage  # カバレッジ

# ビルド
npm run build
```

## 新機能の実装

### 1. パッケージドキュメントのサポート追加

新しいUnityパッケージをサポートする場合：

1. `src/downloader/package-downloader.ts`の`KNOWN_PACKAGES`に追加
2. パッケージ固有のHTMLパース処理が必要な場合は`src/parser/index.ts`を修正
3. テストを追加
4. READMEを更新

### 2. MCPツールの追加

1. `src/server.ts`にツール定義を追加
2. ツールハンドラーを実装
3. 型定義を追加（必要に応じて）
4. テストを追加
5. READMEのMCPツール一覧を更新

## テスト

### テストの種類

- **単体テスト**: 各クラス・関数の動作確認
- **統合テスト**: データベース操作、検索機能など
- **E2Eテスト**: MCP通信のテスト

### テストファイルの場所

```
tests/
├── database.test.ts       # データベース関連
├── search.test.ts        # 検索機能
├── parser.test.ts        # HTMLパーサー
├── server.test.ts        # MCPサーバー
└── integration/          # 統合テスト
```

### テストの実行

```bash
# 全テスト実行
npm test

# 特定のテストファイル
npm test -- database.test.ts

# 監視モード
npm run test:watch

# カバレッジ
npm run test:coverage
```

## プルリクエストの作成

### 事前チェック

1. 全てのテストが通る
2. リンティングエラーがない
3. TypeScriptの型チェックが通る
4. ビルドが成功する

```bash
# 事前チェック一括実行
npm run lint && npm run typecheck && npm test && npm run build
```

### プルリクエストの内容

1. **明確なタイトル**: `feat: Add Unity Input System package support`
2. **詳細な説明**: 
   - 何を変更したか
   - なぜ変更したか
   - 動作確認方法
3. **関連Issue**: `Fixes #123`
4. **破壊的変更**: 必要に応じて記載

## リリースプロセス

1. `develop` → `main` へのマージ
2. バージョン番号の更新（package.json）
3. CHANGELOG.mdの更新
4. GitHubリリースの作成
5. npm公開（メンテナーのみ）

## 質問・議論

- **Issue**: バグ報告、機能要求
- **Discussion**: 技術的な議論、質問
- **Discord**: リアルタイム相談（準備中）

## 行動規範

このプロジェクトは [Contributor Covenant](https://www.contributor-covenant.org/) の行動規範に従います。すべての参加者は相互に尊重し、建設的な議論を心がけてください。

---

貢献いただき、ありがとうございます！🎉
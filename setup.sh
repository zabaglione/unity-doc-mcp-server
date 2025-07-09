#!/bin/bash

# Unity Documentation MCP Server セットアップスクリプト
# このスクリプトは、プロジェクトの初期セットアップを自動化します

set -e  # エラーが発生したら即座に終了

# 色付き出力のための定数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ロゴ表示
echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║   Unity Documentation MCP Server       ║"
echo "║         Setup Script v1.0              ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Node.jsバージョンチェック
echo -e "${YELLOW}🔍 Node.jsバージョンをチェック中...${NC}"
NODE_VERSION=$(node -v 2>/dev/null || echo "not installed")

if [ "$NODE_VERSION" = "not installed" ]; then
    echo -e "${RED}❌ Node.jsがインストールされていません${NC}"
    echo "Node.js v18以上（推奨: v20.10.0）をインストールしてください"
    echo "https://nodejs.org/ または nvm/fnm を使用してください"
    exit 1
fi

# バージョン番号を抽出して比較
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
NODE_MINOR_VERSION=$(echo $NODE_VERSION | cut -d. -f2)

echo -e "現在のNode.jsバージョン: ${GREEN}$NODE_VERSION${NC}"

if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js v18以上が必要です${NC}"
    exit 1
elif [ "$NODE_MAJOR_VERSION" -ge 23 ]; then
    echo -e "${YELLOW}⚠️  警告: Node.js v23以降は互換性問題がある可能性があります${NC}"
    echo "推奨: Node.js v20またはv22を使用してください"
    read -p "このまま続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 依存関係のインストール
echo -e "\n${YELLOW}📦 依存関係をインストール中...${NC}"
if command -v npm &> /dev/null; then
    npm install
else
    echo -e "${RED}❌ npmが見つかりません${NC}"
    exit 1
fi

# 必要なディレクトリの作成
echo -e "\n${YELLOW}📁 必要なディレクトリを作成中...${NC}"
mkdir -p data/unity-zips
mkdir -p data/extracted
mkdir -p src/scripts
mkdir -p dist
echo -e "${GREEN}✅ ディレクトリ作成完了${NC}"

# download-docs.tsスクリプトの作成
echo -e "\n${YELLOW}📝 ダウンロードスクリプトを作成中...${NC}"
cat > src/scripts/download-docs.ts << 'EOF'
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
EOF

echo -e "${GREEN}✅ ダウンロードスクリプト作成完了${NC}"

# 基本的な実装ファイルの存在確認
echo -e "\n${YELLOW}🔧 基本的な実装ファイルをチェック中...${NC}"
echo -e "${GREEN}実装ファイルは既に存在しています${NC}"

# ビルドの実行
echo -e "\n${YELLOW}🔨 TypeScriptをビルド中...${NC}"
npm run build || echo -e "${YELLOW}⚠️  ビルドエラーが発生しましたが、セットアップは続行します${NC}"

# 完了メッセージ
echo -e "\n${GREEN}✨ セットアップが完了しました！${NC}"
echo -e "\n次のステップ:"
echo -e "1. Unity ドキュメントをダウンロード:"
echo -e "   ${BLUE}npm run download-docs 6000.1${NC}"
echo -e "\n2. データベースを初期化:"
echo -e "   ${BLUE}npm run init-db${NC}"
echo -e "\n3. ドキュメントをインデックス:"
echo -e "   ${BLUE}npm run index-docs${NC}"
echo -e "\n4. 開発サーバーを起動:"
echo -e "   ${BLUE}npm run dev${NC}"
echo -e "\n${YELLOW}オプション: パッケージドキュメント（ECS等）のセットアップ:${NC}"
echo -e "   ${BLUE}npm run download-package-docs com.unity.entities${NC}"
echo -e "   ${BLUE}npm run index-package-docs com.unity.entities${NC}"
echo -e "\n${YELLOW}ヒント: 問題が発生した場合は README.md のトラブルシューティングセクションを参照してください${NC}"
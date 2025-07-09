import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESモジュールでの__dirnameの代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// プロジェクトのルートディレクトリ
export const PROJECT_ROOT = join(__dirname, '..', '..');

// データディレクトリ
export const DATA_DIR = join(PROJECT_ROOT, 'data');

// ダウンロードディレクトリ
export const DOWNLOADS_DIR = join(DATA_DIR, 'unity-zips');

// 展開ディレクトリ
export const EXTRACTED_DIR = join(DATA_DIR, 'extracted');

// パッケージディレクトリ
export const PACKAGES_DIR = join(DATA_DIR, 'unity-packages');

// データベースファイル
export const DATABASE_PATH = join(DATA_DIR, 'unity.db');
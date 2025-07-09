export const SCHEMA_VERSION = 1;

export const TABLES = {
  documents: 'documents',
  documents_fts: 'documents_fts',
  schema_version: 'schema_version',
  version_info: 'version_info',
} as const;

export const CREATE_TABLES_SQL = `
-- Schema version table
CREATE TABLE IF NOT EXISTS ${TABLES.schema_version} (
  version INTEGER PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Main documents table
CREATE TABLE IF NOT EXISTS ${TABLES.documents} (
  id TEXT PRIMARY KEY,
  unity_version TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('manual', 'script-reference')),
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_unity_version ON ${TABLES.documents}(unity_version);
CREATE INDEX IF NOT EXISTS idx_documents_type ON ${TABLES.documents}(type);
CREATE INDEX IF NOT EXISTS idx_documents_title ON ${TABLES.documents}(title);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS ${TABLES.documents_fts} USING fts5(
  title,
  content,
  content=${TABLES.documents},
  tokenize='porter ascii'
);

-- Trigger to keep FTS in sync with main table
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON ${TABLES.documents} BEGIN
  INSERT INTO ${TABLES.documents_fts}(rowid, title, content)
  VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON ${TABLES.documents} BEGIN
  DELETE FROM ${TABLES.documents_fts} WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON ${TABLES.documents} BEGIN
  UPDATE ${TABLES.documents_fts}
  SET title = new.title,
      content = new.content
  WHERE rowid = new.rowid;
END;

-- Update timestamp trigger
CREATE TRIGGER IF NOT EXISTS documents_update_timestamp 
AFTER UPDATE ON ${TABLES.documents}
BEGIN
  UPDATE ${TABLES.documents} 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE rowid = new.rowid;
END;

-- Version information table
CREATE TABLE IF NOT EXISTS ${TABLES.version_info} (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Insert default version info
INSERT OR IGNORE INTO ${TABLES.version_info} (key, value) VALUES 
  ('unity_version', '6000.1'),
  ('release_date', '2024-11-20'),
  ('documentation_source', 'https://docs.unity3d.com/6000.1/Documentation/'),
  ('last_download', '');

-- Update timestamp trigger for version_info
CREATE TRIGGER IF NOT EXISTS version_info_update_timestamp 
AFTER UPDATE ON ${TABLES.version_info}
BEGIN
  UPDATE ${TABLES.version_info} 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE key = NEW.key;
END;
`;

export interface DocumentRow {
  id: string;
  unity_version: string;
  type: 'manual' | 'script-reference';
  title: string;
  file_path: string;
  url?: string;
  content: string;
  html: string;
  created_at: string;
  updated_at: string;
}
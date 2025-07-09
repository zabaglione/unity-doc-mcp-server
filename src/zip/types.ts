export interface ZipEntry {
  path: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  lastModified: Date;
}

export interface ZipExtractOptions {
  outputDir: string;
  overwrite?: boolean;
  filter?: (entry: ZipEntry) => boolean;
}

export interface ZipListOptions {
  filter?: (entry: ZipEntry) => boolean;
}

export interface ZipHandler {
  extractAll(options: ZipExtractOptions): Promise<void>;
  extractFile(filePath: string, outputPath: string): Promise<void>;
  listEntries(options?: ZipListOptions): Promise<ZipEntry[]>;
  hasEntry(filePath: string): Promise<boolean>;
  readFileAsString(filePath: string): Promise<string>;
  readFileAsBuffer(filePath: string): Promise<Buffer>;
  close(): Promise<void>;
}
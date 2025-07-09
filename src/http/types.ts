export interface DownloadOptions {
  url: string;
  outputPath: string;
  headers?: Record<string, string>;
  timeout?: number;
  onProgress?: (progress: DownloadProgress) => void;
  resumable?: boolean;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
  estimatedTimeRemaining: number;
}

export interface DownloadResult {
  filePath: string;
  size: number;
  duration: number;
  averageSpeed: number;
}

export interface HttpDownloader {
  download(options: DownloadOptions): Promise<DownloadResult>;
  downloadToBuffer(url: string, options?: Partial<DownloadOptions>): Promise<Buffer>;
  getContentLength(url: string): Promise<number>;
  cancel(): void;
}
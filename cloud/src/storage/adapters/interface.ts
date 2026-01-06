/**
 * Storage adapter interface
 *
 * Defines the contract for storage implementations (S3, MinIO, local, etc.)
 */

import type {
  UploadOptions,
  UploadResult,
  DownloadResult,
  DeleteResult,
  SignedUrlOptions,
  ListResult,
} from '../types';

/**
 * Storage adapter interface
 *
 * All storage implementations must implement this interface.
 */
export interface StorageAdapter {
  /** Adapter name for identification */
  readonly name: string;

  /**
   * Upload a file to storage
   */
  upload(options: UploadOptions): Promise<UploadResult>;

  /**
   * Download a file from storage
   */
  download(key: string): Promise<DownloadResult>;

  /**
   * Delete one or more files from storage
   */
  delete(keys: string | string[]): Promise<DeleteResult>;

  /**
   * Generate a signed URL for temporary access
   */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;

  /**
   * Check if a file exists in storage
   */
  exists?(key: string): Promise<boolean>;

  /**
   * List files with a given prefix
   */
  list?(prefix: string, options?: { maxKeys?: number; continuationToken?: string }): Promise<ListResult>;
}

/**
 * Storage Client
 *
 * High-level storage client that wraps a storage adapter and provides
 * convenient methods for common operations.
 */

import crypto from 'crypto';
import { getPublicUrl, getCachedCredentials, hasCredentials } from '../config/loader';
import { detectEnvironment } from '../lib/env';
import { createLogger } from '../lib/logger';
import { validateBuffer, validateString, validateUrl, validateBase64 } from '../lib/validators';
import type { StorageAdapter } from './adapters/interface';

const log = createLogger('StorageClient');
import type {
  UploadOptions,
  UploadResult,
  DownloadResult,
  DeleteResult,
  SignedUrlOptions,
  ListResult,
  ConfigCheckResult,
  SimpleUploadOptions,
} from './types';

export class StorageClient {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /**
   * Generate a unique key for uploaded files
   */
  private generateKey(filename: string, folder?: string): string {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '-');
    const key = `${timestamp}-${randomId}-${sanitizedFilename}`;
    return folder ? `${folder}/${key}` : key;
  }

  /**
   * Detect content type from filename
   */
  private detectContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      json: 'application/json',
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    };
    return types[ext || ''] || 'application/octet-stream';
  }

  /**
   * Upload a buffer to storage
   */
  async upload(options: UploadOptions): Promise<UploadResult> {
    return this.adapter.upload(options);
  }

  /**
   * Simple upload with buffer and filename
   */
  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    options: SimpleUploadOptions = {}
  ): Promise<UploadResult> {
    validateBuffer(buffer);
    validateString(filename, 'filename');

    const key = this.generateKey(filename, options.folder);
    const contentType = options.contentType || this.detectContentType(filename);

    log.debug('uploadBuffer called', { filename, folder: options.folder, size: buffer.length });

    return this.adapter.upload({
      buffer,
      key,
      contentType,
      metadata: options.metadata,
      acl: options.acl,
    });
  }

  /**
   * Upload a base64-encoded string
   */
  async uploadBase64(
    base64Data: string,
    filename: string,
    options: SimpleUploadOptions = {}
  ): Promise<UploadResult> {
    validateBase64(base64Data);
    validateString(filename, 'filename');

    log.debug('uploadBase64 called', { filename, folder: options.folder, dataLength: base64Data.length });

    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    // Try to detect content type from data URL
    let contentType = options.contentType;
    if (!contentType) {
      const matches = base64Data.match(/^data:([^;]+);base64,/);
      contentType = matches?.[1] || this.detectContentType(filename);
    }

    return this.uploadBuffer(buffer, filename, { ...options, contentType });
  }

  /**
   * Upload from a URL
   */
  async uploadFromUrl(
    url: string,
    filename?: string,
    options: SimpleUploadOptions = {}
  ): Promise<UploadResult> {
    validateUrl(url);

    log.debug('uploadFromUrl called', { url, filename, folder: options.folder });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        log.warn('Failed to fetch URL', { url, status: response.status, statusText: response.statusText });
        return {
          success: false,
          url: '',
          key: '',
          bucket: '',
          size: 0,
          error: `Failed to fetch URL: ${response.statusText}`,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = options.contentType || response.headers.get('content-type') || 'application/octet-stream';

      // Generate filename from URL if not provided
      const finalFilename = filename || url.split('/').pop()?.split('?')[0] || 'file';

      log.debug('URL fetched successfully', { url, size: buffer.length, contentType });

      return this.uploadBuffer(buffer, finalFilename, { ...options, contentType });
    } catch (error) {
      log.error('Failed to upload from URL', error instanceof Error ? error : undefined, { url });
      return {
        success: false,
        url: '',
        key: '',
        bucket: '',
        size: 0,
        error: error instanceof Error ? error.message : 'Failed to fetch URL',
      };
    }
  }

  /**
   * Download a file from storage
   */
  async download(key: string): Promise<DownloadResult> {
    return this.adapter.download(key);
  }

  /**
   * Delete a file from storage
   */
  async delete(key: string): Promise<DeleteResult> {
    return this.adapter.delete(key);
  }

  /**
   * Delete multiple files from storage
   */
  async deleteMany(keys: string[]): Promise<DeleteResult> {
    return this.adapter.delete(keys);
  }

  /**
   * Get a signed URL for temporary access
   */
  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    return this.adapter.getSignedUrl(key, options);
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.adapter.exists) {
      // Fallback: try to download head
      try {
        await this.adapter.download(key);
        return true;
      } catch {
        return false;
      }
    }
    return this.adapter.exists(key);
  }

  /**
   * List files with a prefix
   */
  async list(
    prefix: string,
    options?: { maxKeys?: number; continuationToken?: string }
  ): Promise<ListResult> {
    if (!this.adapter.list) {
      throw new Error('List operation not supported by this adapter');
    }
    return this.adapter.list(prefix, options);
  }

  /**
   * Get the public URL for a key
   */
  getPublicUrl(key: string): string {
    return getPublicUrl(key);
  }

  /**
   * Check configuration status
   */
  checkConfig(): ConfigCheckResult {
    const credentials = getCachedCredentials();
    const environment = detectEnvironment();

    if (!credentials) {
      return {
        configured: false,
        environment,
        error: 'Credentials not yet loaded. Call getAwsCredentials() first.',
      };
    }

    return {
      configured: true,
      environment,
      bucket: credentials.bucket,
      region: credentials.region,
    };
  }

  /**
   * Check if storage is configured
   */
  isConfigured(): boolean {
    return hasCredentials();
  }
}

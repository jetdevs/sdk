/**
 * AWS S3 Storage Adapter
 *
 * Implements the StorageAdapter interface for AWS S3.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { AwsCredentials } from '../../config/credentials';
import { UploadError, DownloadError, DeleteError, NotFoundError, StorageError } from '../../lib/errors';
import { createLogger } from '../../lib/logger';
import { validateBuffer, validateKey, validateExpiresIn } from '../../lib/validators';
import type { StorageAdapter } from './interface';
import type {
  UploadOptions,
  UploadResult,
  DownloadResult,
  DeleteResult,
  SignedUrlOptions,
  ListResult,
} from '../types';

const log = createLogger('S3Adapter');

export class S3Adapter implements StorageAdapter {
  readonly name = 's3';

  private client: S3Client;
  private bucket: string;
  private region: string;
  private publicUrl?: string;

  constructor(credentials: AwsCredentials) {
    this.bucket = credentials.bucket;
    this.region = credentials.region;
    this.publicUrl = credentials.publicUrl;

    log.debug('Initializing S3 client', {
      bucket: this.bucket,
      region: this.region,
      hasEndpoint: !!credentials.endpoint,
    });

    this.client = new S3Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
      },
      ...(credentials.endpoint && { endpoint: credentials.endpoint }),
    });

    log.info('S3 client initialized', { bucket: this.bucket, region: this.region });
  }

  /**
   * Get the public URL for an object
   */
  private getObjectUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Upload a file to S3
   */
  async upload(options: UploadOptions): Promise<UploadResult> {
    const { buffer, key, contentType, metadata, acl } = options;

    // Validate inputs
    validateBuffer(buffer);
    validateKey(key);

    log.debug('Starting upload', {
      key,
      size: buffer.length,
      contentType: contentType || 'application/octet-stream',
    });

    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType || 'application/octet-stream',
          Metadata: {
            ...metadata,
            uploadedAt: new Date().toISOString(),
          },
          ...(acl && { ACL: acl }),
        },
      });

      await upload.done();

      const url = this.getObjectUrl(key);

      log.info('Upload successful', { key, url, size: buffer.length });

      return {
        success: true,
        url,
        key,
        bucket: this.bucket,
        size: buffer.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      log.error('Upload failed', error instanceof Error ? error : undefined, { key, size: buffer.length });
      throw new UploadError(message, key, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Download a file from S3
   */
  async download(key: string): Promise<DownloadResult> {
    validateKey(key);

    log.debug('Starting download', { key });

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        log.warn('Download returned empty body', { key });
        throw new NotFoundError(key);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      log.info('Download successful', { key, size: buffer.length, contentType: response.ContentType });

      return {
        success: true,
        buffer,
        contentType: response.ContentType || 'application/octet-stream',
        size: buffer.length,
      };
    } catch (error: unknown) {
      // Handle not found errors
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        log.warn('File not found', { key });
        throw new NotFoundError(key);
      }

      const message = error instanceof Error ? error.message : 'Download failed';
      log.error('Download failed', error instanceof Error ? error : undefined, { key });
      throw new DownloadError(message, key, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Delete one or more files from S3
   */
  async delete(keys: string | string[]): Promise<DeleteResult> {
    const keyArray = Array.isArray(keys) ? keys : [keys];

    if (keyArray.length === 0) {
      log.debug('Delete called with empty keys array');
      return { success: true, deleted: [] };
    }

    // Validate all keys
    keyArray.forEach((key) => validateKey(key));

    log.debug('Starting delete', { keyCount: keyArray.length, keys: keyArray });

    try {
      if (keyArray.length === 1) {
        // Single delete
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: keyArray[0],
          })
        );
        log.info('Delete successful', { key: keyArray[0] });
        return { success: true, deleted: keyArray };
      }

      // Batch delete
      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keyArray.map((key) => ({ Key: key })),
          Quiet: false,
        },
      });

      const response = await this.client.send(command);

      if (response.Errors && response.Errors.length > 0) {
        log.warn('Batch delete had errors', {
          deletedCount: response.Deleted?.length || 0,
          errorCount: response.Errors.length,
          errors: response.Errors.map((e) => ({ key: e.Key, message: e.Message })),
        });
        return {
          success: false,
          deleted: response.Deleted?.map((d) => d.Key || '') || [],
          errors: response.Errors.map((err) => ({
            key: err.Key || '',
            error: err.Message || 'Unknown error',
          })),
        };
      }

      log.info('Batch delete successful', { deletedCount: response.Deleted?.length || keyArray.length });

      return {
        success: true,
        deleted: response.Deleted?.map((d) => d.Key || '') || keyArray,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      log.error('Delete failed', error instanceof Error ? error : undefined, { keys: keyArray });
      throw new DeleteError(message, keyArray, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Generate a signed URL for temporary access
   */
  async getSignedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const { expiresIn = 3600, method = 'GET', contentType } = options;

    validateKey(key);
    validateExpiresIn(expiresIn);

    log.debug('Generating signed URL', { key, method, expiresIn });

    try {
      const command =
        method === 'PUT'
          ? new PutObjectCommand({
              Bucket: this.bucket,
              Key: key,
              ...(contentType && { ContentType: contentType }),
            })
          : new GetObjectCommand({
              Bucket: this.bucket,
              Key: key,
            });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      log.debug('Signed URL generated', { key, method, expiresIn });

      return url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate signed URL';
      log.error('Failed to generate signed URL', error instanceof Error ? error : undefined, { key, method });
      throw new StorageError(message, 'SIGNED_URL_ERROR', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Check if a file exists in S3
   */
  async exists(key: string): Promise<boolean> {
    validateKey(key);

    log.debug('Checking if file exists', { key });

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      log.debug('File exists', { key });
      return true;
    } catch (error) {
      log.debug('File does not exist', { key });
      return false;
    }
  }

  /**
   * List files with a given prefix
   */
  async list(
    prefix: string,
    options: { maxKeys?: number; continuationToken?: string } = {}
  ): Promise<ListResult> {
    const { maxKeys = 1000, continuationToken } = options;

    log.debug('Listing files', { prefix, maxKeys, hasContinuationToken: !!continuationToken });

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ...(continuationToken && { ContinuationToken: continuationToken }),
      });

      const response = await this.client.send(command);

      const result = {
        objects:
          response.Contents?.map((item) => ({
            key: item.Key || '',
            size: item.Size || 0,
            lastModified: item.LastModified,
          })) || [],
        isTruncated: response.IsTruncated || false,
        continuationToken: response.NextContinuationToken,
      };

      log.debug('List successful', {
        prefix,
        objectCount: result.objects.length,
        isTruncated: result.isTruncated,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list files';
      log.error('List failed', error instanceof Error ? error : undefined, { prefix });
      throw new StorageError(message, 'LIST_ERROR', error instanceof Error ? error : undefined);
    }
  }
}

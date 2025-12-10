/**
 * Storage client factory
 *
 * Creates and manages storage client instances.
 * Supports dynamic credential refresh for STS temporary credentials.
 */

import { getAwsCredentials, getCachedCredentials, resetCredentials } from '../config/loader';
import { createLogger } from '../lib/logger';
import { S3Adapter } from './adapters/s3.adapter';
import { StorageClient } from './client';

const log = createLogger('StorageFactory');

let defaultClient: StorageClient | null = null;

/**
 * Check if error is due to expired credentials
 */
function isCredentialsExpiredError(error: unknown, visited = new WeakSet<object>()): boolean {
  if (!error) return false;

  // Prevent infinite loop from circular references
  if (typeof error === 'object' && error !== null) {
    if (visited.has(error)) return false;
    visited.add(error);
  }

  // Check AWS SDK v3 specific Code property
  const awsError = error as { Code?: string; name?: string };
  if (awsError.Code === 'ExpiredToken' || awsError.Code === 'ExpiredTokenException') {
    return true;
  }

  if (!(error instanceof Error)) return false;

  const expiredIndicators = [
    'ExpiredToken',
    'ExpiredTokenException',
    'TokenRefreshRequired',
    'The security token included in the request is expired',
    'The provided token has expired',
    'The provided token is expired',
    'Request has expired',
  ];

  // Check error.name and error.message (case-insensitive)
  const matchesCurrent = expiredIndicators.some(
    (indicator) =>
      error.message.toLowerCase().includes(indicator.toLowerCase()) ||
      error.name.includes(indicator)
  );

  if (matchesCurrent) return true;

  // Recursively check cause chain (pass visited set to prevent cycles)
  const errorWithCause = error as { cause?: unknown };
  if (errorWithCause.cause) {
    return isCredentialsExpiredError(errorWithCause.cause, visited);
  }

  return false;
}

/**
 * Wrapper that auto-refreshes credentials on expiration
 */
async function withCredentialRefresh<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isCredentialsExpiredError(error)) {
      log.warn(`[${operationName}] Credentials expired, refreshing...`);

      // Reset client and credentials cache
      resetStorageClient();
      resetCredentials();

      // Re-fetch credentials and retry
      await getAwsCredentials();
      return await operation();
    }
    throw error;
  }
}

/**
 * Create a new storage client instance (async)
 */
export async function createStorageClient(): Promise<StorageClient> {
  const credentials = await getAwsCredentials();
  const adapter = new S3Adapter(credentials);
  return new StorageClient(adapter);
}

/**
 * Get the default storage client instance (singleton, async)
 *
 * This creates a singleton instance that is reused across calls.
 * Use this for most cases to avoid creating multiple S3 clients.
 */
export async function getStorageClient(): Promise<StorageClient> {
  if (!defaultClient) {
    defaultClient = await createStorageClient();
  }
  return defaultClient;
}

/**
 * Reset the default client (useful for testing or credential refresh)
 */
export function resetStorageClient(): void {
  defaultClient = null;
}

/**
 * Convenience export for quick access
 *
 * Usage:
 * ```ts
 * import { storage } from '@yobolabs/cloud/storage';
 * await storage.uploadBuffer(buffer, 'test.txt');
 * ```
 */
export const storage = {
  /**
   * Upload a buffer with options
   */
  upload: async (...args: Parameters<StorageClient['upload']>) =>
    withCredentialRefresh(async () => (await getStorageClient()).upload(...args), 'upload'),

  /**
   * Upload a buffer with simple options
   */
  uploadBuffer: async (...args: Parameters<StorageClient['uploadBuffer']>) =>
    withCredentialRefresh(
      async () => (await getStorageClient()).uploadBuffer(...args),
      'uploadBuffer'
    ),

  /**
   * Upload base64 encoded data
   */
  uploadBase64: async (...args: Parameters<StorageClient['uploadBase64']>) =>
    withCredentialRefresh(
      async () => (await getStorageClient()).uploadBase64(...args),
      'uploadBase64'
    ),

  /**
   * Upload from URL
   */
  uploadFromUrl: async (...args: Parameters<StorageClient['uploadFromUrl']>) =>
    withCredentialRefresh(
      async () => (await getStorageClient()).uploadFromUrl(...args),
      'uploadFromUrl'
    ),

  /**
   * Download a file
   */
  download: async (...args: Parameters<StorageClient['download']>) =>
    withCredentialRefresh(async () => (await getStorageClient()).download(...args), 'download'),

  /**
   * Delete a file
   */
  delete: async (...args: Parameters<StorageClient['delete']>) =>
    withCredentialRefresh(async () => (await getStorageClient()).delete(...args), 'delete'),

  /**
   * Delete multiple files
   */
  deleteMany: async (...args: Parameters<StorageClient['deleteMany']>) =>
    withCredentialRefresh(
      async () => (await getStorageClient()).deleteMany(...args),
      'deleteMany'
    ),

  /**
   * Get signed URL
   */
  getSignedUrl: async (...args: Parameters<StorageClient['getSignedUrl']>) =>
    withCredentialRefresh(
      async () => (await getStorageClient()).getSignedUrl(...args),
      'getSignedUrl'
    ),

  /**
   * Check if file exists
   */
  exists: async (...args: Parameters<StorageClient['exists']>) =>
    withCredentialRefresh(async () => (await getStorageClient()).exists(...args), 'exists'),

  /**
   * List files
   */
  list: async (...args: Parameters<StorageClient['list']>) =>
    withCredentialRefresh(async () => (await getStorageClient()).list(...args), 'list'),

  /**
   * Get public URL for a key (synchronous, uses cached credentials)
   */
  getPublicUrl: (key: string): string => {
    const creds = getCachedCredentials();
    if (!creds) return '';
    return creds.publicUrl ? `${creds.publicUrl}/${key}` : '';
  },

  /**
   * Check configuration status
   */
  checkConfig: async () => (await getStorageClient()).checkConfig(),

  /**
   * Check if storage is configured (synchronous)
   */
  isConfigured: (): boolean => !!getCachedCredentials(),
};

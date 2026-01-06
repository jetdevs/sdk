/**
 * Configuration loader
 *
 * Fetches credentials from Credentials Service.
 * No fallback - if Credentials Service is unavailable, operation fails.
 */

import { ConfigurationError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { CredentialCache } from '../credentials/cache';
import { getSdkConfig, type AwsCredentials } from './credentials';

const log = createLogger('CredentialsLoader');

/**
 * Global cache to persist across hot reloads in development
 */
const globalForCache = globalThis as unknown as {
  __yobo_credential_cache?: CredentialCache;
  __yobo_cached_credentials?: AwsCredentials;
};

// Use global cache to survive hot reloads
let credentialCache: CredentialCache | null = globalForCache.__yobo_credential_cache ?? null;
let cachedCredentials: AwsCredentials | null = globalForCache.__yobo_cached_credentials ?? null;

/**
 * Get or create credential cache instance
 */
function getCredentialCache(): CredentialCache {
  if (!credentialCache) {
    const config = getSdkConfig();
    credentialCache = new CredentialCache(config.credentialsApiUrl, config.apiKey);
    globalForCache.__yobo_credential_cache = credentialCache;
  }
  return credentialCache;
}

/**
 * Get AWS credentials (from Credentials Service)
 */
export async function getAwsCredentials(): Promise<AwsCredentials> {
  try {
    const cache = getCredentialCache();
    const creds = await cache.getCredentials();

    cachedCredentials = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      bucket: creds.bucket,
      region: creds.region,
      publicUrl: creds.publicUrl,
    };
    globalForCache.__yobo_cached_credentials = cachedCredentials;

    return cachedCredentials;
  } catch (error) {
    log.error(
      'Failed to get credentials from Credentials Service',
      error instanceof Error ? error : undefined,
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );

    throw new ConfigurationError(
      `Failed to get AWS credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get cached credentials synchronously (for getPublicUrl etc.)
 */
export function getCachedCredentials(): AwsCredentials | null {
  return cachedCredentials;
}

/**
 * Check if SDK is configured
 */
export function hasCredentials(): boolean {
  try {
    getSdkConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the public URL for S3 objects
 */
export function getPublicUrl(key: string): string {
  const creds = cachedCredentials;
  if (!creds) {
    throw new ConfigurationError('Credentials not yet loaded. Call getAwsCredentials() first.');
  }

  if (creds.publicUrl) {
    return `${creds.publicUrl}/${key}`;
  }

  return `https://${creds.bucket}.s3.${creds.region}.amazonaws.com/${key}`;
}

/**
 * Reset credentials cache (for testing)
 */
export function resetCredentials(): void {
  if (credentialCache) {
    credentialCache.clear();
  }
  credentialCache = null;
  cachedCredentials = null;
  globalForCache.__yobo_credential_cache = undefined;
  globalForCache.__yobo_cached_credentials = undefined;
  log.debug('Credentials reset');
}

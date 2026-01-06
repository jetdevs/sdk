/**
 * Credential Cache
 *
 * Manages temporary AWS credentials from Credentials Service.
 * Simple version without concurrent protection.
 */

import { createLogger } from '../lib/logger';

const log = createLogger('CredentialCache');

/**
 * Temporary credentials returned from Credentials Service
 */
export interface TemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  bucket: string;
  region: string;
  publicUrl: string;
}

/**
 * Credential cache with automatic refresh
 */
export class CredentialCache {
  private credentials: TemporaryCredentials | null = null;
  private refreshBuffer = 20 * 60 * 1000; // Refresh 20 minutes before expiration

  constructor(
    private apiUrl: string,
    private apiKey: string
  ) {}

  /**
   * Get credentials (fetches new ones if expired or not cached)
   */
  async getCredentials(): Promise<TemporaryCredentials> {
    // Return cached credentials if still valid
    if (this.isValid()) {
      log.debug('Using cached credentials', {
        expiresAt: this.credentials!.expiration.toISOString(),
      });
      return this.credentials!;
    }

    // Fetch new credentials
    log.info('Fetching new credentials from Credentials Service');
    this.credentials = await this.fetchCredentials();
    return this.credentials;
  }

  /**
   * Check if cached credentials are still valid
   */
  private isValid(): boolean {
    if (!this.credentials) return false;
    const timeRemaining = this.credentials.expiration.getTime() - Date.now();
    return timeRemaining > this.refreshBuffer;
  }

  /**
   * Fetch credentials from Credentials Service
   */
  private async fetchCredentials(): Promise<TemporaryCredentials> {
    const url = `${this.apiUrl}/api/credentials/aws`;

    log.debug('Requesting credentials', { url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...(process.env.YOBO_SDK_CLIENT_ID && { 'X-Client-ID': process.env.YOBO_SDK_CLIENT_ID }),
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      log.error('Failed to fetch credentials', new Error(error));
      throw new Error(error);
    }

    const data = await response.json();

    if (!data.success) {
      const error = data.error || 'Failed to fetch credentials';
      log.error('Credentials Service returned error', new Error(error));
      throw new Error(error);
    }

    log.info('Credentials fetched successfully', {
      expiresAt: data.data.expiration,
      bucket: data.data.bucket,
      region: data.data.region,
    });

    return {
      accessKeyId: data.data.accessKeyId,
      secretAccessKey: data.data.secretAccessKey,
      sessionToken: data.data.sessionToken,
      expiration: new Date(data.data.expiration),
      bucket: data.data.bucket,
      region: data.data.region,
      publicUrl: data.data.publicUrl,
    };
  }

  /**
   * Clear cached credentials (for testing or forced refresh)
   */
  clear(): void {
    this.credentials = null;
    log.debug('Credential cache cleared');
  }
}

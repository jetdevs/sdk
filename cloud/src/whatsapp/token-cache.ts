/**
 * WhatsApp Token Provider
 *
 * SECURITY: This module fetches access tokens from credentials-service.
 * SDK no longer handles OAuth credentials (clientId/clientSecret) directly.
 *
 * The token lifecycle is managed by credentials-service, which handles:
 * - OAuth token exchange with WhatsApp API
 * - Token caching and refresh
 *
 * SDK only receives temporary access tokens.
 */

import { getSdkConfig } from '../config/credentials';
import { createLogger } from '../lib/logger';

const log = createLogger('WhatsAppTokenProvider');

export interface TokenData {
  apiUrl: string;
  accessToken: string;
  expiresAt: number; // Unix timestamp in seconds
}

// Local cache for token data
let cachedToken: TokenData | null = null;
const REFRESH_BUFFER_MS = 2 * 60 * 1000; // Refresh 2 minutes before expiry

/**
 * Get WhatsApp token from credentials-service
 *
 * This function fetches a token from credentials-service.
 * The credentials-service handles OAuth internally and only returns
 * temporary access tokens (never clientId/clientSecret).
 */
export async function getWhatsAppToken(): Promise<TokenData> {
  const now = Date.now();

  // Check local cache
  if (cachedToken && now < cachedToken.expiresAt * 1000 - REFRESH_BUFFER_MS) {
    log.debug('Using locally cached WhatsApp token');
    return cachedToken;
  }

  // Fetch token from credentials-service
  log.debug('Fetching WhatsApp token from credentials-service');

  const config = getSdkConfig();
  const response = await fetch(`${config.credentialsApiUrl}/api/credentials/whatsapp/token`, {
    method: 'POST',
    headers: {
      'X-API-Key': config.apiKey,
      'Content-Type': 'application/json',
      ...(process.env.YOBO_SDK_CLIENT_ID && { 'X-Client-ID': process.env.YOBO_SDK_CLIENT_ID }),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`Failed to get WhatsApp token: ${response.status}`, undefined, { error: errorText });
    throw new Error(`Failed to get WhatsApp token: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as {
    success: boolean;
    data?: TokenData;
    error?: string;
  };

  if (!result.success || !result.data) {
    const errorMsg = result.error || 'Failed to get WhatsApp token';
    log.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Update local cache
  cachedToken = result.data;

  log.info('WhatsApp token fetched from credentials-service', {
    expiresAt: new Date(result.data.expiresAt * 1000).toISOString(),
  });

  return cachedToken;
}

/**
 * Reset local token cache
 */
export function resetWhatsAppTokenCache(): void {
  cachedToken = null;
  log.debug('WhatsApp token cache reset');
}

/**
 * @deprecated Use getWhatsAppToken() instead
 *
 * Legacy class for backward compatibility.
 * New code should use the getWhatsAppToken() function directly.
 */
export class WhatsAppTokenCache {
  constructor(_credentials?: unknown) {
    log.warn('WhatsAppTokenCache is deprecated. Credentials are now managed by credentials-service.');
  }

  async getToken(): Promise<string> {
    const tokenData = await getWhatsAppToken();
    return tokenData.accessToken;
  }

  reset(): void {
    resetWhatsAppTokenCache();
  }
}

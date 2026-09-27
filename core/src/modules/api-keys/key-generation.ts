/**
 * API Key Generation Utility
 *
 * Generates cryptographically secure API keys for external integrations.
 * Format: {prefix}-{base64url random}
 *
 * @module @jetdevs/core/api-keys
 */

import crypto from 'crypto';
import type { ApiKeyEnvironment, ApiKeyGenerationResult } from './types';

/**
 * Default prefix for API keys.
 * Apps can override this when calling generateApiKey.
 */
export const DEFAULT_KEY_PREFIX = 'yobo';

/**
 * Generates a cryptographically secure API key
 *
 * Key Format: {prefix}-{base64url}
 * - prefix: Configurable product prefix (default: 'yobo')
 * - base64url: 48 chars of URL-safe base64 (36 random bytes)
 *
 * Example: yobo-AbCdEf0123456789_example_placeholder_value_here_xyz
 *
 * @param _env - Ignored (kept for backward compatibility)
 * @param prefix - Optional prefix for the key (default: 'yobo')
 * @returns Object containing full key, prefix, and hash
 */
export function generateApiKey(
  _env: ApiKeyEnvironment = 'live',
  prefix: string = DEFAULT_KEY_PREFIX
): ApiKeyGenerationResult {
  // Generate 36 random bytes → 48 base64url characters
  const randomPart = crypto.randomBytes(36).toString('base64url');

  // Construct full key: {prefix}-{random}
  const key = `${prefix}-${randomPart}`;

  // First 12 chars for display
  const keyPrefix = key.slice(0, 12);

  // SHA-256 hash for storage
  const keyHash = crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');

  return { key, keyPrefix, keyHash };
}

/**
 * Hashes an API key for lookup
 *
 * @param key - The full API key to hash
 * @returns SHA-256 hash (64 hex characters)
 */
export function hashApiKey(key: string): string {
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * Validates API key format
 *
 * @param key - The API key to validate
 * @param prefix - Expected prefix (default: 'yobo')
 * @returns true if format is valid, false otherwise
 */
export function validateApiKeyFormat(key: string, prefix: string = DEFAULT_KEY_PREFIX): boolean {
  // Pattern: {prefix}-{base64url chars} (at least 32 chars of random)
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}-[A-Za-z0-9_-]{32,}$`);
  return pattern.test(key);
}

/**
 * Validates API key checksum (no-op for new format, returns format validity)
 */
export function validateApiKeyChecksum(key: string): boolean {
  return validateApiKeyFormat(key);
}

/**
 * Extracts environment from API key (always returns 'live' for new format)
 */
export function extractKeyEnvironment(_key: string): ApiKeyEnvironment | null {
  return 'live';
}

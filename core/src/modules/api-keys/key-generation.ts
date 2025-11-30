/**
 * API Key Generation Utility
 *
 * Generates cryptographically secure API keys for external integrations.
 * Format: {prefix}_{env}_{random_bytes}_{checksum}
 *
 * @module @yobolabs/core/api-keys
 */

import crypto from 'crypto';
import type { ApiKeyGenerationResult, ApiKeyEnvironment } from './types';

/**
 * Default prefix for API keys.
 * Apps can override this when calling generateApiKey.
 */
export const DEFAULT_KEY_PREFIX = 'yobo';

/**
 * Generates a cryptographically secure API key
 *
 * Key Format: {prefix}_{env}_{random}_{checksum}
 * - prefix: Configurable product prefix (default: 'yobo')
 * - env: 'live' or 'test' environment
 * - random: 64 hex chars (32 random bytes)
 * - checksum: 8 hex chars (first 8 of SHA-256 hash)
 *
 * Example: yobo_live_a1b2c3d4...xyz890_12345678
 *
 * @param env - Environment type ('live' or 'test')
 * @param prefix - Optional prefix for the key (default: 'yobo')
 * @returns Object containing full key, prefix, and hash
 *
 * @example
 * const { key, keyPrefix, keyHash } = generateApiKey('live');
 * console.log(key);       // Show to user ONCE
 * console.log(keyPrefix); // Store for display: "yobo_live_a1b2c"
 * console.log(keyHash);   // Store for validation
 */
export function generateApiKey(
  env: ApiKeyEnvironment = 'live',
  prefix: string = DEFAULT_KEY_PREFIX
): ApiKeyGenerationResult {
  // Generate 32 random bytes (64 hex characters)
  const randomBytes = crypto.randomBytes(32).toString('hex');

  // Generate checksum from random bytes (first 8 chars of SHA-256)
  const checksum = crypto
    .createHash('sha256')
    .update(randomBytes)
    .digest('hex')
    .slice(0, 8);

  // Construct full key: {prefix}_{env}_{random}_{checksum}
  const key = `${prefix}_${env}_${randomBytes}_${checksum}`;

  // Extract prefix (first 16 chars for display)
  const keyPrefix = key.slice(0, 16);

  // Generate SHA-256 hash for storage
  const keyHash = crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');

  return { key, keyPrefix, keyHash };
}

/**
 * Hashes an API key for lookup
 *
 * Use this to hash an incoming API key for comparison with stored hashes
 *
 * @param key - The full API key to hash
 * @returns SHA-256 hash (64 hex characters)
 *
 * @example
 * const incomingKey = req.headers.authorization?.replace('Bearer ', '');
 * const hash = hashApiKey(incomingKey);
 * const storedKey = await db.query.apiKeys.findFirst({
 *   where: eq(apiKeys.keyHash, hash)
 * });
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
 * Checks if a string matches the expected API key format
 * Does NOT validate if the key is active or exists in database
 *
 * @param key - The API key to validate
 * @param prefix - Expected prefix (default: 'yobo')
 * @returns true if format is valid, false otherwise
 *
 * @example
 * const isValid = validateApiKeyFormat('yobo_live_abc123..._12345678');
 * if (!isValid) {
 *   throw new Error('Invalid API key format');
 * }
 */
export function validateApiKeyFormat(key: string, prefix: string = DEFAULT_KEY_PREFIX): boolean {
  // Pattern: {prefix}_{live|test}_{64 hex chars}_{8 hex chars}
  const pattern = new RegExp(`^${prefix}_(live|test)_[a-f0-9]{64}_[a-f0-9]{8}$`);
  return pattern.test(key);
}

/**
 * Validates API key checksum
 *
 * Verifies that the checksum in the key matches the hash of the random portion
 * This provides an additional layer of validation before database lookup
 *
 * @param key - The full API key to validate
 * @returns true if checksum is valid, false otherwise
 *
 * @example
 * if (!validateApiKeyChecksum(incomingKey)) {
 *   throw new Error('Invalid API key checksum');
 * }
 */
export function validateApiKeyChecksum(key: string): boolean {
  try {
    // Extract components: {prefix}_{env}_{random}_{checksum}
    const parts = key.split('_');
    if (parts.length !== 4) return false;

    const randomPart = parts[2];
    const providedChecksum = parts[3];

    // Recalculate checksum
    const calculatedChecksum = crypto
      .createHash('sha256')
      .update(randomPart)
      .digest('hex')
      .slice(0, 8);

    // Compare checksums (constant-time comparison)
    return crypto.timingSafeEqual(
      Buffer.from(providedChecksum),
      Buffer.from(calculatedChecksum)
    );
  } catch {
    return false;
  }
}

/**
 * Extracts environment from API key
 *
 * @param key - The API key
 * @returns Environment ('live' or 'test') or null if invalid
 *
 * @example
 * const env = extractKeyEnvironment('yobo_test_...');
 * console.log(env); // 'test'
 */
export function extractKeyEnvironment(key: string): ApiKeyEnvironment | null {
  try {
    const parts = key.split('_');
    if (parts.length < 2) return null;

    const env = parts[1] as ApiKeyEnvironment;
    return ['live', 'test'].includes(env) ? env : null;
  } catch {
    return null;
  }
}

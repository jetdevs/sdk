/**
 * ID Generation Utilities
 *
 * Functions for generating unique identifiers.
 */

/**
 * Generate a unique ID that works in both server-side and client-side environments.
 *
 * In environments with crypto.randomUUID() support (modern browsers, Node.js 16+),
 * it uses the native implementation. Otherwise, it falls back to a timestamp-based
 * approach with high entropy random components.
 *
 * @returns A unique identifier string (UUID format when available)
 */
export function generateUniqueId(): string {
  // Check if crypto.randomUUID is available (modern browsers and Node.js 16+)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID
  // Format: {timestamp}-{random1}-{random2}
  const timestamp = Date.now().toString(36);
  const randomPart1 = Math.random().toString(36).substring(2, 11);
  const randomPart2 = Math.random().toString(36).substring(2, 11);

  return `${timestamp}-${randomPart1}-${randomPart2}`;
}

/**
 * Generate a prefixed ID
 *
 * @param prefix - Optional prefix for the ID
 * @returns A unique identifier with optional prefix
 */
export function generatePrefixedId(prefix?: string): string {
  const id = generateUniqueId();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate a short ID (8 characters)
 * Suitable for display purposes, not guaranteed unique for large datasets
 */
export function generateShortId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp.slice(-4)}${random}`;
}

/**
 * Generate a nano ID style identifier
 *
 * @param length - Length of the ID (default: 21)
 * @returns A URL-safe unique identifier
 */
export function generateNanoId(length = 21): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';

  // Use crypto.getRandomValues if available for better randomness
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      id += alphabet[values[i] % alphabet.length];
    }
  } else {
    // Fallback to Math.random
    for (let i = 0; i < length; i++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }

  return id;
}

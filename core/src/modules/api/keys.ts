/**
 * Key helpers for the REST kit.
 *
 * Key generation/hashing is NOT forked: it re-exports
 * `core/src/modules/api-keys/key-generation.ts` (audit row 3 — the app copies
 * of `src/lib/api/key-generation.ts` are the duplicates to delete).
 *
 * @module @jetdevs/core/api
 */

import { createHash, timingSafeEqual } from 'crypto';

export {
  generateApiKey,
  hashApiKey,
  validateApiKeyFormat,
  DEFAULT_KEY_PREFIX,
} from '../api-keys/key-generation';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time string compare for static secrets (e.g. an internal service
 * key). Both sides are sha256-hashed first so the compare always runs on two
 * 32-byte buffers: no length leak, no early return (same as framework
 * `internal-auth` `safeEqual`).
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

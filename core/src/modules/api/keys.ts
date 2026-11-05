/**
 * Key helpers for the REST kit.
 *
 * Key generation/hashing is NOT forked: it re-exports
 * `core/src/modules/api-keys/key-generation.ts` (audit row 3 — the app copies
 * of `src/lib/api/key-generation.ts` are the duplicates to delete).
 *
 * @module @jetdevs/core/api
 */

import { timingSafeEqual } from 'crypto';

export {
  generateApiKey,
  hashApiKey,
  validateApiKeyFormat,
  DEFAULT_KEY_PREFIX,
} from '../api-keys/key-generation';

/**
 * Constant-time string compare for static secrets (e.g. an internal service
 * key). Length mismatch returns false without an early content compare.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

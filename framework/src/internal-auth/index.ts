/**
 * Internal service-to-service auth and cron auth.
 *
 * Ported from cadra-web `src/lib/api/internal-auth.ts` (X-Internal-API-Key),
 * crm `src/server/mcp/internal-key.ts` (SHA-256 digest timing-safe compare),
 * slides `src/lib/api/cron-auth.ts` (Bearer CRON_SECRET).
 *
 * Caller identity comes ONLY from which key matched. An `X-Service-Name`
 * header (or any other caller-supplied header) is never trusted.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

export interface HeaderReader {
  get(name: string): string | null;
}

/** Anything with a Headers-like `headers` (Request, NextRequest). */
export interface RequestLike {
  headers: HeaderReader;
}

export type InternalAuthFailure = 'not_configured' | 'missing_key' | 'invalid_key';

export type InternalAuthResult =
  | { ok: true; caller: string }
  | { ok: false; reason: InternalAuthFailure };

export interface VerifyInternalKeyOptions {
  /** Header carrying the key. Default `x-internal-api-key`. */
  header?: string;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time string equality (hash first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Build a key map from env-style entries, dropping unset/empty keys.
 * Rotation: list the old and new key under the same caller name (2 active keys).
 *
 * @example buildInternalKeyMap([[process.env.CADRA_API_KEY, 'cadra-api'], [process.env.CADRA_API_KEY_NEXT, 'cadra-api']])
 */
export function buildInternalKeyMap(
  entries: Array<[key: string | undefined | null, caller: string]>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, caller] of entries) {
    if (key) map[key] = caller;
  }
  return map;
}

/**
 * Verify `X-Internal-API-Key` against a key -> caller-name map.
 * Every configured key is compared (no early exit) so timing does not reveal
 * which key, or how many, exist. Empty keys are ignored (fail closed); an
 * empty map yields `not_configured` (callers should answer 503 or 401).
 */
export function verifyInternalKey(
  req: RequestLike,
  keyMap: Record<string, string> | ReadonlyMap<string, string>,
  options: VerifyInternalKeyOptions = {},
): InternalAuthResult {
  const entries = (keyMap instanceof Map ? [...keyMap.entries()] : Object.entries(keyMap)).filter(
    ([key]) => key.length > 0,
  );
  if (entries.length === 0) return { ok: false, reason: 'not_configured' };

  const provided = req.headers.get(options.header ?? INTERNAL_API_KEY_HEADER);
  if (!provided) return { ok: false, reason: 'missing_key' };

  const providedDigest = digest(provided);
  let caller: string | null = null;
  for (const [key, name] of entries) {
    if (timingSafeEqual(providedDigest, digest(key)) && caller === null) caller = name;
  }
  return caller === null ? { ok: false, reason: 'invalid_key' } : { ok: true, caller };
}

/**
 * Verify a cron request: `Authorization: Bearer <secret>`, constant-time.
 * Unset secret, missing header, or wrong value -> false (caller returns 401).
 * Secrets never travel in query strings.
 */
export function verifyCronSecret(req: RequestLike, secret: string | undefined | null): boolean {
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return safeEqual(auth.slice('Bearer '.length), secret);
}

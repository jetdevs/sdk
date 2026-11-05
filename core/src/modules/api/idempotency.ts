/**
 * Idempotency-Key middleware for write endpoints.
 *
 * Ported from yobo `src/lib/api/idempotency.ts` (P19 S4): per-org dedup of the
 * `Idempotency-Key` header; the first response is stored keyed by
 * (org, key) and replayed until it expires. The yobo copy queried its own
 * `api_idempotency_keys` table via adminDb; here the store is injected and
 * the scope is always the authenticated org (never a caller header).
 *
 * Only responses below 500 are stored, so a failed attempt can be retried.
 *
 * @module @jetdevs/core/api
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed';

export interface StoredIdempotentResponse {
  status: number;
  body: string;
  contentType: string | null;
}

export interface IdempotencyStore {
  /** Return the stored response if present and not expired. */
  get(orgId: string, key: string): Promise<StoredIdempotentResponse | null>;
  /** Store the first response. Must not overwrite an existing entry (insert … on conflict do nothing). */
  put(orgId: string, key: string, response: StoredIdempotentResponse, expiresAt: Date): Promise<void>;
}

export interface IdempotencyOptions {
  store: IdempotencyStore;
  /** Authenticated org — from ApiContext, never from a request header. */
  orgId: string | number;
  /** Seconds. App default: 86400 (yobo `expires_at` 24h). */
  ttlSeconds?: number;
  /** Methods the header applies to. Default: POST, PUT, PATCH, DELETE. */
  methods?: readonly string[];
  onError?: (message: string, error: unknown) => void;
}

const DEFAULT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

export function getIdempotencyKey(request: Request): string | null {
  const key = request.headers.get(IDEMPOTENCY_HEADER);
  return key && key.trim() ? key.trim() : null;
}

/**
 * Run `handler` at most once per (org, Idempotency-Key). Requests without the
 * header, or with a method outside `methods`, pass straight through.
 */
export async function withIdempotency(
  request: Request,
  options: IdempotencyOptions,
  handler: () => Promise<Response>,
): Promise<Response> {
  const methods = options.methods ?? DEFAULT_METHODS;
  const key = getIdempotencyKey(request);
  if (!key || !methods.includes(request.method.toUpperCase())) return handler();

  const orgId = String(options.orgId);
  const onError = options.onError ?? console.error;

  try {
    const hit = await options.store.get(orgId, key);
    if (hit) {
      const headers = new Headers({ [IDEMPOTENT_REPLAY_HEADER]: 'true' });
      if (hit.contentType) headers.set('Content-Type', hit.contentType);
      return new Response(hit.body, { status: hit.status, headers });
    }
  } catch (error) {
    onError('[API Idempotency] lookup failed', error);
  }

  const response = await handler();
  if (response.status < 500) {
    try {
      const body = await response.clone().text();
      const expiresAt = new Date(Date.now() + (options.ttlSeconds ?? 86400) * 1000);
      await options.store.put(
        orgId,
        key,
        { status: response.status, body, contentType: response.headers.get('Content-Type') },
        expiresAt,
      );
    } catch (error) {
      onError('[API Idempotency] store failed', error);
    }
  }
  return response;
}

/** In-memory store for tests and single-process dev. */
export function createMemoryIdempotencyStore(now: () => number = Date.now): IdempotencyStore {
  const map = new Map<string, { response: StoredIdempotentResponse; expiresAt: number }>();
  const k = (orgId: string, key: string): string => `${orgId}\u0000${key}`;
  return {
    async get(orgId: string, key: string): Promise<StoredIdempotentResponse | null> {
      const hit = map.get(k(orgId, key));
      if (!hit || hit.expiresAt <= now()) return null;
      return hit.response;
    },
    async put(orgId: string, key: string, response: StoredIdempotentResponse, expiresAt: Date): Promise<void> {
      const id = k(orgId, key);
      const existing = map.get(id);
      if (existing && existing.expiresAt > now()) return;
      map.set(id, { response, expiresAt: expiresAt.getTime() });
    },
  };
}

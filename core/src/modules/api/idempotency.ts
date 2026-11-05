/**
 * Idempotency-Key middleware for write endpoints.
 *
 * Ported from yobo `src/lib/api/idempotency.ts` (P19 S4): per-org dedup of the
 * `Idempotency-Key` header; the first response is stored and replayed until
 * it expires. The yobo copy queried its own `api_idempotency_keys` table via
 * adminDb; here the store is injected and the org is always the authenticated
 * org (never a caller header).
 *
 * Flow (closes the lookup → handler → store race of the yobo copy):
 *   1. `reserve` atomically claims a PENDING record before the handler runs
 *      (Redis `SET NX PX`, or `INSERT … ON CONFLICT DO NOTHING RETURNING`).
 *   2. Only the request that won the reservation runs the handler.
 *      A concurrent duplicate gets 409 `IDEMPOTENCY_IN_PROGRESS`; once the
 *      first finishes, duplicates get the stored replay.
 *   3. The key is bound to (org, METHOD, route path) and to a sha256 of the
 *      request body. Same key with a different body → 422
 *      `IDEMPOTENCY_KEY_MISMATCH`.
 *   4. Handler throw or a 5xx response releases the reservation, so a failed
 *      attempt can be retried. Only responses below 500 are stored.
 *
 * @module @jetdevs/core/api
 */

import { createHash } from 'crypto';
import { errorResponse, idempotencyInProgress, idempotencyKeyMismatch } from './errors';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed';

export interface StoredIdempotentResponse {
  status: number;
  body: string;
  contentType: string | null;
}

/** A reservation (`response: null` = handler still running) or a completed response. */
export interface IdempotencyRecord {
  /** sha256 hex of the request body the key was first used with. */
  requestHash: string;
  response: StoredIdempotentResponse | null;
}

/**
 * Store contract. `scopeKey` already binds METHOD + route path + the client
 * key; `orgId` is kept separate so a db store can put it in an `org_id` column.
 */
export interface IdempotencyStore {
  /**
   * Atomically create a pending record. Returns true when this call created
   * it, false when an unexpired record already exists. Must be atomic:
   * Redis `SET key value NX PX ttl`, or
   * `INSERT … ON CONFLICT DO NOTHING RETURNING 1` (expired rows deleted first or
   * replaced via `ON CONFLICT … DO UPDATE … WHERE expires_at <= now()`).
   */
  reserve(orgId: string, scopeKey: string, requestHash: string, expiresAt: Date): Promise<boolean>;
  /** Return the record if present and not expired. */
  get(orgId: string, scopeKey: string): Promise<IdempotencyRecord | null>;
  /** Attach the final response to the reserved record. */
  complete(orgId: string, scopeKey: string, response: StoredIdempotentResponse, expiresAt: Date): Promise<void>;
  /** Drop a pending reservation (handler threw / 5xx) so the client can retry. */
  release(orgId: string, scopeKey: string): Promise<void>;
}

export interface IdempotencyOptions {
  store: IdempotencyStore;
  /** Authenticated org — from ApiContext, never from a request header. */
  orgId: string | number;
  /** Seconds a completed response is replayed. App default: 86400 (yobo `expires_at` 24h). */
  ttlSeconds?: number;
  /**
   * Seconds a pending reservation lives if the process dies mid-handler.
   * Default: `ttlSeconds`. Set it near your function timeout to unblock
   * retries sooner after a crash.
   */
  pendingTtlSeconds?: number;
  /** Methods the header applies to. Default: POST, PUT, PATCH, DELETE. */
  methods?: readonly string[];
  onError?: (message: string, error: unknown) => void;
}

const DEFAULT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const DEFAULT_TTL_SECONDS = 86400;

export function getIdempotencyKey(request: Request): string | null {
  const key = request.headers.get(IDEMPOTENCY_HEADER);
  return key && key.trim() ? key.trim() : null;
}

/** `METHOD path\0key` — the key is only valid for the route it was first sent to. */
export function idempotencyScopeKey(request: Request, key: string): string {
  return `${request.method.toUpperCase()} ${new URL(request.url).pathname}\u0000${key}`;
}

export function hashRequestBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function replay(response: StoredIdempotentResponse): Response {
  const headers = new Headers({ [IDEMPOTENT_REPLAY_HEADER]: 'true' });
  if (response.contentType) headers.set('Content-Type', response.contentType);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Run `handler` at most once per (org, METHOD, path, Idempotency-Key).
 * Requests without the header, or with a method outside `methods`, pass
 * straight through. If the store itself is unreachable the handler runs
 * without dedup (fail-open, as the yobo copy did) and `onError` is called.
 */
export async function withIdempotency(
  request: Request,
  options: IdempotencyOptions,
  handler: () => Promise<Response>,
): Promise<Response> {
  const methods = options.methods ?? DEFAULT_METHODS;
  const key = getIdempotencyKey(request);
  if (!key || !methods.includes(request.method.toUpperCase())) return handler();

  const { store } = options;
  const orgId = String(options.orgId);
  const onError = options.onError ?? console.error;
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const pendingTtlSeconds = options.pendingTtlSeconds ?? ttlSeconds;
  const scopeKey = idempotencyScopeKey(request, key);
  // Clone so the handler can still read the body.
  const requestHash = hashRequestBody(await request.clone().text());

  let reserved: boolean;
  try {
    reserved = await store.reserve(orgId, scopeKey, requestHash, new Date(Date.now() + pendingTtlSeconds * 1000));
  } catch (error) {
    onError('[API Idempotency] reserve failed', error);
    return handler();
  }

  if (!reserved) {
    let existing: IdempotencyRecord | null;
    try {
      existing = await store.get(orgId, scopeKey);
    } catch (error) {
      onError('[API Idempotency] lookup failed', error);
      return errorResponse(idempotencyInProgress());
    }
    if (existing && existing.requestHash !== requestHash) return errorResponse(idempotencyKeyMismatch());
    if (existing?.response) return replay(existing.response);
    // Pending, or expired between reserve and get: the client retries.
    return errorResponse(idempotencyInProgress());
  }

  const releaseQuietly = async (): Promise<void> => {
    try {
      await store.release(orgId, scopeKey);
    } catch (error) {
      onError('[API Idempotency] release failed', error);
    }
  };

  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    await releaseQuietly();
    throw error;
  }

  if (response.status >= 500) {
    await releaseQuietly();
    return response;
  }
  try {
    const body = await response.clone().text();
    await store.complete(
      orgId,
      scopeKey,
      { status: response.status, body, contentType: response.headers.get('Content-Type') },
      new Date(Date.now() + ttlSeconds * 1000),
    );
  } catch (error) {
    onError('[API Idempotency] store failed', error);
    // Do not leave a pending record that would 409 every retry until it expires.
    await releaseQuietly();
  }
  return response;
}

/** In-memory store for tests and single-process dev. */
export function createMemoryIdempotencyStore(now: () => number = Date.now): IdempotencyStore {
  const map = new Map<string, IdempotencyRecord & { expiresAt: number }>();
  const k = (orgId: string, scopeKey: string): string => `${orgId}\u0000${scopeKey}`;
  return {
    async reserve(orgId: string, scopeKey: string, requestHash: string, expiresAt: Date): Promise<boolean> {
      // Check-and-set runs synchronously within one tick, so it is atomic in-process.
      const id = k(orgId, scopeKey);
      const existing = map.get(id);
      if (existing && existing.expiresAt > now()) return false;
      map.set(id, { requestHash, response: null, expiresAt: expiresAt.getTime() });
      return true;
    },
    async get(orgId: string, scopeKey: string): Promise<IdempotencyRecord | null> {
      const hit = map.get(k(orgId, scopeKey));
      if (!hit || hit.expiresAt <= now()) return null;
      return { requestHash: hit.requestHash, response: hit.response };
    },
    async complete(
      orgId: string,
      scopeKey: string,
      response: StoredIdempotentResponse,
      expiresAt: Date,
    ): Promise<void> {
      const id = k(orgId, scopeKey);
      const existing = map.get(id);
      if (!existing || existing.response) return;
      map.set(id, { ...existing, response, expiresAt: expiresAt.getTime() });
    },
    async release(orgId: string, scopeKey: string): Promise<void> {
      const id = k(orgId, scopeKey);
      const existing = map.get(id);
      if (existing && !existing.response) map.delete(id);
    },
  };
}

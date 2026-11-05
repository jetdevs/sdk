/**
 * Rate limiting (fixed window, pluggable store).
 *
 * Ported from cadra-web `src/lib/api/rate-limit.ts` (Redis INCR windows,
 * environment-namespaced keys, rejected requests not counted) and the
 * `src/server/lib/rate-limit.ts` copies (in-memory fallback, allow-on-store-error).
 * App-specific bits (app db, audit log, env names) removed: the caller supplies
 * the limit config, the store, and does its own logging when `result.fired`.
 *
 * Limits are caller config only. Current app defaults, for reference only:
 *   auth 5 / 15 min, password reset 3 / 1 h, api 100 / 1 min, trpc 60 / 1 min,
 *   REST API key 1000 / 1 h (cadra-web DEFAULT_RATE_LIMIT).
 */

export interface RateLimitConfig {
  /** Max allowed requests per window. Caller-owned; no SDK default. */
  limit: number;
  /** Window length in ms. Caller-owned; no SDK default. */
  windowMs: number;
}

export interface RateLimitStore {
  /**
   * Atomically add 1 to the counter at `key`. The counter must expire
   * `windowMs` after its first increment. Returns the new count and the
   * absolute epoch ms the counter expires.
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  /** Undo one increment (used so rejected requests are not counted). */
  decrement(key: string): Promise<void>;
}

export interface RateLimitResult {
  /** True when the request may proceed. */
  allowed: boolean;
  /** True when the limiter blocked this request. Log it on the user row/job. */
  fired: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Seconds the caller should wait; 0 when allowed. */
  retryAfterSeconds: number;
  /** Store key actually used. */
  key: string;
  /** Set when the store threw and the limiter failed open (or closed). */
  storeError?: unknown;
}

export interface CheckRateLimitOptions {
  /** Behaviour when the store throws. Default true (allow), as all app copies did. */
  failOpen?: boolean;
  /** Clock override for tests. */
  now?: () => number;
}

/** Minimal key builder: joins non-empty parts, segments are sanitized so ':' cannot blur boundaries. */
export function buildRateLimitKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((p): p is string | number => p !== null && p !== undefined && String(p) !== '')
    .map((p) => String(p).replace(/:/g, '_'))
    .join(':');
}

/**
 * Client address from proxy headers (first x-forwarded-for hop, then x-real-ip).
 *
 * The first XFF hop is client-supplied unless your edge OVERWRITES the header
 * (Vercel does). Behind a proxy that APPENDS to x-forwarded-for, a caller can
 * spoof this value and dodge per-IP limits: pass a trusted IP from your
 * platform (e.g. the hop your own proxy added) as the key instead.
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Standard response headers for a result. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.allowed) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}

/**
 * Check and consume one unit for `key`.
 * Rejected requests are NOT counted: an over-limit increment is decremented
 * back, so a client retrying on 429 cannot keep the counter climbing.
 */
export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  config: RateLimitConfig,
  options: CheckRateLimitOptions = {},
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now;
  const failOpen = options.failOpen ?? true;
  try {
    const { count, resetAt } = await store.increment(key, config.windowMs);
    if (count > config.limit) {
      await store.decrement(key);
      return {
        allowed: false,
        fired: true,
        limit: config.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now()) / 1000)),
        key,
      };
    }
    return {
      allowed: true,
      fired: false,
      limit: config.limit,
      remaining: Math.max(0, config.limit - count),
      resetAt,
      retryAfterSeconds: 0,
      key,
    };
  } catch (storeError) {
    const resetAt = now() + config.windowMs;
    return {
      allowed: failOpen,
      fired: false,
      limit: config.limit,
      remaining: failOpen ? config.limit : 0,
      resetAt,
      retryAfterSeconds: failOpen ? 0 : Math.ceil(config.windowMs / 1000),
      key,
      storeError,
    };
  }
}

/** Bind a store + config into a reusable limiter. */
export function createRateLimiter(
  store: RateLimitStore,
  config: RateLimitConfig,
  options: CheckRateLimitOptions = {},
): { check(key: string): Promise<RateLimitResult> } {
  return { check: (key: string) => checkRateLimit(store, key, config, options) };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** In-process store. Fine for dev/single instance; use Redis on serverless. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = this.now();
    this.sweep(now);
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, fresh);
      return { ...fresh };
    }
    current.count += 1;
    return { ...current };
  }

  async decrement(key: string): Promise<void> {
    const current = this.entries.get(key);
    if (current && current.count > 0) current.count -= 1;
  }

  private sweep(now: number): void {
    if (this.entries.size < 1000) return;
    for (const [k, v] of this.entries) if (v.resetAt <= now) this.entries.delete(k);
  }
}

/** Minimal Redis surface (ioredis and node-redis v4 command names both satisfy this via a thin adapter). */
export interface RateLimitRedisClient {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

/** Redis store over an injected client. Counter TTL set on first increment. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: RateLimitRedisClient,
    private readonly prefix = 'ratelimit',
    private readonly now: () => number = Date.now,
  ) {}

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const full = `${this.prefix}:${key}`;
    const count = await this.client.incr(full);
    if (count === 1) await this.client.pexpire(full, windowMs);
    let ttl = await this.client.pttl(full);
    if (ttl < 0) {
      // No TTL (crash between INCR and PEXPIRE): repair so the key cannot live forever.
      await this.client.pexpire(full, windowMs);
      ttl = windowMs;
    }
    return { count, resetAt: this.now() + ttl };
  }

  async decrement(key: string): Promise<void> {
    await this.client.decr(`${this.prefix}:${key}`);
  }
}

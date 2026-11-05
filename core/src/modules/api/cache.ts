/**
 * API context cache + HTTP cache-header helpers.
 *
 * Ported from cadra-web `src/lib/api/cache.ts`. The app copy builds its own
 * ioredis client from app env names; here the store is injected so core holds
 * no Redis dependency or env names. Cache failures never fail a request.
 *
 * The cache stores DATA (the resolved context), never a verdict: callers must
 * still run any live checks (expiry, epoch) on a cache hit.
 *
 * @module @jetdevs/core/api
 */

/** Minimal key/value store (Redis, Upstash, in-memory…). */
export interface ApiCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface ApiContextCacheOptions {
  store: ApiCacheStore;
  /** Seconds. App default: 60 (cadra-web CACHE_TTL). */
  ttlSeconds?: number;
  /** App default: 'apikey:'. */
  prefix?: string;
  onError?: (message: string, error: unknown) => void;
}

export interface ApiContextCache<T> {
  get(keyHash: string): Promise<T | null>;
  set(keyHash: string, value: T): Promise<void>;
  invalidate(keyHash: string): Promise<void>;
}

export function createApiContextCache<T>(options: ApiContextCacheOptions): ApiContextCache<T> {
  const { store, ttlSeconds = 60, prefix = 'apikey:', onError = console.error } = options;
  const k = (keyHash: string): string => `${prefix}${keyHash}`;
  return {
    async get(keyHash: string): Promise<T | null> {
      try {
        const raw = await store.get(k(keyHash));
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (error) {
        onError('[API Cache] get error:', error);
        return null;
      }
    },
    async set(keyHash: string, value: T): Promise<void> {
      try {
        await store.set(k(keyHash), JSON.stringify(value), ttlSeconds);
      } catch (error) {
        onError('[API Cache] set error:', error);
      }
    },
    async invalidate(keyHash: string): Promise<void> {
      try {
        await store.del(k(keyHash));
      } catch (error) {
        onError('[API Cache] invalidate error:', error);
      }
    },
  };
}

/** In-memory store for tests and single-process dev. */
export function createMemoryCacheStore(now: () => number = Date.now): ApiCacheStore {
  const map = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key: string): Promise<string | null> {
      const hit = map.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= now()) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
      map.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async del(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

/** `Cache-Control` value for a response. `private` by default: API data is per-org. */
export function cacheControl(options: { maxAge?: number; private?: boolean; noStore?: boolean } = {}): string {
  if (options.noStore) return 'no-store';
  const scope = options.private === false ? 'public' : 'private';
  return `${scope}, max-age=${options.maxAge ?? 0}`;
}

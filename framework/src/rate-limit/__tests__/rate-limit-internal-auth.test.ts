import { describe, it, expect, vi } from 'vitest';
import {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  buildRateLimitKey,
  checkRateLimit,
  createRateLimiter,
  rateLimitHeaders,
  type RateLimitStore,
} from '../index';
import {
  buildInternalKeyMap,
  verifyCronSecret,
  verifyInternalKey,
} from '../../internal-auth/index';

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe('rate limiter', () => {
  it('fires after limit and does not count rejected requests', async () => {
    let t = 1_000_000;
    const store = new MemoryRateLimitStore(() => t);
    const rl = createRateLimiter(store, { limit: 2, windowMs: 60_000 }, { now: () => t });
    const key = buildRateLimitKey('auth', 'user', 7);
    expect(key).toBe('auth:user:7');
    expect((await rl.check(key)).fired).toBe(false);
    const second = await rl.check(key);
    expect(second.remaining).toBe(0);
    const third = await rl.check(key);
    expect(third).toMatchObject({ allowed: false, fired: true, remaining: 0 });
    expect(third.retryAfterSeconds).toBe(60);
    expect(rateLimitHeaders(third)['Retry-After']).toBe('60');
    // rejected did not climb: after window, allowed again
    t += 60_001;
    expect((await rl.check(key)).allowed).toBe(true);
  });

  it('memory window is per key and resets', async () => {
    let t = 0;
    const store = new MemoryRateLimitStore(() => t);
    const cfg = { limit: 1, windowMs: 1000 };
    expect((await checkRateLimit(store, 'a', cfg, { now: () => t })).allowed).toBe(true);
    expect((await checkRateLimit(store, 'b', cfg, { now: () => t })).allowed).toBe(true);
    expect((await checkRateLimit(store, 'a', cfg, { now: () => t })).fired).toBe(true);
    t = 1001;
    expect((await checkRateLimit(store, 'a', cfg, { now: () => t })).allowed).toBe(true);
  });

  it('store error fails open by default, closed on request', async () => {
    const broken: RateLimitStore = {
      increment: vi.fn().mockRejectedValue(new Error('down')),
      decrement: vi.fn(),
    };
    const cfg = { limit: 1, windowMs: 1000 };
    const open = await checkRateLimit(broken, 'k', cfg);
    expect(open.allowed).toBe(true);
    expect(open.storeError).toBeInstanceOf(Error);
    expect((await checkRateLimit(broken, 'k', cfg, { failOpen: false })).allowed).toBe(false);
  });

  it('redis store uses injected client', async () => {
    const counts = new Map<string, number>();
    const client = {
      incr: async (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1).get(k)!,
      decr: async (k: string) => counts.set(k, (counts.get(k) ?? 0) - 1).get(k)!,
      pexpire: vi.fn().mockResolvedValue(1),
      pttl: async () => 5000,
    };
    const store = new RedisRateLimitStore(client, 'rl', () => 100);
    const cfg = { limit: 1, windowMs: 5000 };
    expect((await checkRateLimit(store, 'x', cfg)).allowed).toBe(true);
    const blocked = await checkRateLimit(store, 'x', cfg);
    expect(blocked.fired).toBe(true);
    expect(blocked.resetAt).toBe(5100);
    expect(counts.get('rl:x')).toBe(1);
    expect(client.pexpire).toHaveBeenCalledTimes(1);
  });
});

describe('verifyInternalKey', () => {
  const keys = buildInternalKeyMap([
    ['key-old', 'cadra-api'],
    ['key-new', 'cadra-api'],
    ['key-other', 'message-api'],
    [undefined, 'ignored'],
  ]);

  it('accepts and rejects', () => {
    expect(verifyInternalKey(req({ 'X-Internal-API-Key': 'key-new' }), keys)).toEqual({ ok: true, caller: 'cadra-api' });
    expect(verifyInternalKey(req({ 'X-Internal-API-Key': 'nope' }), keys)).toEqual({ ok: false, reason: 'invalid_key' });
    expect(verifyInternalKey(req({}), keys)).toEqual({ ok: false, reason: 'missing_key' });
    expect(verifyInternalKey(req({ 'X-Internal-API-Key': 'x' }), {})).toEqual({ ok: false, reason: 'not_configured' });
    expect(verifyInternalKey(req({ 'X-Internal-API-Key': '' }), { '': 'bad' })).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('rotation: both old and new keys work', () => {
    expect(verifyInternalKey(req({ 'x-internal-api-key': 'key-old' }), keys)).toMatchObject({ ok: true });
    expect(verifyInternalKey(req({ 'x-internal-api-key': 'key-new' }), keys)).toMatchObject({ ok: true });
  });

  it('caller identity from key, never X-Service-Name', () => {
    const r = verifyInternalKey(req({ 'x-internal-api-key': 'key-other', 'x-service-name': 'cadra-api' }), keys);
    expect(r).toEqual({ ok: true, caller: 'message-api' });
  });
});

describe('verifyCronSecret', () => {
  it('bearer match only', () => {
    expect(verifyCronSecret(req({ authorization: 'Bearer s3' }), 's3')).toBe(true);
    expect(verifyCronSecret(req({ authorization: 'Bearer bad' }), 's3')).toBe(false);
    expect(verifyCronSecret(req({ authorization: 's3' }), 's3')).toBe(false);
    expect(verifyCronSecret(req({ authorization: 'Bearer ' }), '')).toBe(false);
    expect(verifyCronSecret(req({}), undefined)).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { checkRateLimit as frameworkCheckRateLimit, MemoryRateLimitStore } from '../../../../framework/src/rate-limit';
import {
  ApiErrorCode,
  apiErrorResponseSchema,
  assertRoutesDocumented,
  buildOpenApiDocument,
  createApiContextCache,
  createMemoryCacheStore,
  createMemoryIdempotencyStore,
  defineRoute,
  diffRoutesAgainstDocument,
  errorResponse,
  generateApiKey,
  nextRoutePathToOpenApi,
  notFound,
  parseRouteRequest,
  successResponse,
  timingSafeEqualString,
  withApiAuth,
  withIdempotency,
  type ApiContext,
  type ApiKeyResolution,
} from './index';

const PREFIX = 'jd';
const { key: VALID_KEY, keyHash: VALID_HASH } = generateApiKey('live', PREFIX);

function ctx(over: Partial<ApiContext> = {}): ApiContext {
  return { orgId: 7, userId: 1, apiKeyId: 11, permissions: ['apps:read'], authMethod: 'apiKey', ...over };
}

function req(auth?: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (auth) headers.set('Authorization', auth);
  return new Request('https://hub.test/api/v1/apps', { ...init, headers });
}

async function body(res: Response): Promise<{ success: boolean; error?: { code: string; message: string; details?: unknown }; data?: unknown }> {
  return (await res.json()) as { success: boolean; error?: { code: string; message: string }; data?: unknown };
}

describe('withApiAuth', () => {
  const resolveApiKey = vi.fn(async ({ keyHash }: { key: string; keyHash: string }): Promise<ApiKeyResolution<ApiContext>> =>
    keyHash === VALID_HASH ? { ok: true, context: ctx() } : null,
  );
  const verifyBearer = vi.fn(async (token: string): Promise<ApiContext | null> =>
    token === 'a.b.c' ? ctx({ authMethod: 'bearer', apiKeyId: null, subject: 'sub-1', permissions: ['me:read'] }) : null,
  );
  const ok = async (_r: Request, c: ApiContext): Promise<Response> => successResponse({ orgId: c.orgId, via: c.authMethod });

  it('allows a valid API key and runs the handler inside the injected org context', async () => {
    const seen: ApiContext[] = [];
    const withOrgContext = async <T,>(c: ApiContext, fn: () => Promise<T>): Promise<T> => {
      seen.push(c);
      return fn();
    };
    const guard = withApiAuth({ resolveApiKey, keyPrefixes: [PREFIX], withOrgContext });
    const res = await guard(req(`Bearer ${VALID_KEY}`), ok, { permissions: ['apps:read'] });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ success: true, data: { orgId: 7, via: 'apiKey' } });
    expect(seen.map((c) => c.orgId)).toEqual([7]);
  });

  it('routes a JWT-shaped token to verifyBearer', async () => {
    const guard = withApiAuth({ resolveApiKey, verifyBearer, keyPrefixes: [PREFIX] });
    const res = await guard(req('Bearer a.b.c'), ok, { permissions: ['me:read'] });
    expect(res.status).toBe(200);
    expect((await body(res)).data).toEqual({ orgId: 7, via: 'bearer' });
  });

  it('denies missing header, unknown key, bad bearer, and missing permission', async () => {
    const guard = withApiAuth({ resolveApiKey, verifyBearer, keyPrefixes: [PREFIX] });
    const missing = await guard(req(), ok);
    expect(missing.status).toBe(401);
    expect((await body(missing)).error?.code).toBe(ApiErrorCode.INVALID_API_KEY);

    const { key: other } = generateApiKey('live', PREFIX);
    expect((await guard(req(`Bearer ${other}`), ok)).status).toBe(401);
    expect((await guard(req('Bearer x.y.z'), ok)).status).toBe(401);

    const denied = await guard(req(`Bearer ${VALID_KEY}`), ok, { permissions: ['apps:write'] });
    expect(denied.status).toBe(403);
    const b = await body(denied);
    expect(b.error?.code).toBe(ApiErrorCode.INSUFFICIENT_PERMISSIONS);
    expect(b.error?.details).toEqual({ required: ['apps:write'] });
  });

  it('maps expired/revoked resolutions and refuses methods the route does not accept', async () => {
    const guard = withApiAuth<ApiContext>({ resolveApiKey: async () => ({ ok: false, reason: 'expired' }), keyPrefixes: [PREFIX] });
    expect((await body(await guard(req(`Bearer ${VALID_KEY}`), ok))).error?.code).toBe(ApiErrorCode.EXPIRED_API_KEY);
    const keyOnly = withApiAuth({ resolveApiKey, verifyBearer, keyPrefixes: [PREFIX] });
    expect((await keyOnly(req('Bearer a.b.c'), ok, { accept: ['apiKey'] })).status).toBe(401);
  });

  it('re-runs revalidate on a cache hit (cache holds data, not a verdict)', async () => {
    const cache = createApiContextCache<ApiContext>({ store: createMemoryCacheStore() });
    let live = true;
    const lookup = vi.fn(resolveApiKey);
    const guard = withApiAuth({ resolveApiKey: lookup, keyPrefixes: [PREFIX], cache, revalidate: async () => live });
    expect((await guard(req(`Bearer ${VALID_KEY}`), ok)).status).toBe(200);
    expect((await guard(req(`Bearer ${VALID_KEY}`), ok)).status).toBe(200);
    expect(lookup).toHaveBeenCalledOnce();
    live = false;
    expect((await guard(req(`Bearer ${VALID_KEY}`), ok)).status).toBe(401);
  });

  it('returns 429 with rate-limit headers, and wraps handler errors in the envelope', async () => {
    const limited = withApiAuth({
      resolveApiKey,
      keyPrefixes: [PREFIX],
      checkRateLimit: async () => ({ allowed: false, limit: 10, remaining: 0, resetAtMs: Date.now() + 30_000 }),
    });
    const r = await limited(req(`Bearer ${VALID_KEY}`), ok);
    expect(r.status).toBe(429);
    expect(r.headers.get('X-RateLimit-Limit')).toBe('10');
    const retry = Number(r.headers.get('Retry-After'));
    expect(retry).toBeGreaterThanOrEqual(29);
    expect(retry).toBeLessThanOrEqual(30);

    const guard = withApiAuth({ resolveApiKey, keyPrefixes: [PREFIX] });
    const thrown = await guard(req(`Bearer ${VALID_KEY}`), async () => {
      throw notFound('App', 'abc');
    });
    expect(thrown.status).toBe(404);
    const crash = await guard(req(`Bearer ${VALID_KEY}`), async () => {
      throw new Error('db exploded');
    });
    expect(crash.status).toBe(500);
    expect((await body(crash)).error?.message).not.toContain('db exploded');
  });

  it('rate-limit units: a blocked framework result yields Retry-After in seconds and X-RateLimit-Reset in unix seconds', async () => {
    const store = new MemoryRateLimitStore();
    const config = { limit: 1, windowMs: 60_000 };
    const guard = withApiAuth({
      resolveApiKey,
      keyPrefixes: [PREFIX],
      checkRateLimit: async (c: ApiContext) => {
        const r = await frameworkCheckRateLimit(store, `api:${String(c.apiKeyId)}`, config);
        return { ...r, resetAtMs: r.resetAt };
      },
    });
    expect((await guard(req(`Bearer ${VALID_KEY}`), ok)).status).toBe(200);
    const blocked = await guard(req(`Bearer ${VALID_KEY}`), ok);
    expect(blocked.status).toBe(429);
    const retry = Number(blocked.headers.get('Retry-After'));
    expect(retry).toBeGreaterThanOrEqual(59);
    expect(retry).toBeLessThanOrEqual(60);
    const reset = Number(blocked.headers.get('X-RateLimit-Reset'));
    const nowSec = Date.now() / 1000;
    expect(reset).toBeGreaterThan(nowSec);
    expect(reset).toBeLessThanOrEqual(Math.ceil(nowSec) + 60);
    expect((await body(blocked)).error?.details).toMatchObject({ retryAfter: retry });
  });
});

describe('error envelope', () => {
  it('has the { success:false, error:{ code, message, details } } shape', async () => {
    const res = errorResponse(notFound('App', 5));
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const json = await res.json();
    expect(apiErrorResponseSchema.parse(json)).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'App with ID 5 not found', details: { resource: 'App', id: 5 } },
    });
  });
});

describe('idempotency', () => {
  it('replays the first response for the same org + key, and scopes by org', async () => {
    const store = createMemoryIdempotencyStore();
    let calls = 0;
    const run = (orgId: number): Promise<Response> =>
      withIdempotency(req(undefined, { method: 'POST', headers: { 'Idempotency-Key': 'k1' } }), { store, orgId }, async () =>
        successResponse({ n: ++calls }, 201),
      );
    const first = await run(1);
    const second = await run(1);
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await second.json()).toEqual(await first.json());
    await run(2);
    expect(calls).toBe(2);
  });
  const post = (path: string, payload: unknown, key = 'k1'): Request =>
    new Request(`https://hub.test${path}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  it('runs the handler once for two concurrent same-key requests; the loser gets 409 IN_PROGRESS', async () => {
    const store = createMemoryIdempotencyStore();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const handler = async (): Promise<Response> => {
      calls += 1;
      await gate;
      return successResponse({ n: calls }, 201);
    };
    const a = withIdempotency(post('/api/v1/apps', { name: 'x' }), { store, orgId: 1 }, handler);
    const b = withIdempotency(post('/api/v1/apps', { name: 'x' }), { store, orgId: 1 }, handler);
    const second = await b;
    expect(second.status).toBe(409);
    expect((await body(second)).error?.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    release();
    expect((await a).status).toBe(201);
    expect(calls).toBe(1);
    const replayed = await withIdempotency(post('/api/v1/apps', { name: 'x' }), { store, orgId: 1 }, handler);
    expect(replayed.headers.get('Idempotent-Replayed')).toBe('true');
    expect(calls).toBe(1);
  });

  it('binds the key to method + path and to the body (different body -> 422)', async () => {
    const store = createMemoryIdempotencyStore();
    let calls = 0;
    const handler = async (): Promise<Response> => successResponse({ n: ++calls }, 201);
    await withIdempotency(post('/api/v1/apps', { name: 'x' }), { store, orgId: 1 }, handler);
    const mismatch = await withIdempotency(post('/api/v1/apps', { name: 'y' }), { store, orgId: 1 }, handler);
    expect(mismatch.status).toBe(422);
    expect((await body(mismatch)).error?.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    const otherRoute = await withIdempotency(post('/api/v1/people', { name: 'x' }), { store, orgId: 1 }, handler);
    expect(otherRoute.status).toBe(201);
    expect(otherRoute.headers.get('Idempotent-Replayed')).toBeNull();
    expect(calls).toBe(2);
  });

  it('releases the reservation when the handler throws or returns 5xx, so a retry runs', async () => {
    const store = createMemoryIdempotencyStore();
    const opts = { store, orgId: 1, onError: (): void => undefined };
    await expect(
      withIdempotency(post('/api/v1/apps', { name: 'x' }), opts, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const five = await withIdempotency(post('/api/v1/apps', { name: 'x' }), opts, async () =>
      new Response('down', { status: 503 }),
    );
    expect(five.status).toBe(503);
    let ran = false;
    const retry = await withIdempotency(post('/api/v1/apps', { name: 'x' }), opts, async () => {
      ran = true;
      return successResponse({ ok: true }, 201);
    });
    expect(ran).toBe(true);
    expect(retry.status).toBe(201);
  });

  it('lets the handler read the request body after hashing', async () => {
    const store = createMemoryIdempotencyStore();
    const request = post('/api/v1/apps', { name: 'z' });
    const res = await withIdempotency(request, { store, orgId: 1 }, async () => successResponse(await request.json(), 201));
    expect(await body(res)).toMatchObject({ data: { name: 'z' } });
  });
});

describe('openapi', () => {
  const app = z.object({ slug: z.string(), name: z.string() });
  const routes = [
    defineRoute({ method: 'get', path: '/api/v1/apps', auth: 'apiKey', response: z.array(app), permissions: ['apps:read'] }),
    defineRoute({
      method: 'post',
      path: '/api/v1/apps',
      auth: 'apiKey',
      request: { body: z.object({ name: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/) }) },
      response: { schema: app, status: 201 },
      errors: [ApiErrorCode.CONFLICT],
    }),
    defineRoute({
      method: 'get',
      path: '/api/v1/apps/{slug}/me',
      auth: 'connectBearer',
      request: { params: z.object({ slug: z.string() }) },
      response: z.object({ sub: z.string() }),
    }),
    defineRoute({ method: 'get', path: '/api/v1/openapi.json', auth: 'none', response: z.record(z.unknown()) }),
    defineRoute({ method: 'get', path: '/api/v1/catalog', auth: ['none', 'apiKey'], response: z.array(app) }),
  ];

  it('builds a 3.1 doc with both security schemes, the shared error schema and per-route security', () => {
    const doc = buildOpenApiDocument(routes, { title: 'Hub', version: '1.0.0' });
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.components?.securitySchemes ?? {}).sort()).toEqual(['apiKey', 'connectBearer']);
    expect(doc.components?.schemas?.ApiError).toBeDefined();
    const list = doc.paths?.['/api/v1/apps']?.get;
    expect(list?.security).toEqual([{ apiKey: [] }]);
    expect(list?.responses?.['403']).toBeDefined();
    expect(doc.paths?.['/api/v1/apps']?.post?.responses?.['201']).toBeDefined();
    expect(doc.paths?.['/api/v1/apps']?.post?.responses?.['409']).toBeDefined();
    expect(doc.paths?.['/api/v1/apps/{slug}/me']?.get?.security).toEqual([{ connectBearer: [] }]);
    expect(doc.paths?.['/api/v1/openapi.json']?.get?.security).toEqual([]);
    // 'none' + a scheme = optional auth, not public.
    expect(doc.paths?.['/api/v1/catalog']?.get?.security).toEqual([{}, { apiKey: [] }]);
  });

  it('validates requests from the same schemas (422 envelope on failure)', () => {
    const create = routes[1]!;
    expect(parseRouteRequest(create, { body: { name: 'A', slug: 'a-1' } }).body).toEqual({ name: 'A', slug: 'a-1' });
    try {
      parseRouteRequest(create, { body: { name: '', slug: 'Bad Slug' } });
      expect.unreachable();
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(422);
    }
  });

  it('contract helper passes on a match and names undocumented + stale routes', () => {
    const doc = buildOpenApiDocument(routes, { title: 'Hub', version: '1.0.0' });
    const actual = [
      { method: 'GET', path: '/api/v1/apps' },
      { method: 'POST', path: '/api/v1/apps' },
      { method: 'GET', path: nextRoutePathToOpenApi('/api/v1/apps/[slug]/me') },
      { method: 'GET', path: '/api/v1/openapi.json' },
      { method: 'GET', path: '/api/v1/catalog' },
    ];
    expect(() => assertRoutesDocumented(actual, doc)).not.toThrow();
    const drift = [...actual.slice(1), { method: 'GET', path: '/api/v1/people/{sub}/apps' }];
    expect(diffRoutesAgainstDocument(drift, doc)).toEqual({
      undocumented: ['GET /api/v1/people/{sub}/apps'],
      stale: ['GET /api/v1/apps'],
    });
    expect(() => assertRoutesDocumented(drift, doc)).toThrow(/undocumented route: GET \/api\/v1\/people/);
  });

  it('rejects duplicate routes', () => {
    expect(() => buildOpenApiDocument([routes[0]!, routes[0]!], { title: 'x', version: '1' })).toThrow(/duplicate/);
  });
});

describe('keys', () => {
  it('timingSafeEqualString', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualString('', '')).toBe(true);
    expect(timingSafeEqualString('é', 'e\u0301')).toBe(false);
  });
});

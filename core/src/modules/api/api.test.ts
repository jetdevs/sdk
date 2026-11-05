import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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
      checkRateLimit: async () => ({ allowed: false, limit: 10, remaining: 0, resetAt: Math.floor(Date.now() / 1000) + 30 }),
    });
    const r = await limited(req(`Bearer ${VALID_KEY}`), ok);
    expect(r.status).toBe(429);
    expect(r.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(r.headers.get('Retry-After')).not.toBeNull();

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
  });
});

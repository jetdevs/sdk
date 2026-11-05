/**
 * REST API guard — `withApiAuth` + `ApiContext`.
 *
 * Ported from cadra-web `src/lib/api/auth.ts` (635L, the richest copy: cache
 * that stores data not verdicts, live re-check on cache hit, rate-limit
 * headers, handler error wrapping). Everything app-specific is injected:
 *
 * - `resolveApiKey`  — hashed key → context (the app's `api_keys` lookup,
 *                      revoked/expired/creator checks, permissions).
 * - `verifyBearer`   — a bearer token that is NOT an API key (e.g. a Connect
 *                      OIDC access token checked against JWKS) → context.
 * - `revalidate`     — live checks that must run on EVERY use, cache hit
 *                      included (cadra: credential epoch, creator access).
 * - `withOrgContext` — sets the RLS org context (`rls.current_org_id`) around
 *                      the handler, so core never imports an app db.
 * - `checkRateLimit` — optional per-key limiter.
 *
 * Deliberately NOT ported: cadra's internal-key branch that trusted a caller
 * `X-Org-Id` header. Org always comes from the server-owned key row / verified
 * token. Unexpected handler errors now return 500 INTERNAL_ERROR (cadra
 * returned 401 INVALID_API_KEY for them).
 *
 * @module @jetdevs/core/api
 */

import { hashApiKey, validateApiKeyFormat } from '../api-keys/key-generation';
import {
  ApiError,
  errorResponse,
  handleUnknownError,
  insufficientPermissions,
  invalidApiKey,
  expiredApiKey,
  revokedApiKey,
  rateLimited,
} from './errors';
import type { ApiContextCache } from './cache';

export type ApiAuthMethod = 'apiKey' | 'bearer';

/** Authenticated context for one REST request. Org comes from a server-owned row or a verified token. */
export interface ApiContext<TOrgId extends string | number = number> {
  orgId: TOrgId;
  /** Acting user (key creator / token subject's local user). Null for system keys. */
  userId: number | string | null;
  /** API key row id (apiKey method only) for audit. */
  apiKeyId: number | string | null;
  /** Permission slugs (`resource:action`). `'*'` grants all. */
  permissions: string[];
  authMethod: ApiAuthMethod;
  /** Requests per window for this key, when the app tracks one. */
  rateLimit?: number;
  /** Token subject (`sub`) for bearer auth. */
  subject?: string;
}

/** Result of an API key lookup. `null` = no such (unrevoked) key. */
export type ApiKeyResolution<TCtx> =
  | { ok: true; context: TCtx }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' }
  | null;

/**
 * Limiter verdict. Times are epoch MILLISECONDS, same unit as
 * `@jetdevs/framework/rate-limit` (map its `resetAt` to `resetAtMs`).
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAtMs: number;
}

export interface ApiAuthConfig<TCtx extends ApiContext<string | number>> {
  resolveApiKey?: (input: { key: string; keyHash: string }) => Promise<ApiKeyResolution<TCtx>>;
  verifyBearer?: (token: string) => Promise<TCtx | null>;
  /**
   * Decide whether a bearer token is an API key. Default: matches one of
   * `keyPrefixes` (via `validateApiKeyFormat`), or — without prefixes — is
   * not JWT-shaped.
   */
  isApiKey?: (token: string) => boolean;
  keyPrefixes?: string[];
  revalidate?: (context: TCtx) => Promise<boolean>;
  withOrgContext?: <T>(context: TCtx, fn: () => Promise<T>) => Promise<T>;
  /**
   * Optional per-key limiter, e.g. with `@jetdevs/framework/rate-limit`:
   * `async (ctx) => { const r = await limiter.check(String(ctx.apiKeyId)); return { ...r, resetAtMs: r.resetAt }; }`
   */
  checkRateLimit?: (context: TCtx) => Promise<RateLimitResult>;
  /** Cache of resolved API key contexts (keyed by key hash). */
  cache?: ApiContextCache<TCtx>;
  /** Called after a successful API key auth (e.g. schedule last-used update). */
  onAuthenticated?: (context: TCtx) => void;
  hasPermissions?: (context: TCtx, required: readonly string[]) => boolean;
  logger?: (message: string, meta?: unknown) => void;
}

export interface ApiRouteAuthOptions {
  /** All-of permission slugs required for this route. */
  permissions?: readonly string[];
  /** Accepted methods. Default: every method the config can verify. */
  accept?: readonly ApiAuthMethod[];
}

export type ApiAuthResult<TCtx> =
  | { ok: true; context: TCtx; rateLimit?: RateLimitResult }
  | { ok: false; error: ApiError; rateLimit?: RateLimitResult };

/** `Bearer <token>` → token, else null. Scheme match is exact (cadra behaviour). */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) return null;
  return parts[1];
}

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

/** All-of check; `'*'` grants everything. */
export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  if (required.length === 0) return true;
  if (granted.includes('*')) return true;
  return required.every((p) => granted.includes(p));
}

export function getRateLimitHeaders(status: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(status.limit),
    'X-RateLimit-Remaining': String(Math.max(0, status.remaining)),
    // Header carries unix seconds (framework `rateLimitHeaders` does the same).
    'X-RateLimit-Reset': String(Math.ceil(status.resetAtMs / 1000)),
  };
}

function applyHeaders(response: Response, headers: Record<string, string> | undefined): Response {
  if (!headers) return response;
  try {
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  } catch {
    // Immutable headers (e.g. a Response from fetch) — copy.
    const copy = new Response(response.body, response);
    for (const [k, v] of Object.entries(headers)) copy.headers.set(k, v);
    return copy;
  }
}

/** Authenticate a request without running a handler. */
export async function authenticateApiRequest<TCtx extends ApiContext<string | number>>(
  request: Request,
  config: ApiAuthConfig<TCtx>,
  route: ApiRouteAuthOptions = {},
): Promise<ApiAuthResult<TCtx>> {
  const log = config.logger ?? (() => undefined);
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return {
      ok: false,
      error: invalidApiKey('Missing or invalid Authorization header. Expected format: Bearer <token>'),
    };
  }

  const accept = route.accept ?? (['apiKey', 'bearer'] as const);
  const isApiKey =
    config.isApiKey ??
    ((t: string): boolean =>
      config.keyPrefixes && config.keyPrefixes.length > 0
        ? config.keyPrefixes.some((p) => validateApiKeyFormat(t, p))
        : !looksLikeJwt(t));

  let context: TCtx | null = null;

  if (isApiKey(token)) {
    if (!config.resolveApiKey || !accept.includes('apiKey')) {
      return { ok: false, error: invalidApiKey('API keys are not accepted on this route') };
    }
    const keyHash = hashApiKey(token);
    const cached = config.cache ? await config.cache.get(keyHash) : null;
    if (cached) {
      context = cached;
    } else {
      let resolution: ApiKeyResolution<TCtx>;
      try {
        resolution = await config.resolveApiKey({ key: token, keyHash });
      } catch (error) {
        log('[API Auth] resolveApiKey failed', error);
        return { ok: false, error: invalidApiKey('Invalid or expired API key') };
      }
      if (!resolution) return { ok: false, error: invalidApiKey('Invalid or expired API key') };
      if (!resolution.ok) {
        const error =
          resolution.reason === 'expired'
            ? expiredApiKey()
            : resolution.reason === 'revoked'
              ? revokedApiKey()
              : invalidApiKey('Invalid or expired API key');
        return { ok: false, error };
      }
      context = resolution.context;
    }
    // Live checks run on the cached path too: the cache holds data, not a verdict.
    if (config.revalidate && !(await config.revalidate(context))) {
      if (cached && config.cache) await config.cache.invalidate(keyHash);
      return { ok: false, error: invalidApiKey('Invalid or expired API key') };
    }
    if (!cached && config.cache) await config.cache.set(keyHash, context);
    config.onAuthenticated?.(context);
  } else {
    if (!config.verifyBearer || !accept.includes('bearer')) {
      return { ok: false, error: invalidApiKey('Bearer tokens are not accepted on this route') };
    }
    try {
      context = await config.verifyBearer(token);
    } catch (error) {
      log('[API Auth] verifyBearer failed', error);
      context = null;
    }
    if (!context) return { ok: false, error: invalidApiKey('Invalid or expired access token') };
    if (config.revalidate && !(await config.revalidate(context))) {
      return { ok: false, error: invalidApiKey('Invalid or expired access token') };
    }
  }

  const required = route.permissions ?? [];
  const allowed = config.hasPermissions
    ? config.hasPermissions(context, required)
    : hasAllPermissions(context.permissions, required);
  if (!allowed) return { ok: false, error: insufficientPermissions([...required]) };

  if (config.checkRateLimit) {
    const status = await config.checkRateLimit(context);
    if (!status.allowed) {
      const retryAfter = Math.max(1, Math.ceil((status.resetAtMs - Date.now()) / 1000));
      return { ok: false, error: rateLimited(retryAfter, status.limit), rateLimit: status };
    }
    return { ok: true, context, rateLimit: status };
  }
  return { ok: true, context };
}

export type ApiHandler<TReq extends Request, TCtx> = (request: TReq, context: TCtx) => Promise<Response>;

export type ApiGuard<TCtx> = <TReq extends Request>(
  request: TReq,
  handler: ApiHandler<TReq, TCtx>,
  route?: ApiRouteAuthOptions,
) => Promise<Response>;

/**
 * Build the app's REST guard from injected auth hooks.
 *
 * @example
 * export const guard = withApiAuth({ resolveApiKey, verifyBearer, withOrgContext });
 * export const GET = (req: NextRequest) =>
 *   guard(req, async (_req, ctx) => successResponse(await list(ctx.orgId)), { permissions: ['apps:read'] });
 */
export function withApiAuth<TCtx extends ApiContext<string | number>>(config: ApiAuthConfig<TCtx>): ApiGuard<TCtx> {
  return async function guard<TReq extends Request>(
    request: TReq,
    handler: ApiHandler<TReq, TCtx>,
    route: ApiRouteAuthOptions = {},
  ): Promise<Response> {
    const auth = await authenticateApiRequest(request, config, route);
    const rlHeaders = auth.rateLimit ? getRateLimitHeaders(auth.rateLimit) : undefined;
    if (!auth.ok) {
      const retry: Record<string, string> =
        auth.error.statusCode === 429 && typeof auth.error.details?.retryAfter === 'number'
          ? { 'Retry-After': String(auth.error.details.retryAfter) }
          : {};
      return errorResponse(auth.error, { ...rlHeaders, ...retry });
    }
    const ctx = auth.context;
    try {
      const run = (): Promise<Response> => handler(request, ctx);
      const response = config.withOrgContext ? await config.withOrgContext(ctx, run) : await run();
      return applyHeaders(response, rlHeaders);
    } catch (error) {
      return errorResponse(handleUnknownError(error), rlHeaders);
    }
  };
}

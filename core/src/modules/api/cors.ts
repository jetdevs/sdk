/**
 * CORS helpers for REST API routes.
 *
 * Ported from cadra-web `src/lib/api/cors.ts` (identical across core-saas,
 * yobo, crm). Uses Web `Request`/`Response` so it needs no `next/server`.
 *
 * @module @jetdevs/core/api
 */

/** Default CORS headers (cadra-web defaults; `X-Org-Id` dropped — org is never taken from a header). */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Accept, Idempotency-Key',
  'Access-Control-Max-Age': '86400', // 24 hours (app default)
};

export interface CorsOptions {
  origin?: string;
  methods?: string[];
  allowHeaders?: string[];
  /** Seconds. App default: 86400. */
  maxAge?: number;
}

export function createCorsHeaders(options: CorsOptions = {}): Record<string, string> {
  const headers: Record<string, string> = { ...CORS_HEADERS };
  if (options.origin) headers['Access-Control-Allow-Origin'] = options.origin;
  if (options.methods) headers['Access-Control-Allow-Methods'] = options.methods.join(', ');
  if (options.allowHeaders) headers['Access-Control-Allow-Headers'] = options.allowHeaders.join(', ');
  if (options.maxAge !== undefined) headers['Access-Control-Max-Age'] = String(options.maxAge);
  return headers;
}

export function handleCorsPreflightRequest(
  _request?: Request,
  headers: Readonly<Record<string, string>> = CORS_HEADERS,
): Response {
  return new Response(null, { status: 200, headers: { ...headers } });
}

export function withCorsHeaders<R extends Response>(
  response: R,
  headers: Readonly<Record<string, string>> = CORS_HEADERS,
): R {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

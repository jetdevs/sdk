/**
 * OpenAPI 3.1 from one source (spec p1 §6.4a).
 *
 * A route is defined once with zod request/response schemas; the same
 * definition validates requests (`parseRouteRequest`) and produces the
 * OpenAPI document (`buildOpenApiDocument`). No hand-written doc.
 *
 * Library: @asteasolutions/zod-to-openapi 7.x — the maintained zod→OpenAPI
 * generator whose 7.x line targets zod 3 (peer `zod ^3.20.2`; core ships zod
 * 3.25). 8.x requires zod 4.
 *
 * @module @jetdevs/core/api
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z, type AnyZodObject, type ZodTypeAny } from 'zod';
import { API_ERROR_STATUS, ApiErrorCode, fromZodError } from './errors';

extendZodWithOpenApi(z);

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** `connectBearer` = Connect OIDC access token; `apiKey` = `@jetdevs/core/api-keys` key; `none` = public. */
export type RouteAuth = 'connectBearer' | 'apiKey' | 'none';

export interface RouteRequestSchemas {
  params?: AnyZodObject;
  query?: AnyZodObject;
  headers?: AnyZodObject;
  body?: ZodTypeAny;
}

export interface RouteResponseSpec {
  /** Schema of `data` in `{ success: true, data }`. */
  schema: ZodTypeAny;
  /** Default 200. */
  status?: number;
  description?: string;
}

export interface RouteDefinitionInput<TReq extends RouteRequestSchemas = RouteRequestSchemas> {
  method: HttpMethod;
  /** OpenAPI path template, e.g. `/api/v1/apps/{slug}/me`. */
  path: string;
  auth: RouteAuth | readonly RouteAuth[];
  request?: TReq;
  response: ZodTypeAny | RouteResponseSpec;
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  /** Permission slugs (`resource:action`) required. Documented and usable by the guard. */
  permissions?: readonly string[];
  /** Extra error codes this route can return (beyond the auth/validation defaults). */
  errors?: readonly ApiErrorCode[];
}

export interface RouteDefinition<TReq extends RouteRequestSchemas = RouteRequestSchemas>
  extends Omit<RouteDefinitionInput<TReq>, 'auth' | 'response'> {
  auth: readonly RouteAuth[];
  response: RouteResponseSpec;
}

export function defineRoute<TReq extends RouteRequestSchemas>(
  input: RouteDefinitionInput<TReq>,
): RouteDefinition<TReq> {
  const auth: readonly RouteAuth[] = typeof input.auth === 'string' ? [input.auth] : input.auth;
  if (auth.length === 0) throw new Error(`defineRoute ${input.method} ${input.path}: auth must not be empty`);
  const response: RouteResponseSpec =
    input.response instanceof z.ZodType ? { schema: input.response } : input.response;
  return Object.freeze({ ...input, auth, response });
}

/** `GET /api/v1/apps/{slug}` — the identity used by the contract check. */
export function routeKey(route: { method: string; path: string }): string {
  return `${route.method.toUpperCase()} ${normalisePath(route.path)}`;
}

function normalisePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** Next.js app-dir path → OpenAPI template: `/api/v1/apps/[slug]/me` → `/api/v1/apps/{slug}/me`. */
export function nextRoutePathToOpenApi(path: string): string {
  return path.replace(/\[\.{3}([^\]]+)\]/g, '{$1}').replace(/\[([^\]]+)\]/g, '{$1}');
}

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

export interface ParsedRouteRequest<TReq extends RouteRequestSchemas> {
  params: Infer<TReq['params']>;
  query: Infer<TReq['query']>;
  headers: Infer<TReq['headers']>;
  body: Infer<TReq['body']>;
}

/**
 * Validate raw inputs against the route's schemas. Throws a 422 ApiError
 * (VALIDATION_ERROR envelope) on the first failing part.
 */
export function parseRouteRequest<TReq extends RouteRequestSchemas>(
  route: RouteDefinition<TReq>,
  raw: { params?: unknown; query?: unknown; headers?: unknown; body?: unknown },
): ParsedRouteRequest<TReq> {
  const out: Record<string, unknown> = {};
  for (const part of ['params', 'query', 'headers', 'body'] as const) {
    const schema = route.request?.[part];
    if (!schema) {
      out[part] = undefined;
      continue;
    }
    const result = schema.safeParse(raw[part]);
    if (!result.success) throw fromZodError(result.error);
    out[part] = result.data;
  }
  return out as unknown as ParsedRouteRequest<TReq>;
}

/** URLSearchParams → plain object (repeated keys become arrays) for `query` parsing. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  params.forEach((value, key) => {
    const prev = out[key];
    out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  });
  return out;
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface BuildOpenApiOptions {
  servers?: { url: string; description?: string }[];
  /** App-specific error codes to list alongside the core codes. */
  extraErrorCodes?: readonly string[];
}

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

const SECURITY_SCHEME: Record<Exclude<RouteAuth, 'none'>, string> = {
  connectBearer: 'connectBearer',
  apiKey: 'apiKey',
};

function errorSchemaFor(codes: readonly string[]): ZodTypeAny {
  return z
    .object({
      success: z.literal(false),
      error: z.object({
        code: z.string().openapi({ description: `Error code. One of: ${codes.join(', ')}`, example: 'NOT_FOUND' }),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      }),
    })
    .openapi('ApiError', { description: 'Error envelope returned by every non-2xx response.' });
}

function statusesFor(route: RouteDefinition): Map<number, string[]> {
  const byStatus = new Map<number, string[]>();
  const add = (code: ApiErrorCode): void => {
    const status = API_ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  };
  const isPublic = route.auth.length === 1 && route.auth[0] === 'none';
  if (!isPublic) {
    add(ApiErrorCode.INVALID_API_KEY);
    add(ApiErrorCode.INSUFFICIENT_PERMISSIONS);
    add(ApiErrorCode.RATE_LIMITED);
  }
  if (route.request && Object.values(route.request).some(Boolean)) add(ApiErrorCode.VALIDATION_ERROR);
  for (const code of route.errors ?? []) add(code);
  add(ApiErrorCode.INTERNAL_ERROR);
  return byStatus;
}

/** Build one OpenAPI 3.1 document from route definitions. */
export function buildOpenApiDocument(
  routes: readonly RouteDefinition[],
  info: OpenApiInfo,
  options: BuildOpenApiOptions = {},
): OpenApiDocument {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'connectBearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Cadra Connect (OIDC) access token. For apps acting for a signed-in person.',
  });
  registry.registerComponent('securitySchemes', 'apiKey', {
    type: 'http',
    scheme: 'bearer',
    description:
      'Org-scoped API key from @jetdevs/core/api-keys, sent as `Authorization: Bearer <key>`. For machines and Cadra tools.',
  });

  const codes = [...Object.values(ApiErrorCode), ...(options.extraErrorCodes ?? [])];
  const errorSchema = registry.register('ApiError', errorSchemaFor(codes));

  const seen = new Set<string>();
  for (const route of routes) {
    const key = routeKey(route);
    if (seen.has(key)) throw new Error(`buildOpenApiDocument: duplicate route ${key}`);
    seen.add(key);

    // ['none'] alone = public (`security: []`). 'none' plus a scheme = optional
    // auth: the empty requirement `{}` lets the call through unauthenticated.
    const schemes = route.auth.filter((a): a is Exclude<RouteAuth, 'none'> => a !== 'none');
    const schemeReqs = schemes.map((a) => ({ [SECURITY_SCHEME[a]]: [] as string[] }));
    const security: Array<Record<string, string[]>> =
      schemes.length === 0 ? [] : route.auth.includes('none') ? [{}, ...schemeReqs] : schemeReqs;

    const responses: RouteConfig['responses'] = {
      [route.response.status ?? 200]: {
        description: route.response.description ?? 'Success',
        content: {
          'application/json': {
            schema: z.object({ success: z.literal(true), data: route.response.schema }),
          },
        },
      },
    };
    for (const [status, statusCodes] of statusesFor(route)) {
      responses[status] = {
        description: statusCodes.join(' | '),
        content: { 'application/json': { schema: errorSchema } },
      };
    }

    const permissionNote = route.permissions?.length
      ? `Requires permissions: ${route.permissions.join(', ')}.`
      : undefined;
    const description = [route.description, permissionNote].filter(Boolean).join('\n\n') || undefined;

    registry.registerPath({
      method: route.method,
      path: route.path,
      summary: route.summary,
      description,
      tags: route.tags,
      operationId: route.operationId,
      security,
      request: {
        params: route.request?.params,
        query: route.request?.query,
        headers: route.request?.headers,
        body: route.request?.body
          ? { content: { 'application/json': { schema: route.request.body } } }
          : undefined,
      },
      responses,
    });
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: info.title,
      version: info.version,
      ...(info.description !== undefined ? { description: info.description } : {}),
    },
    ...(options.servers ? { servers: options.servers } : {}),
  });
}

export interface RouteDocDiff {
  /** Routes that exist but have no doc entry. */
  undocumented: string[];
  /** Doc entries with no matching route. */
  stale: string[];
}

const DOC_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

export function diffRoutesAgainstDocument(
  routes: readonly { method: string; path: string }[],
  doc: { paths?: Record<string, unknown> },
): RouteDocDiff {
  const actual = new Set(routes.map(routeKey));
  const documented = new Set<string>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of DOC_METHODS) {
      if (method in item) documented.add(routeKey({ method, path }));
    }
  }
  return {
    undocumented: [...actual].filter((k) => !documented.has(k)).sort(),
    stale: [...documented].filter((k) => !actual.has(k)).sort(),
  };
}

/**
 * Contract test helper: throws if a route exists without a doc entry, or the
 * doc lists a route that does not exist. Pass the app's real route table
 * (e.g. discovered from `src/app/api/v1/**\/route.ts` via
 * `nextRoutePathToOpenApi`) as `routes`.
 */
export function assertRoutesDocumented(
  routes: readonly { method: string; path: string }[],
  doc: { paths?: Record<string, unknown> },
): void {
  const { undocumented, stale } = diffRoutesAgainstDocument(routes, doc);
  if (undocumented.length || stale.length) {
    const lines = [
      ...undocumented.map((k) => `  undocumented route: ${k}`),
      ...stale.map((k) => `  doc lists missing route: ${k}`),
    ];
    throw new Error(`OpenAPI contract mismatch:\n${lines.join('\n')}`);
  }
}

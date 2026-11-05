/**
 * REST API error envelope + error codes.
 *
 * Ported from cadra-web `src/lib/api/errors.ts` (the extended 600L copy;
 * core-saas/yobo/crm share the 516L base). App-specific codes (cadra p86
 * platform-credit codes) are dropped; the tRPC bridge mapping is kept because
 * every app's REST layer forwards tRPC errors.
 *
 * The response helpers return a standard Web `Response`, so they work with
 * Next.js route handlers (NextResponse extends Response) and any fetch-style
 * server, without importing `next/server`.
 *
 * Wire shape (spec p1 §6.4a): `{ success: false, error: { code, message, details? } }`.
 *
 * @module @jetdevs/core/api
 */

import { z, ZodError } from 'zod';
import { CORS_HEADERS } from './cors';

export enum ApiErrorCode {
  // Authentication & Authorization (401, 403)
  INVALID_API_KEY = 'INVALID_API_KEY',
  EXPIRED_API_KEY = 'EXPIRED_API_KEY',
  REVOKED_API_KEY = 'REVOKED_API_KEY',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Client Errors (400, 404, 409, 410, 422)
  INVALID_REQUEST = 'INVALID_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  GONE = 'GONE',
  IDEMPOTENCY_IN_PROGRESS = 'IDEMPOTENCY_IN_PROGRESS',
  IDEMPOTENCY_KEY_MISMATCH = 'IDEMPOTENCY_KEY_MISMATCH',

  // Rate Limiting (429)
  RATE_LIMITED = 'RATE_LIMITED',

  // Server Errors (500, 503)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

/** Every code with its HTTP status — used by the OpenAPI doc to list codes. */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  [ApiErrorCode.INVALID_API_KEY]: 401,
  [ApiErrorCode.EXPIRED_API_KEY]: 401,
  [ApiErrorCode.REVOKED_API_KEY]: 401,
  [ApiErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ApiErrorCode.INVALID_REQUEST]: 400,
  [ApiErrorCode.VALIDATION_ERROR]: 422,
  [ApiErrorCode.NOT_FOUND]: 404,
  [ApiErrorCode.CONFLICT]: 409,
  [ApiErrorCode.GONE]: 410,
  [ApiErrorCode.IDEMPOTENCY_IN_PROGRESS]: 409,
  [ApiErrorCode.IDEMPOTENCY_KEY_MISMATCH]: 422,
  [ApiErrorCode.RATE_LIMITED]: 429,
  [ApiErrorCode.INTERNAL_ERROR]: 500,
  [ApiErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ApiErrorCode.DATABASE_ERROR]: 500,
};

export type ApiErrorDetails = Record<string, unknown>;

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetails;
  };
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Zod schema of the error envelope — the single source for the OpenAPI doc. */
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode | string,
    message: string,
    public statusCode: number,
    public details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// Authentication (401)
export function invalidApiKey(message = 'Invalid or missing API key'): ApiError {
  return new ApiError(ApiErrorCode.INVALID_API_KEY, message, 401);
}
export function expiredApiKey(message = 'API key has expired'): ApiError {
  return new ApiError(ApiErrorCode.EXPIRED_API_KEY, message, 401);
}
export function revokedApiKey(message = 'API key has been revoked'): ApiError {
  return new ApiError(ApiErrorCode.REVOKED_API_KEY, message, 401);
}

// Authorization (403)
export function insufficientPermissions(
  required: string[],
  message = 'Insufficient permissions for this operation',
): ApiError {
  return new ApiError(ApiErrorCode.INSUFFICIENT_PERMISSIONS, message, 403, { required });
}

// Client (400, 422)
export function invalidRequest(message = 'Invalid request', details?: ApiErrorDetails): ApiError {
  return new ApiError(ApiErrorCode.INVALID_REQUEST, message, 400, details);
}
export function validationError(
  errors: Record<string, string[]>,
  message = 'Validation failed',
): ApiError {
  return new ApiError(ApiErrorCode.VALIDATION_ERROR, message, 422, { errors });
}

// Resource (404, 409, 410)
export function notFound(resource: string, id?: string | number): ApiError {
  const message =
    id !== undefined && id !== null ? `${resource} with ID ${id} not found` : `${resource} not found`;
  return new ApiError(ApiErrorCode.NOT_FOUND, message, 404, { resource, id });
}
export function conflict(message = 'Resource conflict', details?: ApiErrorDetails): ApiError {
  return new ApiError(ApiErrorCode.CONFLICT, message, 409, details);
}
export function gone(message = 'This endpoint has been retired', details?: ApiErrorDetails): ApiError {
  return new ApiError(ApiErrorCode.GONE, message, 410, details);
}

// Idempotency (409, 422)
export function idempotencyInProgress(
  message = 'A request with this Idempotency-Key is still being processed. Retry later.',
): ApiError {
  return new ApiError(ApiErrorCode.IDEMPOTENCY_IN_PROGRESS, message, 409);
}
export function idempotencyKeyMismatch(
  message = 'This Idempotency-Key was already used with a different request body.',
): ApiError {
  return new ApiError(ApiErrorCode.IDEMPOTENCY_KEY_MISMATCH, message, 422);
}

// Rate limiting (429)
export function rateLimited(retryAfter: number, limit: number, window: string = '1 hour'): ApiError {
  return new ApiError(
    ApiErrorCode.RATE_LIMITED,
    `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
    429,
    { limit, window, retryAfter },
  );
}

// Server (500, 503)
export function internalError(message = 'Internal server error', details?: ApiErrorDetails): ApiError {
  return new ApiError(ApiErrorCode.INTERNAL_ERROR, message, 500, details);
}
export function serviceUnavailable(
  service: string,
  message = 'Service temporarily unavailable',
): ApiError {
  return new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, message, 503, { service });
}
export function databaseError(
  message = 'Database operation failed',
  details?: ApiErrorDetails,
): ApiError {
  return new ApiError(ApiErrorCode.DATABASE_ERROR, message, 500, details);
}

/** Convert a ZodError to a 422 VALIDATION_ERROR keyed by dotted path. */
export function fromZodError(error: ZodError): ApiError {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    (errors[path] ??= []).push(issue.message);
  }
  return validationError(errors);
}

/** Build the error envelope body without wrapping it in a Response. */
export function toErrorBody(error: ApiError): ApiErrorResponse {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    },
  };
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
  const h = new Headers(CORS_HEADERS);
  h.set('Content-Type', 'application/json');
  if (headers) new Headers(headers).forEach((value, key) => h.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function errorResponse(error: ApiError, headers?: HeadersInit): Response {
  return jsonResponse(toErrorBody(error), error.statusCode, headers);
}

export function successResponse<T>(data: T, statusCode: number = 200, headers?: HeadersInit): Response {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return jsonResponse(body, statusCode, headers);
}

/**
 * Normalise any thrown value to an ApiError. Unknown errors become a generic
 * 500 so internals are never exposed to the client.
 */
export function handleUnknownError(
  error: unknown,
  log: (message: string, error: unknown) => void = console.error,
): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) return fromZodError(error);
  const trpc = fromTrpcLikeError(error);
  if (trpc) return trpc;
  log('[API] Unhandled error:', error);
  return internalError('An unexpected error occurred');
}

export async function withErrorHandler<T>(handler: () => Promise<T>): Promise<T | ApiError> {
  try {
    return await handler();
  } catch (error) {
    return handleUnknownError(error);
  }
}

// tRPC bridge error shape (cadra-web p85 S1 review B1). Duck-typed so this
// module does not import @trpc/server.
const TRPC_STATUS: Readonly<Record<string, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

const TRPC_TO_API_CODE: Readonly<Record<string, ApiErrorCode>> = {
  BAD_REQUEST: ApiErrorCode.INVALID_REQUEST,
  UNAUTHORIZED: ApiErrorCode.INVALID_API_KEY,
  FORBIDDEN: ApiErrorCode.INSUFFICIENT_PERMISSIONS,
  NOT_FOUND: ApiErrorCode.NOT_FOUND,
  CONFLICT: ApiErrorCode.CONFLICT,
  UNPROCESSABLE_CONTENT: ApiErrorCode.VALIDATION_ERROR,
  TOO_MANY_REQUESTS: ApiErrorCode.RATE_LIMITED,
  SERVICE_UNAVAILABLE: ApiErrorCode.SERVICE_UNAVAILABLE,
};

/** Map a TRPCError-shaped value (`name === 'TRPCError'`, `code`) to an ApiError, else null. */
export function fromTrpcLikeError(error: unknown): ApiError | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { name?: unknown; code?: unknown; message?: unknown };
  if (e.name !== 'TRPCError' || typeof e.code !== 'string' || !(e.code in TRPC_STATUS)) return null;
  const message = typeof e.message === 'string' && e.message ? e.message : 'An error occurred while processing your request';
  return new ApiError(
    TRPC_TO_API_CODE[e.code] ?? ApiErrorCode.INTERNAL_ERROR,
    message,
    TRPC_STATUS[e.code] ?? 500,
    { trpcCode: e.code },
  );
}

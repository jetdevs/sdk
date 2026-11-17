/**
 * Standardized authentication error helpers.
 *
 * Ported from cadra-web `src/lib/auth-errors.ts` (core-saas/crm copies are
 * identical bar one cast). Builds on the SDK `AuthErrorCode` / `AuthError` /
 * `AuthResponse` types; pure, client-safe.
 */
import { AuthErrorCode, type AuthError, type AuthResponse } from './types';

export function createAuthError(code: AuthErrorCode, message: string, details?: Record<string, unknown>): AuthError {
  return { code, message, details };
}

export function createAuthResponse<T = unknown>(success: boolean, data?: T, error?: AuthError): AuthResponse<T> {
  return {
    success,
    data,
    error: error ? { code: error.code, message: error.message, details: error.details } : undefined,
    timestamp: new Date().toISOString(),
  };
}

export const AuthErrors = {
  invalidCredentials: (email?: string): AuthError =>
    createAuthError(AuthErrorCode.INVALID_CREDENTIALS, 'Invalid email or password', { email }),
  userNotFound: (email?: string): AuthError =>
    createAuthError(AuthErrorCode.USER_NOT_FOUND, 'User account not found', { email }),
  accountDisabled: (email?: string): AuthError =>
    createAuthError(AuthErrorCode.ACCOUNT_DISABLED, 'Account has been disabled', { email }),
  rateLimited: (retryAfter?: number): AuthError =>
    createAuthError(AuthErrorCode.RATE_LIMITED, `Too many attempts. Try again in ${retryAfter || 'a few'} seconds`, {
      retryAfter,
    }),
  weakPassword: (requirements?: string[]): AuthError =>
    createAuthError(AuthErrorCode.WEAK_PASSWORD, 'Password does not meet security requirements', { requirements }),
  databaseError: (operation?: string): AuthError =>
    createAuthError(AuthErrorCode.DATABASE_ERROR, 'Database operation failed', { operation }),
  sessionExpired: (): AuthError =>
    createAuthError(AuthErrorCode.SESSION_EXPIRED, 'Your session has expired. Please log in again'),
  insufficientPermissions: (required?: string[]): AuthError =>
    createAuthError(AuthErrorCode.INSUFFICIENT_PERMISSIONS, 'You do not have permission to perform this action', {
      required,
    }),
  invalidToken: (type?: string): AuthError =>
    createAuthError(AuthErrorCode.INVALID_TOKEN, 'Invalid or expired token', { type }),
  networkError: (details?: string): AuthError =>
    createAuthError(AuthErrorCode.NETWORK_ERROR, 'Network connection failed', { details }),
};

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  [AuthErrorCode.INVALID_CREDENTIALS]: 'Invalid email or password',
  [AuthErrorCode.USER_NOT_FOUND]: 'User account not found',
  [AuthErrorCode.ACCOUNT_DISABLED]: 'Account has been disabled',
  [AuthErrorCode.RATE_LIMITED]: 'Too many attempts. Please try again later',
  [AuthErrorCode.WEAK_PASSWORD]: 'Password does not meet security requirements',
  [AuthErrorCode.DATABASE_ERROR]: 'A system error occurred. Please try again',
  [AuthErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please log in again',
  [AuthErrorCode.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action',
  [AuthErrorCode.INVALID_TOKEN]: 'Invalid or expired token',
  [AuthErrorCode.NETWORK_ERROR]: 'Network connection failed. Please check your connection',
};

export function getUserFriendlyMessage(error: AuthError): string {
  return error.message || AUTH_ERROR_MESSAGES[error.code] || 'An unexpected error occurred';
}

const RETRYABLE: readonly AuthErrorCode[] = [
  AuthErrorCode.NETWORK_ERROR,
  AuthErrorCode.DATABASE_ERROR,
  AuthErrorCode.RATE_LIMITED,
];

export function isRetryableError(error: AuthError): boolean {
  return RETRYABLE.includes(error.code);
}

/** Retry delay in seconds. Defaults are the app copies' current values. */
export function getRetryDelay(error: AuthError): number {
  switch (error.code) {
    case AuthErrorCode.RATE_LIMITED: {
      const retryAfter = error.details?.retryAfter;
      return typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 60;
    }
    case AuthErrorCode.NETWORK_ERROR:
      return 5;
    case AuthErrorCode.DATABASE_ERROR:
      return 10;
    default:
      return 0;
  }
}

const SENSITIVE_KEYS = ['password', 'token', 'sessionToken', 'accessToken', 'refreshToken', 'idToken'] as const;

/** Error → log record with secret-bearing context keys removed. */
export function formatErrorForLogging(
  error: AuthError,
  context?: Record<string, unknown>,
): { code: string; message: string; context?: Record<string, unknown>; timestamp: string } {
  let safe: Record<string, unknown> | undefined;
  if (context) {
    safe = { ...context };
    for (const key of SENSITIVE_KEYS) delete safe[key];
  }
  return { code: error.code, message: error.message, context: safe, timestamp: new Date().toISOString() };
}

export function isValidAuthResponse<T>(response: unknown): response is AuthResponse<T> {
  if (typeof response !== 'object' || response === null) return false;
  const r = response as { success?: unknown; timestamp?: unknown; error?: unknown };
  if (typeof r.success !== 'boolean' || typeof r.timestamp !== 'string') return false;
  if (r.error === undefined) return true;
  const e = r.error as { code?: unknown; message?: unknown } | null;
  return typeof e === 'object' && e !== null && typeof e.code === 'string' && typeof e.message === 'string';
}

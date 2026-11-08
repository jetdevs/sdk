import type { ErrorEntryDef } from '../types';

/** E1000–E1099: failures any app can hit. */
export const COMMON = {
  'common.invalid_input': {
    ref: 'E1001', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "Something in that request isn't right. Please check it and change it.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The input was rejected as invalid.', fix: 'Do not resend the same input. Fix the field named in the detail, or ask the merchant for the value.', ask: null, retry: false },
    owner: 'core', aliases: ['BAD_REQUEST', 'VALIDATION_ERROR', 'INVALID_REQUEST', 'INVALID_PAYLOAD', 'invalid_input', 'invalid_request', '400:invalid_request'],
  },
  'common.unauthorized': {
    ref: 'E1002', kind: 'needs_merchant', http: 401, trpc: 'UNAUTHORIZED',
    fallback: 'Please sign in again to go on.',
    forward: ['sign_in'], resumes: false,
    agent: { reason: 'The caller is not signed in or the key is invalid.', fix: 'Stop. Do not retry. Tell the merchant to sign in again.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['UNAUTHORIZED', 'INVALID_API_KEY', 'unauthorized'],
  },
  'common.forbidden': {
    ref: 'E1003', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "Your account doesn't have access to this.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The caller lacks permission for this action.', fix: 'Stop. Do not retry. Do not try another tool to get around it.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['FORBIDDEN', 'INSUFFICIENT_PERMISSIONS', 'PERMISSION_DENIED', 'forbidden', 'permission_denied'],
  },
  'common.not_found': {
    ref: 'E1004', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "I couldn't find that. It may have been removed.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The record does not exist or is not visible to this org.', fix: 'Do not retry with the same id. Look the record up again or let the merchant pick another.', ask: null, retry: false },
    owner: 'core', aliases: ['NOT_FOUND', 'not_found'],
  },
  'common.conflict': {
    ref: 'E1005', kind: 'retryable', http: 409, trpc: 'CONFLICT',
    fallback: 'That changed while you were working on it. Please try again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The record changed since it was read.', fix: 'Read the record again, then retry once with the fresh version.', ask: null, retry: true },
    owner: 'core', aliases: ['CONFLICT', 'conflict', 'version_conflict', '409:version_conflict', 'remix_conflict'],
  },
  'common.rate_limited': {
    ref: 'E1006', kind: 'retryable', http: 429, trpc: 'TOO_MANY_REQUESTS',
    fallback: 'Too many requests right now. Please try again in a minute.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'A rate limit answered 429.', fix: 'Wait, then retry once. Do not loop.', ask: null, retry: true },
    owner: 'core', aliases: ['TOO_MANY_REQUESTS', 'RATE_LIMITED', 'rate_limited'],
  },
  'common.unavailable': {
    ref: 'E1007', kind: 'retryable', http: 503, trpc: 'SERVICE_UNAVAILABLE',
    fallback: "This isn't available right now. Please try again in a minute.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'A service we depend on is down or unreachable.', fix: 'Retry once. If it fails again, tell the merchant it is down and stop.', ask: null, retry: true },
    owner: 'core', aliases: ['SERVICE_UNAVAILABLE', 'UNAVAILABLE', 'provider_failed', 'upstream_failed', 'UPSTREAM_API', 'platform_unavailable'],
  },
  'common.timeout': {
    ref: 'E1008', kind: 'retryable', http: 504, trpc: 'TIMEOUT',
    fallback: 'That took too long. Please try again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The call ran out of time.', fix: 'Retry once. Do not loop.', ask: null, retry: true },
    owner: 'core', aliases: ['TIMEOUT', 'GATEWAY_TIMEOUT', 'timed_out', 'deadline_exceeded'],
  },
  'common.internal': {
    ref: 'E1009', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: "Something went wrong on our side. We've been told and are looking at it.",
    forward: [], resumes: false,
    agent: { reason: 'An unexpected error (a bug on our side).', fix: 'Stop. Do not retry. Tell the merchant we are looking at it.', ask: null, retry: false },
    owner: 'core', aliases: ['INTERNAL_SERVER_ERROR', 'INTERNAL_ERROR', 'DATABASE_ERROR', 'UNKNOWN_ERROR', 'internal_error'],
  },
} as const satisfies Record<string, ErrorEntryDef>;

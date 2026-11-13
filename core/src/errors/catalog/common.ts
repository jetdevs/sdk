import type { ErrorEntryDef } from '../types';

/** E1000–E1099: failures any app can hit. */
export const COMMON = {
  'common.invalid_input': {
    ref: 'E1001', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "Something in that request isn't right. Please check it and change it.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The input was rejected as invalid.', fix: 'Do not resend the same input. Fix the field named in the detail, or ask the merchant for the value.', ask: null, retry: false },
    owner: 'core', aliases: ['BAD_REQUEST', 'VALIDATION_ERROR', 'INVALID_REQUEST', 'INVALID_PAYLOAD', 'invalid_input', 'invalid_request', '400:invalid_request', 'invalid_payload', 'invalid_email', 'invalid_phone', 'phone_invalid', 'amount_invalid', 'currency_invalid', 'paid_at_invalid', 'validation_error', 'TARGET_REQUIRED', 'invalid_body'],
  },
  'common.unauthorized': {
    ref: 'E1002', kind: 'needs_merchant', http: 401, trpc: 'UNAUTHORIZED',
    fallback: 'Please sign in again to go on.',
    forward: ['sign_in'], resumes: false,
    agent: { reason: 'The caller is not signed in or the key is invalid.', fix: 'Nothing ran. The same call gets the same answer until the merchant signs in again or the key is fixed.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['UNAUTHORIZED', 'unauthorized'],
  },
  'common.forbidden': {
    ref: 'E1003', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "Your account doesn't have access to this.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The caller lacks permission for this action.', fix: 'Nothing ran: this caller has no permission for this action, and a different tool for the same action needs the same permission. Offer what you can do instead.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['FORBIDDEN', 'INSUFFICIENT_PERMISSIONS', 'PERMISSION_DENIED', 'forbidden', 'permission_denied', 'not_allowed', 'correction_unauthorized', 'org_not_found'],
  },
  'common.not_found': {
    ref: 'E1004', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "I couldn't find that. It may have been removed.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The record does not exist or is not visible to this org.', fix: 'Do not retry with the same id. Look the record up again or let the merchant pick another.', ask: null, retry: false },
    owner: 'core', aliases: ['NOT_FOUND', 'not_found', 'file_not_found', 'set_not_found', 'board_not_found', 'customer_not_found', 'CAMPAIGN_NOT_FOUND', 'PLAN_NOT_FOUND', 'send_not_found', 'ORG_NOT_FOUND'],
  },
  'common.conflict': {
    ref: 'E1005', kind: 'retryable', http: 409, trpc: 'CONFLICT',
    fallback: 'That changed while you were working on it. Please try again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The record changed since it was read.', fix: 'Read the record again, then retry once with the fresh version.', ask: null, retry: true },
    owner: 'core', aliases: ['CONFLICT', 'conflict', 'version_conflict', '409:version_conflict', 'remix_conflict', 'stale_campaign', 'stale_ad_campaign', 'outlet_changed'],
  },
  'common.rate_limited': {
    ref: 'E1006', kind: 'retryable', http: 429, trpc: 'TOO_MANY_REQUESTS',
    fallback: 'Too many requests right now. Please try again in a minute.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'A rate limit answered 429.', fix: "Do not retry now; retry once when the tool reports it ready or on the merchant's next message.", ask: null, retry: true },
    owner: 'core', aliases: ['TOO_MANY_REQUESTS', 'RATE_LIMITED', 'rate_limited', 'THROTTLED', 'RATE_LIMIT_EXCEEDED', 'META_RATE_LIMITED'],
  },
  'common.unavailable': {
    ref: 'E1007', kind: 'retryable', http: 503, trpc: 'SERVICE_UNAVAILABLE',
    fallback: "This isn't available right now. Please try again in a minute.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'A service we depend on is down or unreachable.', fix: 'Retry once. If it fails again, tell the merchant it is down and stop.', ask: null, retry: true },
    owner: 'core', aliases: ['SERVICE_UNAVAILABLE', 'UNAVAILABLE', 'provider_failed', 'upstream_failed', 'UPSTREAM_API', 'platform_unavailable', 'transport_error', 'send_failed', 'POOL_SATURATED', 'QUEUE_ERROR', 'JEV_UNAVAILABLE', 'CHAT_IDENTITY_FAILED', 'CHAT_ACCESS_UNAVAILABLE', 'engine_unreachable'],
  },
  'common.timeout': {
    ref: 'E1008', kind: 'retryable', http: 504, trpc: 'TIMEOUT',
    fallback: 'That took too long. Please try again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The call ran out of time.', fix: 'Retry once. Do not loop.', ask: null, retry: true },
    owner: 'core', aliases: ['TIMEOUT', 'GATEWAY_TIMEOUT', 'timed_out', 'deadline_exceeded', 'RUN_TIMEOUT', 'CHAT_ACCESS_TIMEOUT'],
  },
  'common.internal': {
    ref: 'E1009', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'An unexpected error (a bug on our side).', fix: 'Nothing ran because of a fault on our side. The same call gets the same answer until it is fixed. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'core', aliases: ['INTERNAL_SERVER_ERROR', 'INTERNAL_ERROR', 'DATABASE_ERROR', 'UNKNOWN_ERROR', 'internal_error', 'adapter_error', 'push_error'],
  },
} as const satisfies Record<string, ErrorEntryDef>;

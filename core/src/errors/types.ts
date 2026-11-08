/**
 * Error catalog types (spec: _context/core-sdk/_specs/error-catalog/specs.md).
 *
 * Zero runtime dependencies on purpose (D9): Fastify services (cadra-api, msg-api, engage-api,
 * commerce) import this without the Next/React/tRPC stack.
 */

/**
 * What kind of failure this is. The kind decides which forward buttons are legal (D3):
 * - `retryable`: the same action can work later → `try_again` allowed.
 * - `blocked`: this path cannot work → never `try_again`; offer change / pick another.
 * - `needs_merchant`: works once the merchant does something (top up, connect, sign in).
 * - `internal`: our bug → generic copy, alert, no merchant action.
 */
export type ErrorKind = 'retryable' | 'blocked' | 'needs_merchant' | 'internal';

/** The closed set of next actions a surface can draw (D5). Max 3 per entry (WhatsApp cap). */
export type ForwardKey =
  | 'try_again'
  | 'top_up'
  | 'upgrade'
  | 'change'
  | 'pick_other'
  | 'sign_in'
  | 'connect'
  | 'open_app'
  | 'contact_support';

/** tRPC v11 error code names, copied so the root entry needs no `@trpc/server`. */
export type TRPCCodeName =
  | 'PARSE_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'PAYMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_SUPPORTED'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNPROCESSABLE_CONTENT'
  | 'TOO_MANY_REQUESTS'
  | 'CLIENT_CLOSED_REQUEST'
  | 'INTERNAL_SERVER_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT';

/**
 * What the agent does with this failure: the p152 refusal shape (D6).
 * Catalog `agent` text is prompt content: any edit needs the agents lead's APPROVED line.
 */
export interface AgentHint {
  /** One line: why it failed. */
  reason: string;
  /** What the agent does now. */
  fix: string;
  /** What to ask the merchant, or null to ask nothing. Non-null requires forward keys (the answers). */
  ask: string | null;
  /** Whether the agent may call the same thing again. */
  retry: boolean;
}

/** One catalog entry as written in a domain file (the code is the record key). */
export interface ErrorEntryDef {
  /** Permanent, never reused. `E` + 4 digits in the domain's block. */
  ref: string;
  kind: ErrorKind;
  http: number;
  trpc: TRPCCodeName;
  /** English sentence shown only when the app's copy store has no row for `error.<code>`. */
  fallback: string;
  forward: readonly ForwardKey[];
  /** True when the work starts again by itself once the merchant does the forward action. */
  resumes: boolean;
  agent: AgentHint;
  /** Lane or team that owns the fix. */
  owner: string;
  /** Legacy spellings this entry replaces (`402:credits_short`, `NO_CREDITS` …). */
  aliases?: readonly string[];
}

/** A resolved entry: the definition plus its code and copy key. */
export interface ErrorEntry extends ErrorEntryDef {
  code: string;
  /** Managed copy key, `error.<code>`. */
  copyKey: string;
}

/** Values filled into `{name}` placeholders in a copy row. */
export type ErrorParams = Readonly<Record<string, string | number>>;

/**
 * The credential-write seam — the ONE place every SDK password writer hashes
 * and writes (p77 specs.md §5.1, D26; feedback P77-21 round 5).
 *
 * WHY: the estate maintenance window (D26, invariant I7) promises that no
 * credential write lands anywhere in the estate while a row moves between
 * authorities. "Every writer checks a flag" is not enforceable across ten SDK
 * call sites and four apps; one seam is. The operator's arming settle (45 s)
 * counts on a bound this module makes true: a write admitted just before the
 * switch went on has either committed or died within 20 s of its admission.
 *
 * The contract of `withCredentialWrite(deps, { operation, db }, fn)`:
 *
 * 1. Calls the app's `credentialWriteGate` if one was injected. A thrown
 *    `CredentialWriteRefusedError('maintenance')` (or any throw) propagates:
 *    nothing is hashed, no transaction is opened, nothing is written. A
 *    MISSING gate admits — the Cadra apps pass none and keep today's
 *    behaviour.
 * 2. Records `admittedAt`, then opens the transaction IMMEDIATELY and, as its
 *    first three statements, `SET LOCAL statement_timeout = '10s'`,
 *    `SET LOCAL lock_timeout = '5s'`,
 *    `SET LOCAL idle_in_transaction_session_timeout = '10s'`.
 * 3. Runs `fn(tx)` — the caller hashes AND writes inside it, on `tx`.
 * 4. Commits only while `now < admittedAt + 10 s`; later, it rolls back and
 *    throws `CredentialWriteRefusedError('write_deadline')`. A statement,
 *    lock or idle timeout raised by the three settings is reported as the same
 *    `write_deadline` refusal (the original error is its `cause`).
 *
 * Transport mapping: `CredentialWriteRefusedError` IS a tRPC error with code
 * `SERVICE_UNAVAILABLE` (HTTP 503), so a router handler that lets it escape
 * answers 503 with no app-side mapping. A route handler answers
 * `credentialWriteRefusedResponse(error)`: `503 { error: <reason> }` with
 * `Retry-After: 60`.
 *
 * Caveat an app must know: when the handle passed in is ALREADY a transaction
 * (an RLS wrapper's), the seam's transaction is a savepoint. The three
 * `SET LOCAL`s then hold until the OUTER transaction ends, and the deadline
 * governs the savepoint release, not the outer commit.
 *
 * Nothing here names a provider, reads an environment variable, or sees a
 * plaintext password or a hash.
 */

import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';

// =============================================================================
// TYPES
// =============================================================================

/** Which writer is asking to be admitted. */
export type CredentialWriteGateOperation =
  | 'register'
  | 'create'
  | 'invite'
  | 'update'
  | 'change-password'
  | 'reset-consume';

export interface CredentialWriteGateContext {
  operation: CredentialWriteGateOperation;
  /**
   * The handle the writer holds when it asks. `null` for a writer that holds
   * no handle outside its own runner (the password-reset service).
   */
  db: any;
}

/**
 * The app's admission rule. Resolves to admit; throws to refuse — normally
 * `CredentialWriteRefusedError('maintenance')`. p77 apps pass
 * `assertNotInMaintenance` from `@jetdevs/connect`.
 */
export type CredentialWriteGate = (ctx: CredentialWriteGateContext) => Promise<void>;

/** The subset of a writer's dependencies the seam reads. */
export interface CredentialWriteDeps {
  credentialWriteGate?: CredentialWriteGate;
}

export type CredentialWriteRefusalReason = 'maintenance' | 'write_deadline';

export interface CredentialWriteOptions {
  operation: CredentialWriteGateOperation;
  /** Passed to the gate, and — absent `runTransaction` — the handle whose `transaction()` opens the write. */
  db: any;
  /**
   * Opens the transaction instead of `db.transaction(fn)`. For writers whose
   * app supplies a transaction runner (the password-reset service's
   * `runPrivilegedTransaction`).
   */
  runTransaction?: <R>(fn: (tx: any) => Promise<R>) => Promise<R>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** A write must reach commit within this many ms of its admission. */
export const CREDENTIAL_WRITE_DEADLINE_MS = 10_000;

/** What a refused writer tells the client to wait, in seconds. */
export const CREDENTIAL_WRITE_RETRY_AFTER_SECONDS = 60;

/** The first three statements of every credential-write transaction, in order. */
export const CREDENTIAL_WRITE_SET_LOCALS = [
  "SET LOCAL statement_timeout = '10s'",
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL idle_in_transaction_session_timeout = '10s'",
] as const;

/**
 * SQLSTATEs the three settings raise: statement_timeout / query_canceled
 * (57014), lock_not_available (55P03), idle_in_transaction_session_timeout
 * (25P03).
 */
const TIMEOUT_SQLSTATES = new Set(['57014', '55P03', '25P03']);

const REFUSAL_MESSAGES: Record<CredentialWriteRefusalReason, string> = {
  maintenance: 'Sign-in and password changes are paused for maintenance. Please try again in a minute',
  write_deadline: 'The password change could not be completed in time. Please try again in a minute',
};

// =============================================================================
// ERROR
// =============================================================================

/**
 * The seam's refusal. A tRPC `SERVICE_UNAVAILABLE` (503) by construction.
 *
 * `name` stays `'TRPCError'` on purpose: tRPC recognises an error thrown from a
 * different copy of `@trpc/server` (a `link:` SDK next to the app's own copy)
 * by that name, and would otherwise wrap it as INTERNAL_SERVER_ERROR. Identify
 * it with `isCredentialWriteRefused`, never `instanceof` — the SDK bundles each
 * entry point separately, so `@jetdevs/core/users` and `@jetdevs/core/auth`
 * carry different copies of this class.
 */
export class CredentialWriteRefusedError extends TRPCError {
  readonly kind = 'credential_write_refused' as const;
  readonly reason: CredentialWriteRefusalReason;
  readonly status = 503 as const;
  readonly retryAfterSeconds = CREDENTIAL_WRITE_RETRY_AFTER_SECONDS;

  constructor(reason: CredentialWriteRefusalReason, options: { cause?: unknown; message?: string } = {}) {
    super({
      code: 'SERVICE_UNAVAILABLE',
      message: options.message ?? REFUSAL_MESSAGES[reason],
      ...(options.cause !== undefined && { cause: options.cause as Error }),
    });
    this.reason = reason;
  }
}

export function isCredentialWriteRefused(error: unknown): error is CredentialWriteRefusedError {
  return (
    error instanceof CredentialWriteRefusedError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { kind?: unknown }).kind === 'credential_write_refused' &&
      typeof (error as { reason?: unknown }).reason === 'string')
  );
}

/**
 * The route face of a refusal: `503 { error: 'maintenance' | 'write_deadline' }`
 * with `Retry-After: 60` and `Cache-Control: no-store`.
 */
export function credentialWriteRefusedResponse(error: CredentialWriteRefusedError): Response {
  return new Response(JSON.stringify({ error: error.reason }), {
    status: 503,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(error.retryAfterSeconds ?? CREDENTIAL_WRITE_RETRY_AFTER_SECONDS),
      'cache-control': 'no-store',
    },
  });
}

// =============================================================================
// THE SEAM
// =============================================================================

function sqlStateOf(error: unknown): string | undefined {
  let e: any = error;
  for (let depth = 0; e && depth < 4; depth++) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
    e = e.cause;
  }
  return undefined;
}

export async function withCredentialWrite<T>(
  deps: CredentialWriteDeps | undefined,
  options: CredentialWriteOptions,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  const { operation, db } = options;

  // 1. Admission. A missing gate admits; any throw refuses with nothing done.
  if (deps?.credentialWriteGate) {
    await deps.credentialWriteGate({ operation, db });
  }

  // 2. Admitted: the transaction opens now, not after a hash.
  const admittedAt = Date.now();
  const runTransaction =
    options.runTransaction ??
    (<R>(body: (tx: any) => Promise<R>): Promise<R> => {
      if (!db || typeof db.transaction !== 'function') {
        // Fail closed: a credential write never runs outside the seam's transaction.
        throw new Error(`withCredentialWrite(${operation}): the db handle has no transaction()`);
      }
      return db.transaction(body);
    });

  try {
    return await runTransaction(async (tx: any) => {
      for (const statement of CREDENTIAL_WRITE_SET_LOCALS) {
        await tx.execute(sql.raw(statement));
      }

      // 3. The caller hashes and writes, on tx.
      const result = await fn(tx);

      // 4. Commit only inside the deadline; throwing here rolls tx back.
      if (Date.now() >= admittedAt + CREDENTIAL_WRITE_DEADLINE_MS) {
        throw new CredentialWriteRefusedError('write_deadline');
      }
      return result;
    });
  } catch (error) {
    if (isCredentialWriteRefused(error)) throw error;
    const state = sqlStateOf(error);
    if (state && TIMEOUT_SQLSTATES.has(state)) {
      throw new CredentialWriteRefusedError('write_deadline', { cause: error });
    }
    throw error;
  }
}

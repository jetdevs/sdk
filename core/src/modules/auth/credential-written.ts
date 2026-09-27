/**
 * Credential-written hook — the one place every successful local verifier
 * write announces itself.
 *
 * `local-credential-policy.ts` answers WHETHER a local verifier may be
 * written. `credential-owner.ts` answers WHERE the credential lives, and is
 * asked BEFORE the write. This module is the other end of the same wire: it
 * fires AFTER a write has succeeded, so an app can record an audit row, send a
 * notice, or revoke derived access without reimplementing that per writer.
 *
 * The contract is deliberately narrow:
 *
 * - It fires ONLY on a write that actually stored a verifier. A refusal (any
 *   non-local owner), a failed current-password compare, a validation error,
 *   an invite or create that carried no password — none of those fire it.
 *   Exactly one call per successful write.
 * - It fires INSIDE the writer's transaction when the writer has one, so the
 *   record and the write commit or roll back together. Where the writer has no
 *   transaction it fires immediately after the successful write, and the `db`
 *   handle is the same one the write used.
 * - Errors PROPAGATE. The hook exists to make a write observable, and an audit
 *   record that can be dropped silently is not a control. Inside a transaction
 *   a throw rolls the write back; outside one the write stands and the caller
 *   sees the error. An app that prefers a lost record to a failed write
 *   swallows inside its own implementation.
 *
 * Nothing here names a provider, reads an environment variable, or receives a
 * plaintext password or a stored hash.
 */

import type { LocalCredentialWriteOperation } from './local-credential-policy';

/**
 * Which writer stored the verifier. These are the write operations of
 * `LocalCredentialWriteOperation`; `reset-request` is absent because minting a
 * link writes no verifier.
 */
export type CredentialWriteOperation =
  /** Public self-registration created the user with a password. */
  | 'register'
  /** An invitation created the user and it carried a password. */
  | 'invite'
  /** An admin created the user and it carried a password. */
  | 'create'
  /** An admin set a password on an existing user. */
  | 'update'
  /** The user changed their own password. */
  | 'change-password'
  /** A password-reset link was consumed and the new password written. */
  | 'reset';

/** Compile-time proof that the vocabulary stays a subset of the write guard's. */
type _CredentialWriteOperationIsAWriteOperation =
  CredentialWriteOperation extends LocalCredentialWriteOperation ? true : never;
const _credentialWriteOperationIsAWriteOperation: _CredentialWriteOperationIsAWriteOperation = true;
void _credentialWriteOperationIsAWriteOperation;

export interface CredentialWrittenArgs {
  /**
   * The database handle the write went through — the TRANSACTION when the
   * writer has one (today: the password-reset service), otherwise the same
   * handle the writer used. An app recording a row writes it on this handle,
   * never on one of its own, or it leaves the transaction's guarantee behind.
   */
  db: any;
  /** The user whose credential was written. */
  userId: number;
  /** Which writer wrote it. */
  operation: CredentialWriteOperation;
  /**
   * Who performed the write, when the writer knows and it is not necessarily
   * the subject — an admin `update`, an `invite`, a `create`. Absent for
   * `register` (no session yet) and for `reset` (the link is the actor).
   * Present and equal to `userId` for `change-password`.
   */
  actorUserId?: number;
  /**
   * True when the user held NO stored verifier immediately before this write:
   * a brand-new user, or a reset that set the first password on an account
   * that never had one. An app distinguishing "password set" from "password
   * changed" reads this rather than re-deriving it.
   */
  firstSet: boolean;
  /** When the write happened. */
  at: Date;
}

/**
 * Fired after a successful local credential write. See the module comment for
 * the firing rules; errors propagate.
 */
export type OnCredentialWritten = (
  args: CredentialWrittenArgs,
) => Promise<void> | void;

/** The subset of a writer's dependencies that carries the hook. */
export interface CredentialWrittenDeps {
  onCredentialWritten?: OnCredentialWritten;
}

/**
 * Fire the hook if one was injected. A writer calls this exactly once, on the
 * success path only, and never inside a `try` that would swallow the throw.
 */
export async function announceCredentialWritten(
  hook: OnCredentialWritten | undefined,
  args: CredentialWrittenArgs,
): Promise<void> {
  if (!hook) return;
  await hook(args);
}

/**
 * Local credential write policy — a caller-supplied guard.
 *
 * Some apps hand ownership of a user's password to an external identity
 * provider. Once that has happened, the SDK's own credential writers
 * (registration, invitation, admin create/update, change-password, the reset
 * flow) must not write a local verifier for that user, and must refuse
 * SERVER-SIDE — a form that no longer links to the writer is not a closed
 * writer.
 *
 * The SDK does not know which users are owned elsewhere, or by what rule. The
 * app does, so the app injects the rule: every credential-writing module takes
 * an optional `canWriteLocalCredential` dependency and asks it before it hashes
 * or stores anything. Absent the dependency, every write is allowed, which is
 * the pre-existing behaviour for every consumer that does not opt in.
 *
 * This module is deliberately generic. It carries no notion of WHY an app
 * refuses, only the shape of the question and the answer.
 */

/** Which writer is asking. */
export type LocalCredentialWriteOperation =
  /** Public self-registration creating a brand-new user with a password. */
  | 'register'
  /** Invitation creating a brand-new user (may carry a password). */
  | 'invite'
  /** Admin creation of a brand-new user (may carry a password). */
  | 'create'
  /** Admin update that sets a password on an existing user. */
  | 'update'
  /** The user changing their own password. */
  | 'change-password'
  /** Minting a password-reset link for an existing user. */
  | 'reset-request'
  /** Consuming a password-reset link and writing the new password. */
  | 'reset';

export interface LocalCredentialWriteArgs {
  /** The database handle the writer is operating on. */
  db: any;
  operation: LocalCredentialWriteOperation;
  /**
   * The existing user row the write targets, as the writer's repository loaded
   * it (all columns), or `null` when the write would CREATE the user.
   */
  user: any | null;
  /** The email the write targets; the only identifier when `user` is null. */
  email: string | null;
}

export type LocalCredentialWriteVerdict =
  | { allowed: true }
  | {
      allowed: false;
      /** Surfaced verbatim to the caller as the refusal message. */
      reason: string;
    };

/**
 * Decide whether a local credential may be written. Return `{ allowed: false }`
 * to refuse; each writer turns that into its own module's error shape.
 */
export type LocalCredentialWriteGuard = (
  args: LocalCredentialWriteArgs,
) => Promise<LocalCredentialWriteVerdict> | LocalCredentialWriteVerdict;

/**
 * Ask the guard, if one was injected. Returns the verdict; never throws, so a
 * writer can map a refusal to its own error class.
 */
export async function askLocalCredentialGuard(
  guard: LocalCredentialWriteGuard | undefined,
  args: LocalCredentialWriteArgs,
): Promise<LocalCredentialWriteVerdict> {
  if (!guard) return { allowed: true };
  return guard(args);
}

/**
 * `verifyLocalCredential` — the login form's password check, routed through
 * the credential owner port.
 *
 * Only a `local` owner is ever compared against the stored hash. Every other
 * kind (`external`, `frozen`, `none`) and a local user with no stored hash
 * still perform exactly ONE compare, against `deps.unverifiableHash`, so the
 * response time does not reveal which kind the email is. The result names
 * the kind for the CALLER; what the user sees is the app's decision.
 *
 * Nothing in the SDK calls this yet. Apps adopt it in their credentials
 * provider's `authorize`.
 */

import {
  askCredentialOwner,
  selectCredentialOwnerResolver,
  type CredentialOwner,
  type CredentialOwnerDeps,
} from './credential-owner';

export interface VerifyLocalCredentialDeps extends CredentialOwnerDeps {
  /** The database handle handed to the resolver. */
  db?: any;
  /** Compare plaintext against a stored hash (e.g. bcrypt.compare). */
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  /**
   * A valid hash of a value nobody knows, produced with the same algorithm
   * and cost as real verifiers. Every refusal path compares against it so a
   * refused login costs the same time as a failed local one.
   */
  unverifiableHash: string;
}

export interface VerifyLocalCredentialArgs {
  /** The user row as loaded by the app, or `null` when no row matched. */
  user: any | null;
  /** Plaintext the user typed. Never stored, never logged. */
  password: string;
  /** The email typed; the only identifier when `user` is null. */
  email?: string | null;
}

export type VerifyLocalCredentialResult =
  /** Local owner and the password matched. */
  | { ok: true; kind: 'local'; owner: CredentialOwner }
  /** Local owner; no match, or nothing stored to match against. */
  | { ok: false; kind: 'local'; reason: 'mismatch' | 'no-password' | 'no-user'; owner: CredentialOwner }
  /** Not ours to verify. The app routes the user by `owner`. */
  | { ok: false; kind: 'external' | 'frozen' | 'none'; reason: 'owned-elsewhere'; owner: CredentialOwner };

export async function verifyLocalCredential(
  deps: VerifyLocalCredentialDeps,
  args: VerifyLocalCredentialArgs,
): Promise<VerifyLocalCredentialResult> {
  const owner = await askCredentialOwner(selectCredentialOwnerResolver(deps), {
    db: deps.db ?? null,
    operation: 'verify',
    user: args.user,
    email: args.email ?? args.user?.email ?? null,
  });

  if (owner.kind !== 'local') {
    await deps.comparePassword(args.password, deps.unverifiableHash);
    return { ok: false, kind: owner.kind, reason: 'owned-elsewhere', owner };
  }

  if (!args.user) {
    await deps.comparePassword(args.password, deps.unverifiableHash);
    return { ok: false, kind: 'local', reason: 'no-user', owner };
  }

  const stored: unknown = args.user.password;
  if (typeof stored !== 'string' || stored.length === 0) {
    await deps.comparePassword(args.password, deps.unverifiableHash);
    return { ok: false, kind: 'local', reason: 'no-password', owner };
  }

  const matched = await deps.comparePassword(args.password, stored);
  return matched
    ? { ok: true, kind: 'local', owner }
    : { ok: false, kind: 'local', reason: 'mismatch', owner };
}

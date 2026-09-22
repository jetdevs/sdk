/**
 * Credential owner — the routing port behind every password operation.
 *
 * `local-credential-policy.ts` answers WHETHER a local verifier may be written.
 * This module answers WHERE a user's credential lives, which is the question
 * every writer AND the login path actually need: a password owned by another
 * system is not merely "refused" here, it is verified, changed and reset over
 * there, and each caller has to route the user accordingly.
 *
 * The SDK does not know which users are owned elsewhere or by what rule. The
 * app injects a `ResolveCredentialOwner`; absent one, `localOnlyOwner` is used
 * and every consumer that passes nothing keeps exactly the behaviour it has
 * today. An app that still passes the older yes/no `canWriteLocalCredential`
 * guard is adapted onto this port by `fromLocalCredentialGuard`, with the
 * same outcomes it had before.
 *
 * Nothing here names a provider, reads an environment variable, or logs a
 * verifier.
 */

import type {
  LocalCredentialWriteGuard,
  LocalCredentialWriteOperation,
} from './local-credential-policy';

// =============================================================================
// TYPES
// =============================================================================

/** Where a credential lives, as the app's resolver reports it. */
export type CredentialOwner =
  /** This app verifies and writes the credential. */
  | { kind: 'local' }
  /** Another system owns it; this app must route the user there. */
  | {
      kind: 'external';
      /** Issuer identifier of the owning system (e.g. its OIDC issuer URL). */
      issuer: string;
      /** The auth provider id the app signs the user in with for that issuer. */
      providerId: string;
      /** Where the user manages the credential (change password, profile). */
      accountUrl: string;
      /** Where the user starts a password reset with the owner. */
      resetUrl: string;
      /** Optional hint the app passes to the provider's sign-in call. */
      loginHint?: string;
      /**
       * Optional server-to-server forward of a reset request, so the owner
       * mints the link and sends the ONE email. Absent, a reset request for an
       * external user is silently dropped.
       */
      forwardResetRequest?: (email: string) => Promise<void>;
    }
  /** Fenced or mid-migration: nobody writes until it thaws. */
  | { kind: 'frozen'; reason: string }
  /** Unknown to this app AND to any owner it can ask. */
  | { kind: 'none' };

export type CredentialOwnerKind = CredentialOwner['kind'];

export type ExternalCredentialOwner = Extract<CredentialOwner, { kind: 'external' }>;
export type FrozenCredentialOwner = Extract<CredentialOwner, { kind: 'frozen' }>;

/**
 * Every writer's operation, plus the two read-side questions: `verify` (the
 * login form's password check) and `login-form` (which sign-in affordance to
 * render for an email).
 */
export type CredentialOwnerOperation =
  | LocalCredentialWriteOperation
  | 'verify'
  | 'login-form';

export interface ResolveCredentialOwnerArgs {
  /** The database handle the caller is operating on. */
  db: any;
  operation: CredentialOwnerOperation;
  /**
   * The existing user row, as the caller's repository loaded it (all
   * columns), or `null` when no row exists yet — a write that would CREATE the
   * user, or a login for an email this app has never seen.
   */
  user: any | null;
  /** The email in question; the only identifier when `user` is null. */
  email: string | null;
}

/** The app's rule. May be synchronous. */
export type ResolveCredentialOwner = (
  args: ResolveCredentialOwnerArgs,
) => Promise<CredentialOwner> | CredentialOwner;

/**
 * The subset of any writer's / verifier's dependencies that select a resolver.
 * `resolveCredentialOwner` wins; else the legacy guard is adapted; else every
 * credential is local.
 */
export interface CredentialOwnerDeps {
  resolveCredentialOwner?: ResolveCredentialOwner;
  canWriteLocalCredential?: LocalCredentialWriteGuard;
}

// =============================================================================
// RESOLVERS
// =============================================================================

const LOCAL: CredentialOwner = Object.freeze({ kind: 'local' }) as CredentialOwner;

/** The default: this app owns every credential. Zero behaviour change. */
export const localOnlyOwner: ResolveCredentialOwner = () => LOCAL;

/**
 * Adapt the yes/no `canWriteLocalCredential` guard onto the owner port.
 *
 * Allow → `local`; refuse → `frozen` carrying the guard's reason, which every
 * writer surfaces verbatim, exactly as it surfaced the guard's refusal before.
 * The guard was never asked on the read side, so `verify` and `login-form`
 * are `local` without consulting it.
 */
export function fromLocalCredentialGuard(
  guard: LocalCredentialWriteGuard,
): ResolveCredentialOwner {
  return async (args) => {
    if (args.operation === 'verify' || args.operation === 'login-form') {
      return LOCAL;
    }
    const verdict = await guard({
      db: args.db,
      operation: args.operation,
      user: args.user,
      email: args.email,
    });
    return verdict.allowed ? LOCAL : { kind: 'frozen', reason: verdict.reason };
  };
}

/**
 * Pick the resolver a module should use from its injected dependencies.
 * Precedence: `resolveCredentialOwner`, else the adapted guard, else local.
 */
export function selectCredentialOwnerResolver(
  deps: CredentialOwnerDeps | undefined,
): ResolveCredentialOwner {
  if (deps?.resolveCredentialOwner) return deps.resolveCredentialOwner;
  if (deps?.canWriteLocalCredential) return fromLocalCredentialGuard(deps.canWriteLocalCredential);
  return localOnlyOwner;
}

/**
 * Ask the resolver, if one was injected. Defaults to `local`. Never throws on
 * its own account, so a caller can map each kind to its own error shape.
 */
export async function askCredentialOwner(
  resolver: ResolveCredentialOwner | undefined,
  args: ResolveCredentialOwnerArgs,
): Promise<CredentialOwner> {
  if (!resolver) return LOCAL;
  return resolver(args);
}

// =============================================================================
// TYPED REFUSALS
// =============================================================================

/**
 * Thrown by a writer that was asked to create or set a credential another
 * system owns. Carries where the user should go instead; the app maps it to
 * its transport's error shape and its UI links out.
 */
export class CredentialOwnedElsewhereError extends Error {
  readonly code = 'OWNED_ELSEWHERE' as const;
  readonly owner: ExternalCredentialOwner;
  readonly operation: CredentialOwnerOperation;
  readonly accountUrl: string;
  readonly resetUrl: string;

  constructor(owner: ExternalCredentialOwner, operation: CredentialOwnerOperation) {
    super(`This account's password is managed by ${owner.issuer}`);
    this.name = 'CredentialOwnedElsewhereError';
    this.owner = owner;
    this.operation = operation;
    this.accountUrl = owner.accountUrl;
    this.resetUrl = owner.resetUrl;
  }
}

/** The message a `frozen` owner produces when the resolver gave no reason. */
export const FROZEN_CREDENTIAL_MESSAGE = 'This account cannot be changed right now. Please try again shortly';

/** The refusal message for a `frozen` owner: its reason, or the neutral default. */
export function frozenCredentialMessage(owner: FrozenCredentialOwner): string {
  return owner.reason || FROZEN_CREDENTIAL_MESSAGE;
}

/**
 * The value a writer returns instead of throwing when a change or admin
 * password update targets an `external` owner: the UI navigates there.
 */
export interface CredentialRedirect {
  /** Where the user changes the credential. */
  redirect: string;
  ownedBy: 'external';
  issuer: string;
  providerId: string;
  accountUrl: string;
  resetUrl: string;
  loginHint?: string;
}

export function credentialRedirect(owner: ExternalCredentialOwner): CredentialRedirect {
  return {
    redirect: owner.accountUrl,
    ownedBy: 'external',
    issuer: owner.issuer,
    providerId: owner.providerId,
    accountUrl: owner.accountUrl,
    resetUrl: owner.resetUrl,
    ...(owner.loginHint !== undefined && { loginHint: owner.loginHint }),
  };
}

export function isCredentialRedirect(value: unknown): value is CredentialRedirect {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as CredentialRedirect).ownedBy === 'external' &&
    typeof (value as CredentialRedirect).redirect === 'string'
  );
}

// =============================================================================
// READ HELPER
// =============================================================================

/**
 * Report where a user's credential lives, so an app can expose the kind to
 * its UI (e.g. hide the change-password form and link out instead). Asked as
 * `login-form` unless the caller names another operation.
 */
export async function credentialOwnerOf(
  deps: CredentialOwnerDeps & { db?: any },
  user: any | null,
  options: { email?: string | null; operation?: CredentialOwnerOperation } = {},
): Promise<CredentialOwner> {
  return askCredentialOwner(selectCredentialOwnerResolver(deps), {
    db: deps.db ?? null,
    operation: options.operation ?? 'login-form',
    user,
    email: options.email ?? user?.email ?? null,
  });
}

/**
 * p77 STORY-004 — `resolveConnectCredentialOwner`: the RP-side rule for WHERE
 * a user's credential lives (specs.md §5.2 `./server/owner`, §6.1, I2, I6).
 *
 * `@jetdevs/core`'s credential writers (register, invite, create, update,
 * change-password, the reset flow) and its login verifier each take a
 * `resolveCredentialOwner` and ask it before they compare, hash or store
 * anything. The SDK has no notion of Yobo Connect; this module is where it
 * lives, and each RP injects the resolver this builds. Every refusal is
 * server-side — a form that no longer links to a writer is not a closed
 * writer — and M2's triggers back the per-row half in the database.
 *
 * The rule is §6.1's table, read per user from `credential_authority`:
 *
 *   | authority  | owner      | writers                          | verify       |
 *   |------------|------------|----------------------------------|--------------|
 *   | `local`    | `local`    | the RP                           | bcrypt here  |
 *   | `prepared` | `local`    | the RP (a change re-stages)      | bcrypt here  |
 *   | `fenced`   | `frozen`   | NEITHER — "try again shortly"    | refused      |
 *   | `connect`  | `external` | Connect only — redirected        | refused      |
 *
 * A write on an `external` owner is a REDIRECT, never a proxy (I2): the RP
 * must not see a password Connect owns. A reset REQUEST may be forwarded
 * server-to-server (`forwardResetRequest`, no verifier on the wire).
 *
 * WHEN THERE IS NO ROW (`user == null`):
 *   - `verify` / `login-form` → `none`, no network call.
 *   - `register` / `invite` / `create` (the write would ALLOCATE an identity):
 *       flag ON  → ask Connect `email-held`: `held` → `external`; `free` →
 *                  the local D19 check (an email another local row holds in
 *                  a different spelling → `frozen` "already exists"), else
 *                  `none`; `unreachable` → `frozen` — FAIL-CLOSED: with the
 *                  flag on Connect is the allocator of every password-bearing
 *                  identity (M3), and an allocation Connect could not be
 *                  asked about is refused, not guessed.
 *       flag OFF → Connect is not asked; the local D19 check alone.
 *   - anything else → `none`.
 *
 * User-visible strings never name the identity provider (p79 D13); the
 * defaults say "the Yobo sign-in page" and every one is overridable.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/local-credential-policy.ts
 * Ported-From: cadra-web@b615864c:src/server/auth/credential-owner-trpc.ts (`credentialOwnerSummary`)
 */

import type { CredentialOwner, CredentialOwnerKind, ResolveCredentialOwner, ResolveCredentialOwnerArgs } from './types.js'
import type { ConnectOwnerClient } from './client.js'
import type { RpAdapter } from '../../adapter/index.js'

/** `credential_authority` values under which the RP may NOT write a verifier. */
export const CLOSED_AUTHORITIES: ReadonlySet<string> = new Set(['fenced', 'connect'])

export const REFUSED_CONNECT = 'This account’s password is changed on the Yobo sign-in page.'
export const REFUSED_FENCED = 'This account’s password cannot be changed right now. Try again shortly.'
export const REFUSED_ALLOCATION = 'New accounts are created on the Yobo sign-in page.'
export const REFUSED_EMAIL_TAKEN = 'An account with this email already exists.'
export const REFUSED_OWNER_UNVERIFIABLE = 'Accounts cannot be created right now. Try again shortly.'

/** Where, relative to the issuer, a user manages and resets the credential. */
export const CONNECT_ACCOUNT_SECURITY_PATH = '/account/security'
export const CONNECT_FORGOT_PASSWORD_PAGE_PATH = '/forgot-password'

const ALLOCATING_OPERATIONS: ReadonlySet<string> = new Set(['register', 'invite', 'create'])

export interface ConnectOwnerFlags {
  /** `YOBO_CONNECT_ENABLED` as this process serves it. Read per call. */
  connectEnabled: () => boolean
}

export interface ConnectOwnerResolverOptions {
  /** Issuer URL of Connect — the base of `accountUrl` and `resetUrl`, and the `external` owner's `issuer`. */
  issuer: string
  /** The NextAuth provider id the RP signs the user in with for that issuer (e.g. `yobo-connect`). */
  providerId: string
  /** The server-to-server client, or null when Connect is not configured. Resolved per call. */
  connectClient?: () => ConnectOwnerClient | null
  /**
   * D19's local check: does another local row hold this email in any spelling? Given the
   * caller's db handle. Default: none (the resolver then answers `none` for a free email).
   */
  emailHeldLocally?: (db: any, email: string) => Promise<boolean>
  messages?: Partial<{
    connect: string
    fenced: string
    allocation: string
    emailTaken: string
    ownerUnverifiable: string
  }>
}

/**
 * Build the RP's resolver. `adapter` supplies `readAuthority` for callers
 * that pass a user id but no row; a loaded row's `credentialAuthority` /
 * `credential_authority` column is read directly (no I/O) when present.
 */
export function resolveConnectCredentialOwner(
  adapter: Pick<RpAdapter, 'readAuthority'> | null,
  flags: ConnectOwnerFlags,
  options: ConnectOwnerResolverOptions,
): ResolveCredentialOwner {
  const issuer = options.issuer.trim().replace(/\/+$/, '')
  const clientOf = options.connectClient ?? (() => null)
  const msg = {
    connect: options.messages?.connect ?? REFUSED_CONNECT,
    fenced: options.messages?.fenced ?? REFUSED_FENCED,
    allocation: options.messages?.allocation ?? REFUSED_ALLOCATION,
    emailTaken: options.messages?.emailTaken ?? REFUSED_EMAIL_TAKEN,
    ownerUnverifiable: options.messages?.ownerUnverifiable ?? REFUSED_OWNER_UNVERIFIABLE,
  }

  function external(email: string | null): CredentialOwner {
    const client = clientOf()
    return {
      kind: 'external',
      issuer,
      providerId: options.providerId,
      accountUrl: issuer + CONNECT_ACCOUNT_SECURITY_PATH,
      resetUrl: issuer + CONNECT_FORGOT_PASSWORD_PAGE_PATH,
      ...(email ? { loginHint: email } : {}),
      // Forwarded only when Connect is reachable server-to-server; without a client the SDK's
      // reset service drops the request silently (same body either way).
      ...(client ? { forwardResetRequest: (addr: string) => client.forwardResetRequest(addr) } : {}),
    }
  }

  async function authorityOf(user: any): Promise<string | null> {
    const direct = user?.credentialAuthority ?? user?.credential_authority
    if (typeof direct === 'string' && direct) return direct
    const id = Number(user?.id)
    if (adapter && Number.isInteger(id) && id > 0) {
      try {
        return (await adapter.readAuthority(id)).authority
      } catch {
        return null
      }
    }
    return null
  }

  function ownerOfAuthority(authority: string | null, email: string | null): CredentialOwner {
    if (authority === 'connect') return external(email)
    if (authority === 'fenced') return { kind: 'frozen', reason: msg.fenced }
    if (authority === null) {
      // A Connect-bound row whose authority could not be read is not written by this RP (I6, fail-closed).
      return { kind: 'frozen', reason: msg.fenced }
    }
    return { kind: 'local' }
  }

  async function allocationOwner(db: any, email: string): Promise<CredentialOwner> {
    if (flags.connectEnabled()) {
      const client = clientOf()
      if (!client) return { kind: 'frozen', reason: msg.ownerUnverifiable }
      const answer = await client.emailHeld(email)
      if (answer === 'held') return external(email)
      if (answer === 'unreachable') {
        console.warn('[connect owner] email-held unreachable with YOBO_CONNECT_ENABLED on — allocation refused (fail-closed)')
        return { kind: 'frozen', reason: msg.ownerUnverifiable }
      }
    }
    if (options.emailHeldLocally && (await options.emailHeldLocally(db, email))) {
      return { kind: 'frozen', reason: msg.emailTaken }
    }
    return { kind: 'none' }
  }

  return ({ db, user, operation, email }: ResolveCredentialOwnerArgs): CredentialOwner | Promise<CredentialOwner> => {
    if (user) {
      const direct = user?.credentialAuthority ?? user?.credential_authority
      const addr = email ?? user.email ?? null
      // Synchronous wherever the answer needs no I/O — every loaded row — so the login path
      // never awaits a network call.
      if (typeof direct === 'string' && direct) return ownerOfAuthority(direct, addr)
      return authorityOf(user).then((a) => ownerOfAuthority(a, addr))
    }
    // No row. The read side decides here, with no network call.
    if (!ALLOCATING_OPERATIONS.has(operation)) return { kind: 'none' }
    if (!email) return { kind: 'none' }
    return allocationOwner(db, email)
  }
}

/** What a user-facing payload says about where a credential lives (never the issuer). */
export interface CredentialOwnerSummary {
  kind: CredentialOwnerKind
  accountUrl?: string
  resetUrl?: string
}

export function credentialOwnerSummary(owner: CredentialOwner): CredentialOwnerSummary {
  if (owner.kind === 'external') return { kind: 'external', accountUrl: owner.accountUrl, resetUrl: owner.resetUrl }
  return { kind: owner.kind }
}

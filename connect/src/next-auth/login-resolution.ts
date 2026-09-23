/**
 * p77 STORY-005 — identifier-first login resolution (specs.md §5.2
 * `connectOwnerLoginResolution`, I1–I4, §7.3/§7.4).
 *
 * WHY. crm and yobo show an identifier first and only then decide: a
 * password field for a `local` owner, a redirect to Connect (with a
 * `login_hint`) for a Connect-owned account — never a password field for an
 * account Connect owns (the Cadra sign-in invariants). The decision is the
 * credential-owner resolver's (`resolveConnectCredentialOwner`, STORY-004);
 * this is the one place that turns an owner into a login-page answer.
 *
 * TIMING-NEUTRAL. An unknown email and a local email answer the SAME shape
 * (`password-field`) after the SAME minimum time: the resolver is always
 * called (with `user: null` when nothing matched), and every answer is held
 * to a floor, so the response time does not say whether the address exists.
 * `frozen` (an unreadable authority, an allocation refused) is answered as a
 * password field too — the compare fails closed downstream; the login page
 * must never say "we could not check".
 */

import type { CredentialOwner, ResolveCredentialOwner } from '../server/owner/types.js'

export type LoginResolution =
  | { kind: 'password-field' }
  | { kind: 'redirect'; issuer: string; providerId: string; loginHint: string }

export interface LoginResolutionOptions {
  /** Minimum wall time per answer, ms. Default 120. */
  minMs?: number
  /** Monotonic clock, ms. Default `performance.now`. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export type LoginResolver = (email: string, ctx: { db: unknown; user: unknown | null }) => Promise<LoginResolution>

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function resolutionForOwner(owner: CredentialOwner, email: string): LoginResolution {
  if (owner.kind === 'external') {
    return { kind: 'redirect', issuer: owner.issuer, providerId: owner.providerId, loginHint: owner.loginHint ?? email }
  }
  return { kind: 'password-field' }
}

/**
 * Build the login-page resolver from the owner resolver. The caller looks up
 * the user row itself (or passes null) — the resolver never learns from the
 * timing which it was.
 */
export function connectOwnerLoginResolution(resolver: ResolveCredentialOwner, options: LoginResolutionOptions = {}): LoginResolver {
  const minMs = Math.max(0, options.minMs ?? 120)
  const now = options.now ?? (() => performance.now())
  const sleep = options.sleep ?? defaultSleep
  return async (email, ctx) => {
    const started = now()
    const normalized = email.trim().toLowerCase()
    let answer: LoginResolution
    try {
      const owner = await resolver({ db: ctx.db, operation: 'login-form', user: ctx.user, email: normalized })
      answer = resolutionForOwner(owner, normalized)
    } catch {
      answer = { kind: 'password-field' }
    }
    const remaining = minMs - (now() - started)
    if (remaining > 0) await sleep(remaining)
    return answer
  }
}

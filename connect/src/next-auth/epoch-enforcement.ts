/**
 * p77 STORY-005 — epoch enforcement in the NextAuth `jwt` callback (D20,
 * specs.md §4.5, §9.3).
 *
 * WHY THE `jwt` CALLBACK. It is the only callback that can rewrite the token:
 * the access token (the introspection handle), the refresh token and the
 * epoch live on the JWT and never reach the client, and a refreshed pair is
 * written back in place. `session()` sees a token it cannot change and a
 * session the client can read, so nothing here touches it (§4.5).
 *
 * TWO MODES, ONE VERDICT (D20). `assertSessionTokenFresh` decides; this
 * module decides what to DO with a refusal:
 *   `warn`    — logs `[connect-epoch] would_refuse <reason>` and ADMITS. The
 *               24 h soak reads these lines; zero non-test lines is the flip
 *               condition.
 *   `enforce` — returns the refusal shape `{ ...token, userId: 0, sub: undefined }`,
 *               which every app's `session()` already reads as "no session"
 *               (the blacklist path's shape, cadra-web `auth-simple.ts:708`).
 * A legacy session (no `cv`/`aeid`, no access token — minted before the epoch
 * transport existed) is `no_epoch`: admitted in `warn`, refused in `enforce`,
 * never grandfathered (D15, D20).
 *
 * THE SIGN-IN PASS (`stampOnSignIn`) mirrors cadra-web `auth-simple.ts:882-910`:
 *   Connect provider → `stampConnectEpochOnSignIn` (introspect once, set-or-delete);
 *   an `app_local` epoch on `user.epoch` (OTP / chat-entry, D24) → issuer, sub,
 *   cv, kind `app_local`, no aeid; a DERIVED epoch (a bridge exchange) →
 *   inherited verbatim, never re-minted (§9.4); else `localCv` from
 *   `users.credential_version`. `authTime` is stamped once and never moved.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth-simple.ts (:694, :882)
 */

import {
  assertSessionTokenFresh,
  readLocalCredentialVersion,
  stampConnectEpochOnSignIn,
  type FreshnessDeps,
  type FreshnessVerdict,
  type SessionEpochToken,
} from '../server/revocation/freshness.js'

export type EpochEnforcementMode = 'warn' | 'enforce'

/** `YOBO_CONNECT_EPOCH_ENFORCEMENT`: only the exact word `enforce` enforces; anything else warns. */
export function resolveEpochEnforcementMode(raw: string | null | undefined): EpochEnforcementMode {
  return (raw ?? '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'warn'
}

export interface EpochEnforcementDeps extends FreshnessDeps {
  /** Where `would_refuse` lines go. Default `console`. */
  logger?: Pick<Console, 'error' | 'warn' | 'log'>
  /** Test seam: observe every verdict. */
  onVerdict?: (verdict: FreshnessVerdict, token: SessionEpochToken) => void
}

/** The shape every app's `session()` reads as "no session". */
export function refusedToken<T extends SessionEpochToken>(token: T): T & { userId: 0; sub: undefined } {
  return { ...token, userId: 0, sub: undefined }
}

export const WOULD_REFUSE_PREFIX = '[connect-epoch] would_refuse'

/**
 * The gate for an EXISTING token on every non-sign-in pass of the `jwt`
 * callback. Returns the token to keep (possibly with a rotated access-token
 * pair written in place) or the refusal shape.
 */
export function withEpochEnforcement(mode: EpochEnforcementMode, deps: EpochEnforcementDeps) {
  const logger = deps.logger ?? console
  return async <T extends SessionEpochToken & Record<string, unknown>>(token: T): Promise<T> => {
    // Freeze the fallback authTime on first use so it stops moving with iat (§4.5).
    if (typeof token.authTime !== 'number' && typeof token.iat === 'number') token.authTime = token.iat
    let verdict: FreshnessVerdict
    try {
      verdict = await assertSessionTokenFresh(token, deps)
    } catch (err) {
      // The primitive does not throw; if it ever does, a Connect-bound
      // credential must not slip through on the exception path.
      logger.error('[connect-epoch] freshness check threw:', err)
      verdict = { ok: false, reason: 'unreadable', facts: { version: null, active: null, epoch: null, grant: null, revokedAfter: null, checkedAt: deps.nowMs ?? Date.now() } }
      if (!token.connectIssuer) return token
    }
    deps.onVerdict?.(verdict, token)
    if (verdict.ok) return token
    if (mode === 'warn') {
      logger.warn(`${WOULD_REFUSE_PREFIX} ${verdict.reason}`, { userId: token.userId ?? null, kind: token.connectKind ?? (token.connectIssuer ? 'oidc' : 'local') })
      return token
    }
    logger.log('[connect-epoch] refused', { userId: token.userId ?? null, reason: verdict.reason })
    return refusedToken(token)
  }
}

/** What a sign-in hands the jwt callback on `user.epoch` (D24 app_local, or a bridge's derived lineage). */
export interface SignInEpoch {
  kind: 'app_local' | 'derived'
  issuer: string
  sub: string
  cv: number
  /** Present only on a derived (bridge) epoch of an oidc lineage. */
  aeid?: string | null
  grantId?: string | null
  sid?: string | null
  /** Derived only: the parent's immutable authTime, inherited verbatim. */
  authTime?: number
}

export interface StampOnSignInDeps extends FreshnessDeps {
  /** The Connect provider id configured on `ConnectProvider`. Default `connect`. */
  providerId?: string
}

/**
 * The sign-in pass: stamp the epoch the credential was minted under.
 * `userId` is passed explicitly because `token.userId` is written AFTER this
 * runs in every app's callback.
 */
export async function stampOnSignIn(
  token: SessionEpochToken & Record<string, unknown>,
  account: { provider?: string; access_token?: string; refresh_token?: string; expires_at?: number; id_token?: string } | null | undefined,
  user: { id?: string | number; epoch?: SignInEpoch | null } | null | undefined,
  deps: StampOnSignInDeps,
): Promise<void> {
  const nowS = Math.floor((deps.nowMs ?? Date.now()) / 1000)
  const userId = user?.id == null ? null : Number(user.id)
  const providerId = deps.providerId ?? 'connect'
  const inherited = user?.epoch ?? null

  // authTime: stamped ONCE. A derived credential inherits its parent's.
  if (inherited?.kind === 'derived' && typeof inherited.authTime === 'number') token.authTime = inherited.authTime
  else if (typeof token.authTime !== 'number') token.authTime = nowS

  // id_token_hint for sign-out — set-or-delete.
  const idToken = account?.provider === providerId ? account.id_token : undefined
  if (idToken) token.connectIdToken = idToken
  else delete token.connectIdToken

  if (account?.provider === providerId) {
    await stampConnectEpochOnSignIn(token, account, deps, userId)
    return
  }

  if (inherited && inherited.issuer && inherited.sub) {
    token.connectIssuer = inherited.issuer
    token.connectSub = inherited.sub
    token.connectCv = inherited.cv
    if (inherited.sid) token.connectSid = inherited.sid
    else delete token.connectSid
    if (inherited.kind === 'derived' && inherited.aeid) {
      token.connectKind = 'oidc'
      token.connectAeid = inherited.aeid
      if (inherited.grantId) token.connectGrantId = inherited.grantId
      else delete token.connectGrantId
    } else {
      token.connectKind = 'app_local'
      delete token.connectAeid
      delete token.connectGrantId
    }
    delete token.connectAccessToken
    delete token.connectRefreshToken
    delete token.connectAccessTokenExpiresAt
    delete token.localCv
    return
  }

  // A local / Google / phone-only sign-in: the version observed now.
  delete token.connectKind
  if (userId != null && deps.execute) {
    const version = await readLocalCredentialVersion(deps.execute, userId, deps.logger ?? console)
    if (version != null) token.localCv = version
  }
}

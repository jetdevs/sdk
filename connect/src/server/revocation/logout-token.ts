/**
 * Yobo Connect back-channel logout — the `logout_token` VERIFIER.
 *
 * WHY THIS IS IN THE SDK (p77 STORY-003, specs.md §9). Four relying parties
 * receive the same logout token from the same issuer. One verifier means one
 * validation list, one replay rule and one permanent/transient split — a
 * receiver that drifts from the others is a session that survives a reset in
 * one app only, which nobody would notice until it mattered.
 *
 * OpenID Connect Back-Channel Logout 1.0 §2.6 is a validation list, and every
 * item on it is load-bearing. This module is the whole list and nothing else:
 * it takes a compact JWS and either returns the claims it is willing to act on,
 * or a refusal. It writes nothing, reads no rows, and has no opinion about what
 * a logout should DO — that is `ledger.ts`.
 *
 * THE ONE ASYMMETRY WORTH READING. A refusal here is either PERMANENT or
 * TRANSIENT, and the receiver turns that into a 400 or a 503. It matters more
 * than it looks: the sender is an outbox with retry, and a 400 tells it to
 * stop. So "the JWKS endpoint was down" must never be reported as "this token
 * is invalid" — that combination discards the logout permanently on an outage,
 * and the session it was meant to end survives. Every refusal below therefore
 * carries `transient` explicitly rather than by inference.
 *
 * WHY NOT `jose`. The verification this module needs is a signature check and
 * a claim list, both of which `node:crypto` does directly; the same JWKS cache
 * also serves the operator-token verifier (`operator-token.ts`, D23).
 *
 * CONTRACT. `verifyLogoutToken(raw, deps)` — `deps.issuer` and `deps.clientId`
 * are required (the SDK reads no environment); `allowedAlgs` defaults to
 * `['RS256']`, `maxTokenAgeSeconds` to 600, `clockSkewSeconds` to 60. The
 * mechanism is cadra-web's, unchanged.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/connect-logout-token.ts
 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html §2.4, §2.6
 */

import { createPublicKey, constants as cryptoConstants, verify as cryptoVerify } from 'node:crypto'

/** The single event a back-channel logout token must carry (BCL 1.0 §2.4). */
export const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout'

/**
 * Signing algorithms this receiver can verify, PINNED.
 *
 * `none` is not merely absent from the list — it can never reach the switch in
 * {@link verifySignature}, which has no branch for it. An allowlist that is
 * only a list is one configuration mistake away from accepting an unsigned
 * token, and an unsigned logout token is a request from anyone to end anyone's
 * session.
 */
const SUPPORTED_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'] as const
export type SupportedAlg = (typeof SUPPORTED_ALGS)[number]

/**
 * Intersect a requested list with what the code can verify. A request that
 * names nothing verifiable falls back to the pin rather than to "anything goes".
 */
export function resolveAllowedAlgs(requested: readonly string[] | undefined): SupportedAlg[] {
  const usable = (requested ?? [])
    .map((s) => s.trim())
    .filter((a): a is SupportedAlg => (SUPPORTED_ALGS as readonly string[]).includes(a))
  return usable.length > 0 ? usable : ['RS256']
}

/**
 * How old a token's `iat` may be, in seconds. Default 10 minutes.
 *
 * THIS NUMBER IS A CONTRACT WITH THE SENDER, not a local preference. The outbox
 * retries with exponential backoff, and a retry presents the SAME token — so a
 * window shorter than the sender's backoff tail turns a transient delivery
 * failure into a permanent one.
 */
export const DEFAULT_MAX_TOKEN_AGE_SECONDS = 600
/** Clock-skew allowance for `iat` in the future and `exp` in the past. */
export const DEFAULT_CLOCK_SKEW_SECONDS = 60

/**
 * Why a token was refused.
 *
 * These names exist for the SERVER LOG and for tests. None of them reaches the
 * caller: BCL 1.0 §2.8 wants a generic error, and a sender that learns which
 * check failed learns how to pass it. The receiver maps every permanent reason
 * to one `invalid_request`.
 */
export type LogoutTokenRefusal =
  | 'not_configured'
  | 'malformed'
  | 'alg_not_allowed'
  | 'bad_typ'
  | 'unknown_key'
  | 'bad_signature'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'azp_mismatch'
  | 'missing_events'
  | 'missing_jti'
  | 'missing_subject'
  | 'nonce_present'
  | 'missing_iat'
  | 'stale'
  | 'not_yet_issued'
  | 'expired'
  | 'jwks_unavailable'

export interface VerifiedLogoutToken {
  /** Always the CONFIGURED issuer — the token's `iss` was compared to it. */
  issuer: string
  /** Subject, when the token names one. At least one of sub/sid is present. */
  sub: string | null
  /** IdP session id, when the token names one. */
  sid: string | null
  jti: string
  /** `iat`, in seconds since the epoch. */
  issuedAt: number
  /**
   * The instant after which this jti can never be accepted again, in seconds:
   * `iat` + the freshness window + skew. The replay ledger prunes on it.
   */
  replayGuardUntil: number
  /**
   * WHY the IdP ended the session, when it says. Read from the event member's
   * object (BCL 1.0 §2.4 says the member value SHOULD be `{}`, not MUST, so a
   * `reason` inside it is permitted) or from a top-level `reason` claim.
   * Null when the sender said nothing.
   */
  reason: string | null
  /**
   * The credential version the IdP moved to, when the token carries it. The
   * receiver raises the local mirror to it in the same transaction that claims
   * the jti, so a derived credential with no browser session behind it still
   * learns of the reset. Null when absent.
   */
  cv: number | null
}

export type LogoutTokenVerification =
  | { ok: true; token: VerifiedLogoutToken }
  | { ok: false; reason: LogoutTokenRefusal; transient: boolean }

/** Everything this module reaches outside itself. */
export interface LogoutTokenVerifierDeps {
  /** Configured Connect issuer (the RP's `YOBO_CONNECT_URL`). */
  issuer: string
  /** This RP's client id at the IdP. */
  clientId: string
  /** Defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Seconds since the epoch. Defaults to the wall clock. */
  now?: () => number
  /** Defaults to `['RS256']`; intersected with what the code can verify. */
  allowedAlgs?: readonly string[]
  maxTokenAgeSeconds?: number
  clockSkewSeconds?: number
}

// ===========================================================================
// JWKS
// ===========================================================================

interface JwksCacheEntry {
  keys: Record<string, unknown>[]
  fetchedAt: number
}

/**
 * Process-local JWKS cache, keyed by issuer.
 *
 * Capped at 5 minutes, and the verifiers bypass it on a `kid` miss — which is
 * what makes key rotation work without waiting out the TTL. The cache is only
 * an optimisation: correctness comes from the miss path. Shared with the
 * operator-token verifier (D23, specs.md §6.5 step 1).
 */
const jwksCache = new Map<string, JwksCacheEntry>()
export const JWKS_TTL_SECONDS = 300

/** Test seam — the cache is process-local state and a test must be able to reset it. */
export function __resetJwksCacheForTests(): void {
  jwksCache.clear()
}

async function fetchJwks(issuer: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>[] | null> {
  try {
    const discoveryUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
    const discoveryRes = await fetchImpl(discoveryUrl, { headers: { accept: 'application/json' } })
    if (!discoveryRes.ok) return null
    const discovery = (await discoveryRes.json()) as { issuer?: string; jwks_uri?: string }

    // The discovery document asserts its own issuer, and it must be the one we
    // asked for. Without this check a misdirected or hijacked well-known
    // document points the receiver at an attacker's JWKS — and every signature
    // after that verifies perfectly against the wrong keys.
    if (typeof discovery.issuer !== 'string' || discovery.issuer !== issuer) return null
    if (typeof discovery.jwks_uri !== 'string' || !discovery.jwks_uri) return null

    const jwksRes = await fetchImpl(discovery.jwks_uri, { headers: { accept: 'application/json' } })
    if (!jwksRes.ok) return null
    const jwks = (await jwksRes.json()) as { keys?: unknown }
    if (!Array.isArray(jwks.keys)) return null
    return jwks.keys as Record<string, unknown>[]
  } catch {
    return null
  }
}

/**
 * The signing keys for an issuer, refreshing past the cache when `kid` misses.
 *
 * Returns `null` only when the keys could not be READ — that is the transient
 * case. A successful read that contains no matching key is a different answer
 * and is reported as `unknown_key`.
 */
export async function getJwks(
  issuer: string,
  fetchImpl: typeof fetch,
  nowSeconds: number,
  force: boolean,
): Promise<Record<string, unknown>[] | null> {
  const cached = jwksCache.get(issuer)
  if (!force && cached && nowSeconds - cached.fetchedAt < JWKS_TTL_SECONDS) {
    return cached.keys
  }
  const keys = await fetchJwks(issuer, fetchImpl)
  if (keys) {
    jwksCache.set(issuer, { keys, fetchedAt: nowSeconds })
    return keys
  }
  // A failed refresh falls back to a cached copy rather than refusing: keys
  // change rarely, outages do not, and a stale-but-valid key still proves the
  // signature. If there is nothing cached, this is genuinely transient.
  return cached ? cached.keys : null
}

export function keyMatches(jwk: Record<string, unknown>, kid: string | undefined, alg: string): boolean {
  // A key marked for encryption is not a key for verifying a signature.
  const use = jwk.use
  if (typeof use === 'string' && use !== 'sig') return false
  const keyOps = jwk.key_ops
  if (Array.isArray(keyOps) && !keyOps.includes('verify')) return false
  // A key that declares its own alg must agree with the header's.
  if (typeof jwk.alg === 'string' && jwk.alg !== alg) return false
  const expectedKty = alg.startsWith('ES') ? 'EC' : 'RSA'
  if (jwk.kty !== expectedKty) return false
  if (kid !== undefined) return jwk.kid === kid
  return true
}

/**
 * Find the keys able to verify `alg`/`kid`, refetching once past the cache on
 * a miss. `{ keys: null }` means the JWKS could not be read (transient);
 * `{ keys: [] }` means it was read and holds no matching key.
 */
export async function findSigningKeys(
  issuer: string,
  fetchImpl: typeof fetch,
  nowSeconds: number,
  kid: string | undefined,
  alg: string,
): Promise<Record<string, unknown>[] | null> {
  let keys = await getJwks(issuer, fetchImpl, nowSeconds, false)
  let candidates = (keys ?? []).filter((k) => keyMatches(k, kid, alg))
  if (candidates.length === 0) {
    // A cached JWKS that does not contain this kid is the normal appearance of
    // key rotation. Refetch once, past the cache, before calling it unknown.
    keys = await getJwks(issuer, fetchImpl, nowSeconds, true)
    if (keys === null) return null
    candidates = keys.filter((k) => keyMatches(k, kid, alg))
  }
  if (keys === null) return null
  return candidates
}

// ===========================================================================
// JWS
// ===========================================================================

const BASE64URL = /^[A-Za-z0-9_-]+$/

export function decodeSegment(segment: string): Buffer | null {
  // Buffer.from(..., 'base64url') silently ignores characters it does not
  // recognise, so a segment carrying `+`, `/` or `=` would decode to something
  // plausible rather than failing. Check the alphabet before trusting it.
  if (!BASE64URL.test(segment)) return null
  try {
    return Buffer.from(segment, 'base64url')
  } catch {
    return null
  }
}

export function decodeJson(segment: string): Record<string, unknown> | null {
  const raw = decodeSegment(segment)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Verify the signature over `header.payload`.
 *
 * There is no `none` branch and there must never be one. An algorithm that
 * reaches here and matches nothing returns false, which is a refusal.
 */
export function verifySignature(
  alg: SupportedAlg,
  jwk: Record<string, unknown>,
  signingInput: string,
  signature: Buffer,
): boolean {
  let key
  try {
    key = createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' })
  } catch {
    return false
  }

  const digest = alg.endsWith('384') ? 'sha384' : alg.endsWith('512') ? 'sha512' : 'sha256'
  const data = Buffer.from(signingInput, 'ascii')

  try {
    if (alg.startsWith('RS')) {
      return cryptoVerify(digest, data, { key, padding: cryptoConstants.RSA_PKCS1_PADDING }, signature)
    }
    if (alg.startsWith('PS')) {
      return cryptoVerify(
        digest,
        data,
        { key, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST },
        signature,
      )
    }
    if (alg.startsWith('ES')) {
      // JWS carries ECDSA signatures as raw r‖s, not DER. Node defaults to DER,
      // so this option is the difference between "verifies" and "never
      // verifies" — and the failure looks exactly like a bad signature.
      return cryptoVerify(digest, data, { key, dsaEncoding: 'ieee-p1363' }, signature)
    }
  } catch {
    return false
  }
  return false
}

/**
 * The structural half every JWS verifier here shares: split, decode the
 * header, pin the alg, decode the signature, find a key, verify. Claims are
 * NOT decoded before the signature holds — every claim in an unverified JWT
 * is attacker-controlled text.
 */
export async function verifyCompactJws(
  rawToken: string,
  args: { issuer: string; fetchImpl: typeof fetch; nowSeconds: number; allowedAlgs: readonly SupportedAlg[] },
): Promise<
  | { ok: true; header: Record<string, unknown>; claims: Record<string, unknown> }
  | { ok: false; reason: 'malformed' | 'alg_not_allowed' | 'jwks_unavailable' | 'unknown_key' | 'bad_signature'; transient: boolean }
> {
  if (typeof rawToken !== 'string' || !rawToken) return { ok: false, reason: 'malformed', transient: false }
  const parts = rawToken.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed', transient: false }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  const header = decodeJson(headerB64)
  if (!header) return { ok: false, reason: 'malformed', transient: false }
  const alg = header.alg
  if (typeof alg !== 'string') return { ok: false, reason: 'malformed', transient: false }
  if (!args.allowedAlgs.includes(alg as SupportedAlg)) return { ok: false, reason: 'alg_not_allowed', transient: false }

  const signature = decodeSegment(signatureB64)
  if (!signature || signature.length === 0) return { ok: false, reason: 'malformed', transient: false }
  const kid = typeof header.kid === 'string' ? header.kid : undefined

  const candidates = await findSigningKeys(args.issuer, args.fetchImpl, args.nowSeconds, kid, alg)
  if (candidates === null) return { ok: false, reason: 'jwks_unavailable', transient: true }
  if (candidates.length === 0) return { ok: false, reason: 'unknown_key', transient: false }

  const signingInput = `${headerB64}.${payloadB64}`
  const verified = candidates.some((jwk) => verifySignature(alg as SupportedAlg, jwk, signingInput, signature))
  if (!verified) return { ok: false, reason: 'bad_signature', transient: false }

  const claims = decodeJson(payloadB64)
  if (!claims) return { ok: false, reason: 'malformed', transient: false }
  return { ok: true, header, claims }
}

// ===========================================================================
// Claim checks
// ===========================================================================

export function audienceContains(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected
  if (Array.isArray(aud)) return aud.some((a) => typeof a === 'string' && a === expected)
  return false
}

function refuse(reason: LogoutTokenRefusal, transient = false): LogoutTokenVerification {
  return { ok: false, reason, transient }
}

/**
 * Validate a `logout_token` per BCL 1.0 §2.6, in that order.
 *
 * Signature BEFORE claims, deliberately. Every claim in an unverified JWT is
 * attacker-controlled text; checking `iss` first would mean the log records an
 * issuer nobody proved. The one exception is the cheap structural work needed
 * to find the key at all.
 *
 * Replay is NOT checked here. Claiming a `jti` is a write, and it has to happen
 * in the same transaction as the revocation it guards — see `ledger.ts`.
 */
export async function verifyLogoutToken(
  rawToken: string,
  deps: LogoutTokenVerifierDeps,
): Promise<LogoutTokenVerification> {
  const issuer = (deps.issuer ?? '').trim()
  const clientId = (deps.clientId ?? '').trim()
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000)
  const skew = deps.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS
  const maxAge = deps.maxTokenAgeSeconds ?? DEFAULT_MAX_TOKEN_AGE_SECONDS

  // Unconfigured is a SERVER fault, not a bad token. Reporting it as a 400
  // would make the sender give up on a logout that a redeploy would fix.
  if (!issuer || !clientId) return refuse('not_configured', true)

  if (typeof rawToken !== 'string' || !rawToken) return refuse('malformed')
  const parts = rawToken.split('.')
  if (parts.length !== 3) return refuse('malformed')
  const header = decodeJson(parts[0]!)
  if (!header) return refuse('malformed')
  const allowedAlgs = resolveAllowedAlgs(deps.allowedAlgs)
  if (typeof header.alg !== 'string') return refuse('malformed')
  if (!allowedAlgs.includes(header.alg as SupportedAlg)) return refuse('alg_not_allowed')

  // BCL 1.0 §2.4 recommends `typ: logout+jwt`. Accepting an absent typ keeps
  // interop with issuers that omit it; accepting an unrelated one would let an
  // id_token be replayed here as a logout token.
  const typ = header.typ
  if (typeof typ === 'string') {
    const t = typ.toLowerCase()
    if (t !== 'logout+jwt' && t !== 'jwt' && t !== 'application/logout+jwt') return refuse('bad_typ')
  }

  const jws = await verifyCompactJws(rawToken, {
    issuer,
    fetchImpl,
    nowSeconds: now,
    allowedAlgs,
  })
  if (!jws.ok) return refuse(jws.reason, jws.transient)
  const claims = jws.claims

  // ── Claims, now that they are attributable ────────────────────────────
  if (typeof claims.iss !== 'string' || claims.iss !== issuer) return refuse('issuer_mismatch')
  if (!audienceContains(claims.aud, clientId)) return refuse('audience_mismatch')

  // With several audiences, `azp` (when present) names the one the token is
  // FOR. A token listing us among its audiences but authorised to a different
  // party is not ours to act on.
  if (typeof claims.azp === 'string' && claims.azp !== clientId) return refuse('azp_mismatch')

  const events = claims.events
  if (
    !events ||
    typeof events !== 'object' ||
    Array.isArray(events) ||
    !Object.prototype.hasOwnProperty.call(events, BACKCHANNEL_LOGOUT_EVENT)
  ) {
    return refuse('missing_events')
  }
  const eventMember = (events as Record<string, unknown>)[BACKCHANNEL_LOGOUT_EVENT]
  const memberReason =
    eventMember && typeof eventMember === 'object' && !Array.isArray(eventMember)
      ? (eventMember as Record<string, unknown>).reason
      : undefined
  const rawReason = typeof memberReason === 'string' ? memberReason : claims.reason
  const reason = typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : null
  const cv = typeof claims.cv === 'number' && Number.isInteger(claims.cv) && claims.cv > 0 ? claims.cv : null

  // BCL 1.0 §2.4: a nonce is PROHIBITED. Its presence is the signature of an
  // id_token being replayed as a logout token, which is exactly the confusion
  // the prohibition exists to prevent.
  if (claims.nonce !== undefined) return refuse('nonce_present')

  const jti = claims.jti
  if (typeof jti !== 'string' || !jti.trim()) return refuse('missing_jti')

  const sub = typeof claims.sub === 'string' && claims.sub.trim() ? claims.sub.trim() : null
  const sid = typeof claims.sid === 'string' && claims.sid.trim() ? claims.sid.trim() : null
  if (!sub && !sid) return refuse('missing_subject')

  const iat = claims.iat
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return refuse('missing_iat')

  if (iat > now + skew) return refuse('not_yet_issued')
  if (now - iat > maxAge) return refuse('stale')

  // `exp` is optional in BCL 1.0, but an issuer that sets one means it.
  const exp = claims.exp
  if (typeof exp === 'number' && Number.isFinite(exp) && now > exp + skew) return refuse('expired')

  return {
    ok: true,
    token: {
      issuer,
      sub,
      sid,
      jti: jti.trim(),
      issuedAt: Math.floor(iat),
      replayGuardUntil: Math.floor(iat) + maxAge + skew,
      reason,
      cv,
    },
  }
}

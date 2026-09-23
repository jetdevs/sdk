/**
 * The Connect TRANSPORT for the authentication epoch: RFC 7662 token
 * introspection, the refresh exchange that keeps a session's introspection
 * handle alive (specs.md §4.5), and the lineage-aware account-version lookup
 * that app-local and derived sessions use instead of a token (D24).
 *
 * WHY THIS IS IN THE SDK (p77 STORY-003). Every RP asks the same issuer the
 * same three questions with the same credentials shape; one client means one
 * answer shape and one rule for what a non-answer is.
 *
 * WHY INTROSPECTION. oidc-provider populates `extraTokenClaims` only into the
 * opaque access token and the introspection response spreads it back out.
 * /userinfo never reads it and the id_token never carries it, so the ONLY
 * authenticated transport of `cv` / `aeid` / `grant_id` to a relying party is
 * to hand the access token back to the issuer and ask, authenticated as the
 * RP's own client (`client_secret_basic`), so a token can be checked only by
 * the party it was issued to.
 *
 * WHAT A VERDICT MEANS. `active: false` is the IdP's whole answer for a token
 * that is expired, consumed, revoked, OR bound to a stale epoch; RFC 7662 §2.2
 * forbids saying which. The caller treats every `active: false` as a refusal
 * and never distinguishes. `active: true` carries `cv` and `aeid` — the epoch
 * the token was issued under — and the caller compares those against the
 * epoch the credential in hand claims to carry.
 *
 * TRANSPORT FAILURE IS NOT A VERDICT. A network error, a non-200, or an
 * unparseable body throws {@link ConnectTransportError}; the caller decides
 * what an unreadable version means at its boundary (refuse). Nothing here
 * ever turns "could not ask" into "active".
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/connect-introspection.ts
 */

/** RFC 7662 response, narrowed to what the epoch check reads. */
export type IntrospectionResult =
  | { active: false }
  | {
      active: true
      sub: string | null
      /** Credential version the token was issued under. */
      cv: number | null
      /** Authentication-epoch id the token inherits. */
      aeid: string | null
      /** The grant the token was issued under (the oidc-provider Grant jti). */
      grantId: string | null
      /** Seconds since the epoch; null when the IdP omitted it. */
      exp: number | null
      clientId: string | null
    }

export interface ConnectClientConfig {
  /** Issuer base URL, e.g. `https://auth.yobolabs.ai`. Trailing slash tolerated. */
  issuer: string
  clientId: string
  clientSecret: string
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Per-call deadline. Default 5s — a hung IdP must not hang every request. */
  timeoutMs?: number
}

/** The issuer could not be asked, or answered with something that is not a verdict. */
export class ConnectTransportError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ConnectTransportError'
  }
}

export type RefreshResult =
  | {
      ok: true
      accessToken: string
      /** Rotated refresh token when the IdP issued one; otherwise the old one is still the family's. */
      refreshToken: string | null
      /** Seconds since the epoch. */
      expiresAt: number | null
    }
  /**
   * The IdP REFUSED the exchange — `invalid_grant` is what oidc-provider
   * returns when the compare-and-issue fence finds the grant's epoch stale,
   * when the family was revoked for reuse, and when the refresh token expired.
   * All three mean: this session cannot continue.
   */
  | { ok: false; error: string }

const trimSlash = (s: string) => s.trim().replace(/\/+$/, '')

function basicAuth(clientId: string, clientSecret: string): string {
  // RFC 6749 §2.3.1: the id and secret are form-urlencoded before base64.
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+')
  return `Basic ${Buffer.from(`${enc(clientId)}:${enc(clientSecret)}`).toString('base64')}`
}

async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, cache: 'no-store', signal: controller.signal })
  } catch (err) {
    throw new ConnectTransportError(`Connect issuer unreachable at ${url}`, err)
  } finally {
    clearTimeout(timer)
  }
}

async function postForm(url: string, body: URLSearchParams, cfg: ConnectClientConfig): Promise<Response> {
  return fetchWithDeadline(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(cfg.clientId, cfg.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    },
    cfg.fetchImpl ?? fetch,
    cfg.timeoutMs ?? 5_000,
  )
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/**
 * Ask the issuer whether `token` is active, and under which epoch.
 *
 * Always `token_type_hint=access_token`: the handle a session keeps is the
 * access token, and a refresh token presented here would be a category error
 * this hint makes the IdP refuse cheaply.
 *
 * @throws ConnectTransportError when no verdict could be obtained.
 */
export async function introspectConnectToken(token: string, cfg: ConnectClientConfig): Promise<IntrospectionResult> {
  if (!token) return { active: false }
  const url = `${trimSlash(cfg.issuer)}/oauth/introspect`
  const res = await postForm(url, new URLSearchParams({ token, token_type_hint: 'access_token' }), cfg)
  if (res.status !== 200) {
    // RFC 7662 §2.2: a valid request about an unknown token is a 200 with
    // active:false. Anything else — 401 (our client credentials refused), 5xx,
    // a redirect — is the issuer failing to answer, not a verdict.
    throw new ConnectTransportError(`introspection returned HTTP ${res.status}`)
  }
  let body: Record<string, unknown>
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch (err) {
    throw new ConnectTransportError('introspection body is not JSON', err)
  }
  if (!body || typeof body !== 'object' || typeof body.active !== 'boolean') {
    throw new ConnectTransportError('introspection body has no boolean `active`')
  }
  if (!body.active) return { active: false }
  return {
    active: true,
    sub: str(body.sub),
    cv: num(body.cv),
    aeid: str(body.aeid),
    grantId: str(body.grant_id) ?? str(body.grantId),
    exp: num(body.exp),
    clientId: str(body.client_id),
  }
}

/**
 * Exchange a refresh token for a fresh access token (RFC 6749 §6).
 *
 * The IdP does NOT rotate a confidential first-party client's refresh token
 * (D14), so the same refresh token is accepted again until its TTL. An RP
 * still makes the exchange at most once per refresh token per process — see
 * `refreshConnectSessionOnce` in freshness.ts — so racing requests share one
 * POST.
 *
 * @throws ConnectTransportError when the exchange could not be made at all.
 */
export async function refreshConnectTokens(
  refreshToken: string,
  cfg: ConnectClientConfig,
  nowMs: number = Date.now(),
): Promise<RefreshResult> {
  const url = `${trimSlash(cfg.issuer)}/oauth/token`
  const res = await postForm(url, new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }), cfg)
  let body: Record<string, unknown>
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch (err) {
    throw new ConnectTransportError(`refresh exchange returned HTTP ${res.status} with a non-JSON body`, err)
  }
  if (res.status === 200) {
    const accessToken = str(body.access_token)
    if (!accessToken) throw new ConnectTransportError('refresh exchange returned 200 without access_token')
    const expiresIn = num(body.expires_in)
    return {
      ok: true,
      accessToken,
      refreshToken: str(body.refresh_token),
      expiresAt: expiresIn != null ? Math.floor(nowMs / 1000) + expiresIn : null,
    }
  }
  if (res.status === 400 || res.status === 401) {
    // A refusal with a named OAuth error is the IdP's answer, not a failure to
    // answer. `invalid_grant` is the fence; `invalid_client` means OUR
    // credentials are wrong, which is also not something a retry fixes.
    const error = str(body.error)
    if (error) return { ok: false, error }
  }
  throw new ConnectTransportError(`refresh exchange returned HTTP ${res.status}`)
}

// ===========================================================================
// D24 — the lineage-aware account-version lookup
// ===========================================================================

/** The RP → Connect internal-key transport (the same key `ConnectProvisioningClient` carries). */
export interface AccountVersionLookupConfig {
  /** Issuer base URL. Trailing slash tolerated. */
  issuer: string
  /** This RP's `YOBO_CONNECT_INTERNAL_API_KEY` (scope `account-version`). */
  rpKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface AccountVersionQuery {
  /** The Connect subject the lineage names. */
  sub: string
  /** The RP-local user reference `rp_identity_map` maps to `sub` (D6-scoped by the caller's key). */
  sourceUserRef: string | number
  /** The lineage's epoch id, when it has one (absent for an app_local lineage). */
  aeid?: string | null
  /** The provider Grant of the browser the lineage descends from, when it has one. */
  grantId?: string | null
}

/**
 * Connect's answer. `epoch` is a VERSION COMPARISON ONLY on `aeid` (`unknown`
 * when no aeid was supplied or it belongs to another user); `grant` is whether
 * the provider Grant `grantId` still exists, bound to this `sub` and `aeid`
 * (`unknown` when none was supplied, or it exists under another lineage).
 * A browser sign-out at Connect destroys that browser's Grant, so
 * `grant: 'gone'` IS the sign-out fact — delivered or not.
 */
export interface AccountVersionAnswer {
  found: boolean
  /** The canonical credential version; null when not found. */
  cv: number | null
  /** `users.is_active` at Connect; null when not found. */
  active: boolean | null
  epoch: 'fresh' | 'stale' | 'unknown'
  grant: 'live' | 'gone' | 'unknown'
}

const EPOCHS = ['fresh', 'stale', 'unknown'] as const
const GRANTS = ['live', 'gone', 'unknown'] as const

/**
 * `POST <issuer>/api/internal/connect/account-version` with the RP key.
 *
 * A 200 whose body carries the D24 shape is the answer. Anything else — 401
 * (key refused), 403 (scope), 404 (an IdP without the route), 5xx, a
 * malformed body, a transport error — throws {@link ConnectTransportError}:
 * the caller reads that as `unreadable`, never as a version.
 */
export async function lookupAccountVersion(
  query: AccountVersionQuery,
  cfg: AccountVersionLookupConfig,
): Promise<AccountVersionAnswer> {
  const url = `${trimSlash(cfg.issuer)}/api/internal/connect/account-version`
  const payload: Record<string, unknown> = { sub: query.sub, sourceUserRef: String(query.sourceUserRef) }
  if (query.aeid) payload.aeid = query.aeid
  if (query.grantId) payload.grantId = query.grantId
  const res = await fetchWithDeadline(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-API-Key': cfg.rpKey,
      },
      body: JSON.stringify(payload),
    },
    cfg.fetchImpl ?? fetch,
    cfg.timeoutMs ?? 5_000,
  )
  if (res.status !== 200) throw new ConnectTransportError(`account-version returned HTTP ${res.status}`)
  let body: Record<string, unknown>
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch (err) {
    throw new ConnectTransportError('account-version body is not JSON', err)
  }
  if (!body || typeof body !== 'object' || typeof body.found !== 'boolean') {
    throw new ConnectTransportError('account-version body has no boolean `found`')
  }
  const epoch = (EPOCHS as readonly string[]).includes(String(body.epoch)) ? (body.epoch as AccountVersionAnswer['epoch']) : 'unknown'
  const grant = (GRANTS as readonly string[]).includes(String(body.grant)) ? (body.grant as AccountVersionAnswer['grant']) : 'unknown'
  if (!body.found) return { found: false, cv: null, active: null, epoch, grant }
  const cv = num(body.cv)
  const active = typeof body.active === 'boolean' ? body.active : null
  return { found: true, cv, active, epoch, grant }
}

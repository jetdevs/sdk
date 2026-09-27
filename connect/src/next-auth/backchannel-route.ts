/**
 * p77 STORY-005 — the BACK-CHANNEL LOGOUT RECEIVER every RP mounts
 * (specs.md §5.2 `createBackchannelLogoutRoute`, §9.1, §9.2).
 *
 * POST <rp>/api/auth/connect/backchannel-logout
 *   Content-Type: application/x-www-form-urlencoded
 *   logout_token=<compact JWS>
 *
 * UNAUTHENTICATED BY DESIGN: the caller is the IdP's outbox worker with no
 * session and no key; the token's signature is the whole authentication,
 * which is why every check in `verifyLogoutToken` is load-bearing.
 *
 * THE STATUS CODES ARE A CONTRACT with the sender's outbox (retry with
 * backoff, dead-letter):
 *   200  accepted. The sender may stop.
 *   400  PERMANENTLY refused (a bad token, a replayed jti). The sender must stop.
 *   503  TRANSIENT (JWKS unreachable, the ledger write failed). Retry; nothing recorded.
 * Collapsing 503 into 400 discards every logout issued during an outage and
 * the sessions they were meant to end survive — so the two are kept apart
 * here exactly as in the port. A replay is a REFUSAL (BCL 1.0 §2.6 step 8),
 * not a quiet 200, so the ledger cannot be leaned on as a no-op.
 *
 * One code, `invalid_request`, for every permanent refusal (BCL 1.0 §2.8);
 * the specific reason goes to the log.
 *
 * After an applied revocation the RP's `invalidateLocalSessions` runs
 * best-effort (yobo: onboarding resume access too) — the ledger row is the
 * load-bearing half and is already durable.
 *
 * Ported-From: cadra-web@b615864c:src/app/api/auth/connect/backchannel-logout/route.ts
 * Ported-From: cadra-web@b615864c:src/server/auth/backchannel-logout.ts
 */

import type { RpAdapter, RpSqlClient } from '../adapter/index.js'
import { applyLogoutToken, pruneExpiredLogoutTokens, type LogoutApplication } from '../server/revocation/ledger.js'
import { verifyLogoutToken, type LogoutTokenVerifierDeps, type VerifiedLogoutToken } from '../server/revocation/logout-token.js'

export interface BackchannelLogoutRouteDeps {
  /** The privileged SQL client (no RLS), or a getter; null = the store is down → 503. */
  db: RpSqlClient | null | (() => RpSqlClient | null)
  /** `issuer` + `clientId` (this RP's OIDC client id) and the optional knobs. */
  verify: LogoutTokenVerifierDeps
  /** App-specific session invalidation after an applied revocation (best-effort). */
  adapter?: Pick<RpAdapter, 'invalidateLocalSessions'> | null
  /** Test seam: the ledger functions. */
  ledger?: {
    apply?: (db: RpSqlClient | null, token: VerifiedLogoutToken) => Promise<LogoutApplication>
    prune?: (db: RpSqlClient | null) => Promise<void>
  }
  /** Called after a successful application (e.g. an account-disabled sweep). */
  onApplied?: (token: VerifiedLogoutToken, applied: Extract<LogoutApplication, { outcome: 'applied' }>) => Promise<void> | void
  logger?: Pick<Console, 'warn' | 'error' | 'log'>
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Content-Type': 'application/json',
} as const

const ok = () => new Response(JSON.stringify({}), { status: 200, headers: NO_STORE_HEADERS })
const permanentRefusal = () => new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: NO_STORE_HEADERS })
const transientRefusal = () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503, headers: NO_STORE_HEADERS })

export interface BackchannelLogoutRoute {
  POST(request: Request): Promise<Response>
  /** 405 with `Allow: POST` — tells an operator probing the URL that the receiver is deployed. */
  GET(): Response
}

export function createBackchannelLogoutRoute(deps: BackchannelLogoutRouteDeps): BackchannelLogoutRoute {
  const logger = deps.logger ?? console
  const dbOf = () => (typeof deps.db === 'function' ? deps.db() : deps.db)
  const apply = deps.ledger?.apply ?? ((db, token) => applyLogoutToken(db, token, { logger }))
  const prune = deps.ledger?.prune ?? ((db) => pruneExpiredLogoutTokens(db?.execute, logger))

  async function POST(request: Request): Promise<Response> {
    const contentType = (request.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      logger.warn('[connect-backchannel] logout refused: content-type', { contentType })
      return permanentRefusal()
    }
    let rawToken: string | null = null
    try {
      rawToken = new URLSearchParams(await request.text()).get('logout_token')
    } catch {
      rawToken = null
    }
    if (!rawToken) {
      logger.warn('[connect-backchannel] logout refused: no logout_token in body')
      return permanentRefusal()
    }

    const verification = await verifyLogoutToken(rawToken, deps.verify)
    if (!verification.ok) {
      logger.warn('[connect-backchannel] logout refused:', { reason: verification.reason, transient: verification.transient })
      return verification.transient ? transientRefusal() : permanentRefusal()
    }

    const db = dbOf()
    const applied = await apply(db, verification.token)
    if (applied.outcome === 'unavailable') return transientRefusal()
    if (applied.outcome === 'replay') {
      logger.warn('[connect-backchannel] logout refused: jti replay', { issuer: verification.token.issuer })
      return permanentRefusal()
    }

    logger.log('[connect-backchannel] back-channel logout applied', {
      issuer: verification.token.issuer,
      hasSub: Boolean(verification.token.sub),
      hasSid: Boolean(verification.token.sid),
      localUserId: applied.localUserId,
    })

    if (applied.localUserId != null && deps.adapter) {
      try {
        await deps.adapter.invalidateLocalSessions(applied.localUserId)
      } catch (err) {
        logger.error('[connect-backchannel] local session invalidation failed (ledger row is durable):', err)
      }
    }
    if (deps.onApplied) {
      try {
        await deps.onApplied(verification.token, applied)
      } catch (err) {
        logger.error('[connect-backchannel] onApplied failed (ledger row is durable):', err)
      }
    }
    await prune(db)
    return ok()
  }

  function GET(): Response {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...NO_STORE_HEADERS, Allow: 'POST' } })
  }

  return { POST, GET }
}

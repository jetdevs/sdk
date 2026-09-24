/**
 * p77 STORY-005 — the four `/api/v1/internal/connect/*` routes every RP
 * mounts, as ONE factory over `RpAdapter` (specs.md §5.2 `./next-auth`,
 * §5.3, §6.5, §9.4, D23, D25, D26).
 *
 * WHY A FACTORY. Four RPs, the same routes, the same authorization contract.
 * The pinned cadra-web routes are three files plus a middleware; here they
 * are handlers a Next.js route module binds in one line each
 * (`export const POST = routes.credentialHandoff`). Every handler takes a
 * plain `Request` and answers a plain `Response`, so the tests below drive
 * the REAL handlers with real requests, and an app can mount them behind
 * Next.js, Fastify or `node:http` alike.
 *
 * THE KEY (`withConnectInternalAuth`). Only this RP's `CONNECT_INTERNAL_KEY`
 * (the entry for this system in Connect's `RP_INTERNAL_KEYS_JSON`) is
 * accepted, and only on these routes. Unset — or equal to any shared
 * internal key (`CADRA_API_INTERNAL_KEY`, `YOBO_INTERNAL_API_KEY`, …), which
 * would erase the separation that keeps a Connect compromise out of every
 * other internal route — the routes answer 503 and the misconfiguration is
 * logged ONCE. Constant-time compare.
 *
 * THE OPERATOR CONTRACT (`credentialHandoff`, §6.5) — one order, server-side,
 * before any write, for every op except `inventory`, `state` and
 * `sweep-mappings`, whether or not `YOBO_CONNECT_ENABLED` is on:
 *
 *   -   no `X-Cutover-Operator` header       → 401 operator_token_required
 *       (the driver is NEVER called: the pinned prepare gate admits ordinary
 *       calls at flag on, `cadra-web@b615864c:src/server/auth/credential-handoff.ts:1002-1009`,
 *       so forwarding a token-less request would bypass the contract — P77-13 r3)
 *   1.  offline `verifyOperatorToken` (sig / iss / aud=this system / exp;
 *       env = CONNECT_ENV; op ∈ ops) → 403 operator_invalid |
 *       operator_env_mismatch | op_not_permitted; a JWKS outage → 503
 *       operator_unverifiable
 *   0.  LEASE — `openLease` (30 s, the RP database's clock) BETWEEN the
 *       offline and the live check (§6.5 step 0, P77-13 r5). Every local
 *       transaction of the op then runs on `withOperatorLease(db, opId)`;
 *       the lease is finished on EVERY exit, refusals included.
 *   2.  live `readEstateMaintenance({ maxAgeMs: 0 })` → unreadable → 503
 *       maintenance_unverifiable (nothing written); `!active` → 403
 *       maintenance_off; `jti ≠ claims.jti` → 403 operator_superseded
 *   3.  BIND to the user: `body.sourceUserRef` is the local user; fence /
 *       activate / release resolve that user's OPEN handoff server-side and a
 *       supplied `handoffId` must equal it → else 403 handoff_mismatch,
 *       nothing written; release with none → 200 no_handoff; `deactivate`
 *       needs an allowlist entry for (CONNECT_ENV, this system, that user) →
 *       else 403 not_allowlisted; `prepare` for a user with an open handoff
 *       resumes it (the driver does).
 *   4.  Only then the driver, with `operatorCutover: true`, over the leased
 *       db, with a transport that forwards the token on every Connect call.
 *
 * `drain` (ops `drain`) runs `drainLeases` on the UNLEASED client — a drain
 * must not claim a lease — after the same token + live checks (the lifter
 * mints from the rotated jti, so its live check passes; anyone else's is
 * `operator_superseded`). `state` adds `counts.inFlightOps` from the lease
 * table and lists the open handoffs' user refs (what the abort releases).
 * `reconcile` is one lease per call over ≤ 10 rows → `{ remaining }`.
 * `inventory` is paged and carries DIGESTS ONLY.
 *
 * `sessionFreshness` (§9.4) answers a slides parent question FROM THE
 * SUPPLIED LINEAGE — ledger (sid-scoped + subject-wide, revoked_at >
 * authTime) → the lineage-aware account-version lookup with `{ sub,
 * sourceUserRef: parentUserId, aeid, grantId }` honouring `maxAgeMs` →
 * mirror — never from its own session or a token it holds, so it needs no
 * browser traffic and answers identically across a process restart.
 *
 * Ported-From: cadra-web@b615864c:src/lib/api/internal-auth.ts
 * Ported-From: cadra-web@b615864c:src/app/api/v1/internal/connect/membership-check/route.ts
 * Ported-From: cadra-web@b615864c:src/app/api/v1/internal/connect/email-reserved/route.ts
 * Ported-From: cadra-web@b615864c:src/app/api/v1/internal/connect/credential-handoff/route.ts
 */

import { randomUUID, timingSafeEqual } from 'node:crypto'

import type { HandoffClass, RpAdapter, RpSqlClient, RpState, RpSystem, RpUserInventoryRow } from '../adapter/index.js'
import { createHandoffDriver, isHandoffClass, type DriverHooks, type HandoffLogger } from '../server/handoff/driver.js'
import {
  countInFlightLeases,
  drainLeases,
  finishLease,
  isOperatorLeaseExpired,
  openLease,
  withOperatorLease,
} from '../server/handoff/lease.js'
import { reconcile } from '../server/handoff/reconciler.js'
import { sweepMappings } from '../server/handoff/sweep.js'
import { createHandoffTransport, type HandoffTransport } from '../server/handoff/transport.js'
import { assertCredentialFresh, isConfiguredIssuer, type FreshnessRefusal } from '../server/revocation/freshness.js'
import { readEstateMaintenance } from '../server/revocation/maintenance.js'
import { verifyOperatorToken } from '../server/revocation/operator-token.js'

// =============================================================================
// Types
// =============================================================================

export type ConnectEnv = 'local' | 'dev' | 'prod'
export const CONNECT_ENVS: readonly ConnectEnv[] = ['local', 'dev', 'prod']
export function isConnectEnv(v: unknown): v is ConnectEnv {
  return typeof v === 'string' && (CONNECT_ENVS as readonly string[]).includes(v)
}

export const INTERNAL_API_KEY_HEADER = 'X-Internal-API-Key'
export const CUTOVER_OPERATOR_HEADER = 'X-Cutover-Operator'

/** Internal keys that must NEVER be reused as the Connect → RP key. */
export const SHARED_INTERNAL_KEY_ENV_NAMES: readonly string[] = ['CADRA_API_INTERNAL_KEY', 'YOBO_INTERNAL_API_KEY', 'INTERNAL_API_KEY']

/** The ops of §5.3, and which need the operator token. */
export const HANDOFF_OPS = [
  'inventory',
  'state',
  'sweep-mappings',
  'drain',
  'prepare',
  'fence',
  'activate',
  'release',
  'reconcile',
  'stamp-issuer',
  'quarantine-binding',
  'retire-email',
  'deactivate',
] as const
export type HandoffOp = (typeof HANDOFF_OPS)[number]
export const RP_KEY_ONLY_OPS: readonly HandoffOp[] = ['inventory', 'state', 'sweep-mappings']
export const isHandoffOp = (v: unknown): v is HandoffOp => typeof v === 'string' && (HANDOFF_OPS as readonly string[]).includes(v)

export interface DeactivateAllowlistEntry {
  env: ConnectEnv
  system: RpSystem
  sourceUserRef: string
  reason: string
}

export interface MembershipAnswer {
  found: boolean
  active: boolean
  orgs: Array<{ sourceOrgRef: string; orgName: string; status: string }>
}

/** What the estate driver reads per RP: the adapter's state plus what the lift needs (§6.3 step 6). */
export interface RpStateAnswer extends RpState {
  /** Local user refs of every open (`prepared` | `fenced`) handoff — what `off --abort` releases. */
  openHandoffRefs: string[]
}

/** One inventory row: `RpUserInventoryRow` (digests only) plus the two flags the manifest builder needs. */
export interface InventoryRowAnswer extends RpUserInventoryRow {
  system: boolean
  /** An allowlist `deactivate` entry exists for this env + user (D18). */
  deactivate: boolean
}

export interface ConnectInternalRouteDeps {
  system: RpSystem
  /** This RP's `CONNECT_ENV`. */
  env: ConnectEnv
  /** The env var holding this RP's Connect → RP key (e.g. `CONNECT_INTERNAL_KEY`). */
  keyEnvName: string
  /** Where env vars are read. Default `process.env`. */
  environment?: Record<string, string | undefined>
  /** Env var names whose value must not equal the key (default `SHARED_INTERNAL_KEY_ENV_NAMES`). */
  sharedKeyEnvNames?: readonly string[]
  /** The privileged SQL client (leases, the ledger, freshness reads). */
  sql: RpSqlClient
  /** The adapter over a given (possibly leased) client. A plain adapter: `() => adapter`. */
  adapter: (db: RpSqlClient) => RpAdapter
  /** The RP → Connect side: issuer + this RP's `YOBO_CONNECT_INTERNAL_API_KEY`. */
  connect: { issuer: string; rpKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }
  /** `YOBO_CONNECT_ENABLED` as this process serves it. */
  connectEnabled: () => boolean
  /** D18 allowlist (the committed file), filtered here by env + system. */
  deactivateAllowlist?: readonly DeactivateAllowlistEntry[] | (() => readonly DeactivateAllowlistEntry[])
  /** App-specific: the D7 membership answer. Absent → the route answers 503 not_configured. */
  membership?: (q: { issuer: string; sub: string }) => Promise<MembershipAnswer>
  /** App-specific: D19 — an unbound local user holds this email. Absent → 503 not_configured. */
  emailReserved?: (email: string) => Promise<boolean>
  inventoryPageSize?: number
  now?: () => Date
  logger?: Pick<Console, 'error' | 'warn' | 'log'>
  handoffLog?: HandoffLogger
  /** TEST-ONLY pause points. */
  hooks?: {
    /** After the live switch check passed, before the driver runs (the §6.5 orphan case). */
    afterLiveCheck?: (ctx: { op: HandoffOp; opId: string; sourceUserRef: string | null }) => Promise<void>
    driver?: DriverHooks
  }
}

export type RouteHandler = (request: Request) => Promise<Response>

export interface ConnectInternalRoutes {
  membershipCheck: RouteHandler
  emailReserved: RouteHandler
  credentialHandoff: RouteHandler
  sessionFreshness: RouteHandler
  /** Test seam: re-arm the once-only misconfiguration log. */
  __resetAuthLogForTests(): void
}

// =============================================================================
// withConnectInternalAuth
// =============================================================================

export interface ConnectInternalAuthOptions {
  keyEnvName: string
  environment?: Record<string, string | undefined>
  sharedKeyEnvNames?: readonly string[]
  logger?: Pick<Console, 'error'>
}

const NO_STORE = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const
export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...headers } })

function keysMatch(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))
}

/**
 * The Connect → RP key gate. Returns `{ ok: true, key }` or the response to
 * send. `logged` is the once-only latch, shared by every route of one factory.
 */
export function createConnectInternalAuth(opts: ConnectInternalAuthOptions): {
  check(request: Request): { ok: true } | { ok: false; response: Response }
  wrap(handler: RouteHandler): RouteHandler
  resetLog(): void
} {
  const logger = opts.logger ?? console
  const environment = opts.environment ?? process.env
  const shared = opts.sharedKeyEnvNames ?? SHARED_INTERNAL_KEY_ENV_NAMES
  let logged = false

  function misconfiguration(key: string | undefined): string | null {
    if (!key) return `${opts.keyEnvName} not configured`
    for (const name of shared) {
      if (name !== opts.keyEnvName && environment[name] && environment[name] === key) return `${opts.keyEnvName} equals ${name}`
    }
    return null
  }

  function check(request: Request): { ok: true } | { ok: false; response: Response } {
    const key = environment[opts.keyEnvName]
    const problem = misconfiguration(key)
    if (problem) {
      if (!logged) {
        logged = true
        logger.error(`[connect-internal-auth] ${problem}; /api/v1/internal/connect/* answers 503`)
      }
      return { ok: false, response: json(503, { error: 'not_configured' }) }
    }
    if (!keysMatch(request.headers.get(INTERNAL_API_KEY_HEADER), key!)) {
      return { ok: false, response: json(401, { error: 'unauthorized' }) }
    }
    return { ok: true }
  }

  return {
    check,
    wrap: (handler) => async (request) => {
      const c = check(request)
      if (!c.ok) return c.response
      try {
        return await handler(request)
      } catch (err) {
        logger.error('[connect-internal-auth] handler error:', err)
        return json(500, { error: 'internal_error' })
      }
    },
    resetLog: () => {
      logged = false
    },
  }
}

/** The middleware shape the port had: `withConnectInternalAuth(request, handler, opts)`. */
export async function withConnectInternalAuth(request: Request, handler: RouteHandler, opts: ConnectInternalAuthOptions): Promise<Response> {
  return createConnectInternalAuth(opts).wrap(handler)(request)
}

// =============================================================================
// The factory
// =============================================================================

async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, any>) : {}
  } catch {
    return {}
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A local user ref is the decimal id; anything else is a 400. */
function parseUserRef(v: unknown): { ref: string; id: number } | null {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) return { ref: String(v), id: v }
  if (typeof v === 'string' && /^\d{1,15}$/.test(v)) return { ref: v, id: Number(v) }
  return null
}

function isLockNotAvailable(err: unknown): boolean {
  let cur: any = err
  for (let i = 0; cur && i < 6; i += 1) {
    if (cur?.code === '55P03' || /could not obtain lock/i.test(String(cur?.message ?? ''))) return true
    cur = cur.cause
  }
  return false
}

/** Adapter refusals raised as errors with a `code` (retire-email's `source_changed`, `merge_not_supported`). */
function refusalCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[a-z_]+$/.test(code) && !/^\d/.test(code) ? code : null
}

export function createConnectInternalRoutes(deps: ConnectInternalRouteDeps): ConnectInternalRoutes {
  const logger = deps.logger ?? console
  const now = deps.now ?? (() => new Date())
  const auth = createConnectInternalAuth({ keyEnvName: deps.keyEnvName, environment: deps.environment, sharedKeyEnvNames: deps.sharedKeyEnvNames, logger })
  const issuer = deps.connect.issuer.trim().replace(/\/+$/, '')
  const pageSize = Math.max(1, Math.min(1000, deps.inventoryPageSize ?? 200))
  const allowlist = (): readonly DeactivateAllowlistEntry[] =>
    (typeof deps.deactivateAllowlist === 'function' ? deps.deactivateAllowlist() : deps.deactivateAllowlist) ?? []
  const allowlisted = (ref: string): DeactivateAllowlistEntry | null =>
    allowlist().find((e) => e.env === deps.env && e.system === deps.system && String(e.sourceUserRef) === ref) ?? null

  const transportFor = (operatorToken: string | null): HandoffTransport =>
    createHandoffTransport({
      issuer,
      rpKey: deps.connect.rpKey,
      system: deps.system,
      operatorToken: () => operatorToken,
      fetchImpl: deps.connect.fetchImpl,
      timeoutMs: deps.connect.timeoutMs,
    })

  // ---------------------------------------------------------------------------
  // membership-check (D7) and email-reserved (D19)
  // ---------------------------------------------------------------------------

  const membershipCheck: RouteHandler = auth.wrap(async (request) => {
    if (!deps.membership) return json(503, { error: 'not_configured' })
    const body = await readJson(request)
    const iss = typeof body.issuer === 'string' ? body.issuer.trim() : ''
    const sub = typeof body.sub === 'string' ? body.sub.trim() : ''
    if (!iss || !sub || iss.length > 255 || sub.length > 255) return json(400, { error: 'invalid_body' })
    // p77 FIX-issuer-isolation — membership is only ever vouched for THIS RP's
    // configured issuer. A subject of any other identity system is not a
    // member here, whatever the app's lookup would match; the app is not asked.
    if (!isConfiguredIssuer(iss, issuer)) {
      logger.warn('[connect/membership-check] foreign issuer — answered not found')
      return json(200, { found: false, active: false, orgs: [] } satisfies MembershipAnswer)
    }
    try {
      return json(200, await deps.membership({ issuer, sub }))
    } catch (err) {
      logger.error('[connect/membership-check] read failed', err)
      return json(503, { error: 'db_unavailable' })
    }
  })

  const emailReserved: RouteHandler = auth.wrap(async (request) => {
    if (!deps.emailReserved) return json(503, { error: 'not_configured' })
    const body = await readJson(request)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    // No detail on a refusal: the message would echo the email back.
    if (!email || email.length > 320) return json(400, { error: 'invalid_body' })
    try {
      return json(200, { reserved: await deps.emailReserved(email) })
    } catch (err) {
      logger.error('[connect/email-reserved] read failed', err)
      return json(503, { error: 'db_unavailable' })
    }
  })

  // ---------------------------------------------------------------------------
  // session-freshness (§9.4)
  // ---------------------------------------------------------------------------

  const sessionFreshness: RouteHandler = auth.wrap(async (request) => {
    const body = await readJson(request)
    const parent = parseUserRef(body.parentUserId)
    const iss = typeof body.issuer === 'string' ? body.issuer.trim() : ''
    const sub = typeof body.sub === 'string' ? body.sub.trim() : ''
    const kind = body.kind === 'app_local' ? 'app_local' : body.kind === 'oidc' ? 'oidc' : null
    const cv = typeof body.cv === 'number' && Number.isInteger(body.cv) ? body.cv : null
    const authTime = typeof body.authTime === 'number' && Number.isFinite(body.authTime) ? Math.floor(body.authTime) : null
    if (!parent || !iss || !sub || !kind || cv == null || authTime == null) return json(400, { error: 'invalid_body' })
    const maxAgeMs = typeof body.maxAgeMs === 'number' && Number.isFinite(body.maxAgeMs) ? Math.max(0, body.maxAgeMs) : undefined
    const nowMs = now().getTime()
    // p77 FIX-issuer-isolation (STORY-033 AC3 / F2). The lookup below always
    // asks the CONFIGURED issuer, so a lineage naming another identity system
    // (Cadra Connect) used to be answered fresh:true whenever its `sub` happened
    // to resolve here. Two gates, both before any ledger read, lookup or cache:
    //   1. the lineage's issuer IS this RP's configured issuer (normalized);
    //   2. the parent's own user row is bound to exactly (iss, sub).
    // Either failure is a fact about the request, not the account: answered
    // with no facts and never cached (the version caches are never touched).
    const bare = (reason: FreshnessRefusal) =>
      json(200, { fresh: false, reason, version: null, active: null, epoch: null, grant: null, revokedAfter: null, checkedAt: nowMs })
    if (!isConfiguredIssuer(iss, issuer)) {
      logger.warn('[connect/session-freshness] lineage names a foreign issuer — refused', { parentUserId: parent.ref })
      return bare('foreign_issuer')
    }
    let boundPair: { issuer: string; sub: string } | null
    try {
      const rows = await deps.sql.execute(`SELECT connect_issuer, connect_sub FROM users WHERE id = $1 LIMIT 1`, [parent.id])
      const r = rows[0]
      // D9's trust rule: a half-bound legacy row (NULL issuer, sub) can only
      // have come from this RP's one configured issuer (the backfill and the
      // D9 writer stamp it as exactly that), so it counts as that issuer here.
      boundPair = r
        ? { issuer: r.connect_issuer == null ? (r.connect_sub == null ? '' : issuer) : String(r.connect_issuer), sub: String(r.connect_sub ?? '') }
        : null
    } catch (err) {
      logger.error('[connect/session-freshness] parent row read failed — refusing', err)
      return bare('unreadable')
    }
    if (!boundPair || !isConfiguredIssuer(boundPair.issuer, issuer) || boundPair.sub.trim() !== sub) {
      logger.warn('[connect/session-freshness] lineage is not the parent row\'s binding — refused', { parentUserId: parent.ref })
      return bare('binding_mismatch')
    }
    const verdict = await assertCredentialFresh(
      {
        kind: 'derived',
        lineage: kind,
        localUserId: parent.id,
        sourceUserRef: parent.ref,
        issuer,
        sub,
        sid: typeof body.sid === 'string' ? body.sid : null,
        cv,
        aeid: typeof body.aeid === 'string' ? body.aeid : null,
        grantId: typeof body.grantId === 'string' ? body.grantId : null,
        issuedAtSeconds: authTime,
      },
      {
        execute: deps.sql.execute,
        lookup: { issuer, rpKey: deps.connect.rpKey, fetchImpl: deps.connect.fetchImpl, timeoutMs: deps.connect.timeoutMs },
        maxAgeMs,
        nowMs,
        logger,
      },
    )
    const reason: FreshnessRefusal | undefined = verdict.ok ? undefined : verdict.reason
    return json(200, { fresh: verdict.ok, ...(reason ? { reason } : {}), ...verdict.facts })
  })

  // ---------------------------------------------------------------------------
  // credential-handoff — the ops
  // ---------------------------------------------------------------------------

  async function stateAnswer(adapter: RpAdapter): Promise<RpStateAnswer> {
    const state = await adapter.state()
    const inFlightOps = await countInFlightLeases(deps.sql)
    const refs = state.openHandoffRefs ?? []
    return { ...state, counts: { ...state.counts, inFlightOps }, openHandoffs: refs.length || state.openHandoffs, openHandoffRefs: refs }
  }

  async function inventoryAnswer(adapter: RpAdapter, body: Record<string, any>): Promise<Response> {
    if (body.env !== undefined && body.env !== deps.env) return json(403, { error: 'env_mismatch', env: deps.env })
    const cursor = typeof body.cursor === 'number' && Number.isSafeInteger(body.cursor) ? body.cursor : 0
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(pageSize, Math.floor(body.limit)) : pageSize
    const rows: InventoryRowAnswer[] = []
    let nextCursor: number | null = null
    for await (const row of adapter.inventory()) {
      if (row.id <= cursor) continue
      if (rows.length === limit) {
        nextCursor = rows[rows.length - 1]!.id
        break
      }
      // Digests only, by construction of the row type — and asserted: a
      // bcrypt-shaped value can never leave this route.
      const digest = row.passwordDigest && /^[0-9a-f]{64}$/i.test(row.passwordDigest) ? row.passwordDigest : row.passwordDigest ? 'invalid_digest' : null
      rows.push({ ...row, passwordDigest: digest, system: adapter.isSystemIdentity(row), deactivate: allowlisted(String(row.id)) !== null })
    }
    return json(200, { op: 'inventory', system: deps.system, env: deps.env, rows, nextCursor })
  }

  /** The offline + lease + live contract. Returns the claims or the refusal response. */
  async function authorizeOperator(request: Request, op: HandoffOp, sourceUserRef: string | null): Promise<
    | { ok: true; raw: string; jti: string; opId: string }
    | { ok: false; response: Response }
  > {
    const raw = request.headers.get(CUTOVER_OPERATOR_HEADER)
    if (!raw) return { ok: false, response: json(401, { error: 'operator_token_required', op }) }
    const v = await verifyOperatorToken(raw, { issuer, audience: deps.system, env: deps.env, op, fetchImpl: deps.connect.fetchImpl })
    if (!v.ok) {
      if (v.transient) return { ok: false, response: json(503, { error: 'operator_unverifiable', detail: v.detail }) }
      return { ok: false, response: json(403, { error: v.reason, detail: v.detail }) }
    }
    // Step 0: the lease, between the offline and the live check. `drain` takes none.
    const opId = randomUUID()
    if (op !== 'drain') await openLease(deps.sql, { opId, op, sourceUserRef, operatorJti: v.jti })
    const live = await readEstateMaintenance({ issuer, rpKey: deps.connect.rpKey, maxAgeMs: 0, fetchImpl: deps.connect.fetchImpl, timeoutMs: deps.connect.timeoutMs })
    const refuse = async (status: number, error: string, detail?: string) => {
      if (op !== 'drain') await finishLease(deps.sql, opId, error)
      return { ok: false as const, response: json(status, { error, ...(detail ? { detail } : {}) }) }
    }
    if (!live.ok) return refuse(503, 'maintenance_unverifiable', live.detail)
    if (!live.state.active) return refuse(403, 'maintenance_off')
    if (live.state.jti !== v.jti) return refuse(403, 'operator_superseded')
    return { ok: true, raw, jti: v.jti, opId }
  }

  const credentialHandoff: RouteHandler = auth.wrap(async (request) => {
    const body = await readJson(request)
    const op = body.op
    if (!isHandoffOp(op)) return json(400, { error: 'invalid_op' })
    if (body.handoffId !== undefined && !UUID_RE.test(String(body.handoffId))) return json(400, { error: 'handoffId_invalid' })

    // ── RP-key-only ops (a token, if sent, is ignored) ──────────────────────
    if (op === 'inventory') return inventoryAnswer(deps.adapter(deps.sql), body)
    if (op === 'state') return json(200, { op, state: await stateAnswer(deps.adapter(deps.sql)) })
    if (op === 'sweep-mappings') {
      const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.floor(body.limit) : undefined
      const report = await sweepMappings({ adapter: deps.adapter(deps.sql), transport: transportFor(null), limit, log: (e) => deps.handoffLog?.({ kind: 'refused', userId: e.userId, detail: { sweep: e.kind, ...e.detail } }) })
      return json(200, { op, report })
    }

    // ── Every other op needs the operator token, flag on or off ─────────────
    const userRef = parseUserRef(body.sourceUserRef)
    const needsUser: readonly HandoffOp[] = ['prepare', 'fence', 'activate', 'release', 'quarantine-binding', 'retire-email', 'deactivate']
    if (needsUser.includes(op) && !userRef && body.sourceUserRef !== undefined) return json(400, { error: 'sourceUserRef_invalid' })

    const authz = await authorizeOperator(request, op, userRef?.ref ?? null)
    if (!authz.ok) return authz.response
    const { opId, raw } = authz

    if (op === 'drain') {
      const r = await drainLeases(deps.sql)
      return json(200, { op, expired: r.expired })
    }

    // The body's user is required from here on (reconcile and stamp-issuer excepted).
    if (needsUser.includes(op) && !userRef) {
      await finishLease(deps.sql, opId, 'invalid_body')
      return json(400, { error: 'sourceUserRef_required' })
    }

    const leased = withOperatorLease(deps.sql, opId)
    const adapter = deps.adapter(leased)
    const transport = transportFor(raw)
    let outcome = 'ok'
    try {
      if (deps.hooks?.afterLiveCheck) await deps.hooks.afterLiveCheck({ op, opId, sourceUserRef: userRef?.ref ?? null })

      // Step 3 — bind to the user BEFORE any write.
      if (op === 'fence' || op === 'activate' || op === 'release') {
        const open = await adapter.handoffTable.readOpenHandoffForUser(userRef!.id)
        if (body.handoffId !== undefined && (!open || open.handoffId !== String(body.handoffId))) {
          outcome = 'handoff_mismatch'
          return json(403, { error: 'handoff_mismatch', sourceUserRef: userRef!.ref })
        }
      }
      if (op === 'deactivate' && !allowlisted(userRef!.ref)) {
        outcome = 'not_allowlisted'
        return json(403, { error: 'not_allowlisted', sourceUserRef: userRef!.ref, env: deps.env })
      }

      const driver = () =>
        createHandoffDriver({ adapter, transport, connectEnabled: deps.connectEnabled(), operatorCutover: true, now, log: deps.handoffLog, hooks: deps.hooks?.driver })

      switch (op) {
        case 'prepare': {
          const expectedClass = body.expectedClass
          if (expectedClass !== undefined && !isHandoffClass(expectedClass)) return json(400, { error: 'expectedClass_invalid' })
          const r = await driver().prepare(userRef!.id, expectedClass ? { expectedClass: expectedClass as HandoffClass } : {})
          if (!r.ok) {
            outcome = r.outcome
            const status = r.outcome === 'op_expired' || r.outcome === 'in_flight' || r.outcome === 'class_mismatch' ? 409 : r.outcome === 'operator_superseded' || r.outcome === 'connect_disabled' ? 403 : 200
            return json(status, { op, outcome: r.outcome, error: status === 200 ? undefined : r.outcome, handoff: r.handoff, detail: r.detail })
          }
          outcome = `prepare:${r.remote.outcome}`
          return json(200, { op, outcome: r.resumed ? 'resumed' : 'prepared', handoffClass: r.handoffClass, resumed: r.resumed, handoff: r.handoff, remote: { ok: r.remote.ok, outcome: r.remote.outcome, detail: r.remote.detail } })
        }
        case 'fence':
        case 'activate': {
          const r = op === 'fence' ? await driver().fence(userRef!.id) : await driver().activate(userRef!.id)
          outcome = r.outcome
          const status = r.outcome === 'op_expired' || r.outcome === 'in_flight' ? 409 : r.outcome === 'operator_superseded' ? 403 : 200
          return json(status, { op, ok: r.ok, outcome: r.outcome, error: status === 200 ? undefined : r.outcome, handoff: r.handoff, detail: r.detail })
        }
        case 'release': {
          const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : undefined
          const r = await driver().release(userRef!.id, reason)
          outcome = r.outcome
          const status = r.outcome === 'op_expired' || r.outcome === 'in_flight' ? 409 : 200
          return json(status, { op, outcome: r.outcome, error: status === 200 ? undefined : r.outcome, handoff: r.handoff })
        }
        case 'reconcile': {
          const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(10, Math.floor(body.limit)) : 10
          const report = await reconcile({ adapter, transport, connectEnabled: deps.connectEnabled(), now, log: deps.handoffLog, limit })
          outcome = report.opExpired ? 'op_expired' : 'ok'
          return json(200, { op, remaining: report.remaining, report })
        }
        case 'stamp-issuer': {
          const ids = Array.isArray(body.userIds) ? body.userIds.map(parseUserRef) : null
          if (!ids || ids.some((x) => !x) || ids.length === 0 || ids.length > 1000) return json(400, { error: 'userIds_invalid' })
          // The trusted issuer is this RP's own configured issuer, never a value from a request or a row.
          if (typeof body.issuer !== 'string' || body.issuer.trim().replace(/\/+$/, '') !== issuer) return json(400, { error: 'issuer_mismatch' })
          const stamped = await adapter.stampIssuer(ids.map((x) => x!.id), issuer)
          return json(200, { op, stamped })
        }
        case 'quarantine-binding': {
          const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : null
          if (!reason) return json(400, { error: 'reason_required' })
          await adapter.quarantineBinding(userRef!.id, reason)
          return json(200, { op, outcome: 'quarantined', sourceUserRef: userRef!.ref })
        }
        case 'retire-email': {
          const surviving = parseUserRef(body.survivingUserId)
          const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
          const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : ''
          if (!surviving || !email || !reason) return json(400, { error: 'invalid_body' })
          if (surviving.id === userRef!.id) return json(409, { error: 'merge_not_supported' })
          const r = await adapter.retireEmail(userRef!.id, surviving.id, email, reason)
          outcome = r
          return json(200, { op, outcome: r, sourceUserRef: userRef!.ref })
        }
        case 'deactivate': {
          const entry = allowlisted(userRef!.ref)!
          await adapter.deactivate(userRef!.id, typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : entry.reason)
          return json(200, { op, outcome: 'deactivated', sourceUserRef: userRef!.ref })
        }
        default:
          return json(400, { error: 'invalid_op' })
      }
    } catch (err) {
      if (isOperatorLeaseExpired(err)) {
        outcome = 'op_expired'
        return json(409, { error: 'op_expired', op })
      }
      if (isLockNotAvailable(err)) {
        outcome = 'in_flight'
        return json(409, { error: 'in_flight', op })
      }
      const code = refusalCode(err)
      if (code) {
        outcome = code
        return json(409, { error: code, op })
      }
      outcome = 'error'
      throw err
    } finally {
      await finishLease(deps.sql, opId, outcome).catch((e) => logger.error('[connect/credential-handoff] finishLease failed', e))
    }
  })

  return { membershipCheck, emailReserved, credentialHandoff, sessionFreshness, __resetAuthLogForTests: () => auth.resetLog() }
}

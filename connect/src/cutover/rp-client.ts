/**
 * p77 STORY-005 — `RpOpsClient`: the estate driver's HTTP client to ONE
 * relying party's `POST <origin>/api/v1/internal/connect/credential-handoff`
 * (specs.md §5.3, D23).
 *
 * WHY. A polyrepo cannot import another repo's adapter, so the driver in
 * yobo-auth speaks only HTTP to each RP: that RP's `CONNECT_INTERNAL_KEY`
 * in `X-Internal-API-Key`, and — on every mutating op — the operator token
 * in `X-Cutover-Operator`, resolved per call so a re-mint is seen by the
 * very next request. The bodies and answers here are the ones
 * `createConnectInternalRoutes` (`../next-auth/internal-routes.ts`) pins;
 * both sides of the contract live in this package.
 *
 * NEVER A VERIFIER: `inventory` answers digests; `prepare` asks the RP to
 * post its own hash to Connect. Nothing here ever carries one.
 */

import type { HandoffClass, RpSystem } from '../adapter/index.js'
import type { HandoffOp, InventoryRowAnswer, RpStateAnswer } from '../next-auth/internal-routes.js'

export const RP_HANDOFF_ROUTE_PATH = '/api/v1/internal/connect/credential-handoff'

export interface RpOpsClientConfig {
  system: RpSystem
  /** The RP's origin, e.g. `https://crm.yobolabs.ai`. */
  origin: string
  /** That RP's `CONNECT_INTERNAL_KEY`. */
  rpKey: string
  /** The operator token to send on every op that needs one; resolved per call. */
  operatorToken?: () => string | null | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** One RP answer. `status: 0` is a transport failure (`error` says what). */
export interface RpReply<T = any> {
  status: number
  json: T | null
  error: string | null
}

export interface RpOpsClient {
  readonly system: RpSystem
  readonly origin: string
  op<T = any>(op: HandoffOp, body?: Record<string, unknown>, opts?: { withOperator?: boolean }): Promise<RpReply<T>>
  inventory(body?: { env?: string; cursor?: number; limit?: number }): Promise<RpReply<{ rows: InventoryRowAnswer[]; nextCursor: number | null }>>
  /** Every row, page by page. Throws on a non-200. */
  inventoryAll(env?: string): Promise<InventoryRowAnswer[]>
  state(): Promise<RpReply<{ state: RpStateAnswer }>>
  sweepMappings(limit?: number): Promise<RpReply>
  drain(): Promise<RpReply<{ expired: number }>>
  prepare(sourceUserRef: string, expectedClass?: HandoffClass): Promise<RpReply>
  fence(sourceUserRef: string, handoffId?: string): Promise<RpReply>
  activate(sourceUserRef: string, handoffId?: string): Promise<RpReply>
  release(sourceUserRef: string, reason?: string, handoffId?: string): Promise<RpReply>
  reconcile(limit?: number): Promise<RpReply<{ remaining: number }>>
  stampIssuer(userIds: number[], issuer: string): Promise<RpReply<{ stamped: number }>>
  quarantineBinding(sourceUserRef: string, reason: string): Promise<RpReply>
  retireEmail(sourceUserRef: string, survivingUserId: number, email: string, reason: string): Promise<RpReply<{ outcome: 'retired' | 'already_retired' }>>
  deactivate(sourceUserRef: string, reason?: string): Promise<RpReply>
  /** The same RP, another operator-token provider (the lifter's, the tick's). */
  withOperatorToken(operatorToken: () => string | null | undefined): RpOpsClient
}

const DEFAULT_TIMEOUT_MS = 15_000

export function createRpOpsClient(cfg: RpOpsClientConfig): RpOpsClient {
  const origin = (cfg.origin ?? '').trim().replace(/\/+$/, '')
  if (!origin) throw new Error('createRpOpsClient: origin is required')
  if (!cfg.rpKey) throw new Error(`createRpOpsClient: rpKey is required for ${cfg.system}`)
  const url = `${origin}${RP_HANDOFF_ROUTE_PATH}`

  async function op<T>(name: HandoffOp, body: Record<string, unknown> = {}, opts: { withOperator?: boolean } = {}): Promise<RpReply<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Internal-API-Key': cfg.rpKey,
      'X-Service-Name': 'yobo-connect',
    }
    if (opts.withOperator !== false) {
      const token = cfg.operatorToken?.()
      if (token) headers['X-Cutover-Operator'] = token
    }
    try {
      const res = await (cfg.fetchImpl ?? fetch)(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ op: name, ...body }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
      let json: T | null = null
      try {
        json = (await res.json()) as T
      } catch {
        json = null
      }
      return { status: res.status, json, error: null }
    } catch (err) {
      return { status: 0, json: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return {
    system: cfg.system,
    origin,
    op,
    inventory: (body = {}) => op('inventory', body, { withOperator: false }),
    async inventoryAll(env) {
      const out: InventoryRowAnswer[] = []
      let cursor = 0
      for (;;) {
        const r = await op<{ rows: InventoryRowAnswer[]; nextCursor: number | null }>('inventory', { ...(env ? { env } : {}), cursor }, { withOperator: false })
        if (r.status !== 200 || !r.json) throw new Error(`${cfg.system} inventory: ${r.status === 0 ? r.error : `HTTP ${r.status} ${replyError(r)}`}`)
        out.push(...r.json.rows)
        if (r.json.nextCursor == null) return out
        cursor = r.json.nextCursor
      }
    },
    state: () => op('state', {}, { withOperator: false }),
    sweepMappings: (limit) => op('sweep-mappings', limit ? { limit } : {}, { withOperator: false }),
    drain: () => op('drain'),
    prepare: (sourceUserRef, expectedClass) => op('prepare', { sourceUserRef, ...(expectedClass ? { expectedClass } : {}) }),
    fence: (sourceUserRef, handoffId) => op('fence', { sourceUserRef, ...(handoffId ? { handoffId } : {}) }),
    activate: (sourceUserRef, handoffId) => op('activate', { sourceUserRef, ...(handoffId ? { handoffId } : {}) }),
    release: (sourceUserRef, reason, handoffId) => op('release', { sourceUserRef, ...(reason ? { reason } : {}), ...(handoffId ? { handoffId } : {}) }),
    reconcile: (limit) => op('reconcile', limit ? { limit } : {}),
    stampIssuer: (userIds, issuer) => op('stamp-issuer', { userIds, issuer }),
    quarantineBinding: (sourceUserRef, reason) => op('quarantine-binding', { sourceUserRef, reason }),
    retireEmail: (sourceUserRef, survivingUserId, email, reason) => op('retire-email', { sourceUserRef, survivingUserId, email, reason }),
    deactivate: (sourceUserRef, reason) => op('deactivate', { sourceUserRef, ...(reason ? { reason } : {}) }),
    withOperatorToken: (operatorToken) => createRpOpsClient({ ...cfg, operatorToken }),
  }
}

/** The error string the RP put in the body, or the status when it put none. */
export function replyError(r: RpReply): string {
  const e = (r.json as { error?: unknown } | null)?.error
  return typeof e === 'string' && e ? e : r.status === 0 ? (r.error ?? 'transport') : String(r.status)
}

export const isTransientRpReply = (r: RpReply): boolean => r.status === 0 || r.status >= 500

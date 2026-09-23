/**
 * p77 STORY-003 — the estate maintenance switch READER (D26, specs.md §6.5 step 2, §8).
 *
 * WHY. Every interactive login and credential write in the estate pauses
 * while the switch is on. The RPs learn of it through ONE route on the IdP,
 * `GET <issuer>/api/internal/connect/maintenance` (STORY-040), read with the
 * RP's own key. This module is the client; the login gate (STORY-036) and the
 * operator contract (STORY-005) decide what to do with the answer.
 *
 * THE RULE THAT MATTERS (feedback P77-22, round 5). ONLY a 200 whose body
 * validates as `{ active: boolean, jti: string | null, … }` is a READ. A 404,
 * 401, 403, 5xx, a malformed body or a transport failure is a FAILURE. A
 * failure is served from the last good read if that read is at most 15 s old,
 * and is `unreadable` otherwise — INCLUDING when no good read has ever
 * happened in this process. A freshly started RP that cannot reach the route
 * fails closed; the gate treats `unreadable` as active. A 404 is never "off":
 * the route ships first and alone (STORY-040), so no supported deployment
 * answers 404, and an IdP rolled back to a build without it must pause every
 * RP, the safe direction. A later `200 { active: false }` reopens.
 *
 * `maxAgeMs` (default 15 s) is how old a cached good read may be before the
 * route is asked again; `maxAgeMs: 0` always asks — the operator contract's
 * live check. The failure fallback window is the fixed 15 s regardless.
 */

/** The wire shape of STORY-040's route, camelCase. */
export interface EstateMaintenanceState {
  active: boolean
  /** The switch's current jti; null while off. */
  jti: string | null
  since: string | null
  reason: string | null
  extendedUntil: string | null
  firstActivationAt: string | null
}

export type EstateMaintenanceRead =
  | {
      ok: true
      state: EstateMaintenanceState
      /** `nowMs` of the good read this answer came from. */
      readAt: number
      /** True when this call did not reach the route (served from a good read ≤ 15 s old). */
      fromCache: boolean
    }
  | {
      ok: false
      reason: 'unreadable'
      /** What the last attempt saw (an HTTP status, a parse or transport error). */
      detail: string
    }

export interface EstateMaintenanceReaderConfig {
  issuer: string
  /** This RP's `YOBO_CONNECT_INTERNAL_API_KEY`. */
  rpKey: string
  /** A good read at most this old is served without asking. Default 15 s; 0 always asks. */
  maxAgeMs?: number
  fetchImpl?: typeof fetch
  timeoutMs?: number
  nowMs?: number
}

/** A failure is served from the last good read only while that read is at most this old. */
export const MAINTENANCE_FAILURE_GRACE_MS = 15_000
export const MAINTENANCE_DEFAULT_MAX_AGE_MS = 15_000

interface GoodRead {
  state: EstateMaintenanceState
  at: number
}

/** Last good read per issuer. Process-local. */
const lastGood = new Map<string, GoodRead>()

/** Test seam. */
export function __resetMaintenanceCacheForTests(): void {
  lastGood.clear()
}

const strOrNull = (v: unknown): string | null | undefined =>
  v === undefined ? undefined : v === null ? null : typeof v === 'string' ? v : undefined

/** The only thing a READ can be. Anything else is a failure. */
export function parseMaintenanceBody(body: unknown): EstateMaintenanceState | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (typeof b.active !== 'boolean') return null
  if (!(b.jti === null || typeof b.jti === 'string')) return null
  const since = strOrNull(b.since)
  const reason = strOrNull(b.reason)
  const extendedUntil = strOrNull(b.extendedUntil)
  const firstActivationAt = strOrNull(b.firstActivationAt)
  if (since === undefined && b.since !== undefined) return null
  if (reason === undefined && b.reason !== undefined) return null
  if (extendedUntil === undefined && b.extendedUntil !== undefined) return null
  if (firstActivationAt === undefined && b.firstActivationAt !== undefined) return null
  return {
    active: b.active,
    jti: b.jti,
    since: since ?? null,
    reason: reason ?? null,
    extendedUntil: extendedUntil ?? null,
    firstActivationAt: firstActivationAt ?? null,
  }
}

export async function readEstateMaintenance(cfg: EstateMaintenanceReaderConfig): Promise<EstateMaintenanceRead> {
  const issuer = cfg.issuer.trim().replace(/\/+$/, '')
  const nowMs = cfg.nowMs ?? Date.now()
  const maxAgeMs = Math.max(0, cfg.maxAgeMs ?? MAINTENANCE_DEFAULT_MAX_AGE_MS)
  const cached = lastGood.get(issuer)

  if (maxAgeMs > 0 && cached && nowMs - cached.at <= maxAgeMs) {
    return { ok: true, state: cached.state, readAt: cached.at, fromCache: true }
  }

  let detail: string
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 5_000)
    let res: Response
    try {
      res = await (cfg.fetchImpl ?? fetch)(`${issuer}/api/internal/connect/maintenance`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Internal-API-Key': cfg.rpKey },
        cache: 'no-store',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 200) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        body = undefined
      }
      const state = parseMaintenanceBody(body)
      if (state) {
        lastGood.set(issuer, { state, at: nowMs })
        return { ok: true, state, readAt: nowMs, fromCache: false }
      }
      detail = 'HTTP 200 with a malformed body'
    } else {
      detail = `HTTP ${res.status}`
    }
  } catch (err) {
    detail = `transport: ${err instanceof Error ? err.message : String(err)}`
  }

  // A failure. The last good read covers it for 15 s and no longer — and a
  // process that never had one has nothing to serve: unreadable, fail closed.
  if (cached && nowMs - cached.at <= MAINTENANCE_FAILURE_GRACE_MS) {
    return { ok: true, state: cached.state, readAt: cached.at, fromCache: true }
  }
  return { ok: false, reason: 'unreadable', detail }
}

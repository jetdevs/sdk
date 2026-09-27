/**
 * p77 STORY-041 — the IdP's source-system registry, read by the cutover and
 * estate tooling.
 *
 * WHY. This SDK used to hard-code the systems (`'crm' | 'yobo' | …`) and the
 * D10 driver order (`['crm', 'yobo']`). Connect is becoming a brand-neutral
 * IdP any business can join by config, so the list and the order live in the
 * IdP's `connect_source_systems` table, and the tooling asks the IdP for them:
 *
 *   GET <issuer>/api/internal/connect/source-systems
 *   X-Internal-API-Key: <the cron/operator key — scope `cutover:reconcile`>
 *   200 { systems: [{ key, displayName, kind, enabled, cutoverOrder }],
 *         plan: { order: [...], pilots: [...] } }
 *
 * Or the caller passes a `CutoverPlan` in its arguments. Every key is
 * validated (`isSourceSystemKey`); a malformed answer throws — the tooling
 * never falls back to a built-in list.
 */

import { isSourceSystemKey } from '../adapter/index.js'
import { assertCutoverPlan, type CutoverPlan } from './classify.js'

export const SOURCE_SYSTEMS_ROUTE_PATH = '/api/internal/connect/source-systems'

export type SourceSystemKind = 'password_rp' | 'identity_only'

export interface SourceSystemInfo {
  key: string
  displayName: string
  kind: SourceSystemKind
  enabled: boolean
  cutoverOrder: number | null
}

export interface SourceSystemsAnswer {
  systems: SourceSystemInfo[]
  plan: CutoverPlan
}

export class SourceSystemsFetchError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(`source-systems: ${message}`)
    this.name = 'SourceSystemsFetchError'
  }
}

/** Validate the IdP's answer (pure). Throws SourceSystemsFetchError. */
export function parseSourceSystemsAnswer(body: unknown): SourceSystemsAnswer {
  const b = body as { systems?: unknown; plan?: unknown } | null
  if (!b || !Array.isArray(b.systems)) throw new SourceSystemsFetchError('answer has no systems')
  const systems: SourceSystemInfo[] = b.systems.map((raw) => {
    const s = raw as Record<string, unknown>
    if (!isSourceSystemKey(s.key)) throw new SourceSystemsFetchError(`'${String(s.key)}' is not a source-system key`)
    if (s.kind !== 'password_rp' && s.kind !== 'identity_only') throw new SourceSystemsFetchError(`${s.key}: kind '${String(s.kind)}'`)
    const order = s.cutoverOrder
    if (order !== null && !(typeof order === 'number' && Number.isInteger(order) && order > 0)) throw new SourceSystemsFetchError(`${s.key}: cutoverOrder '${String(order)}'`)
    return { key: s.key, displayName: String(s.displayName ?? s.key), kind: s.kind, enabled: s.enabled === true, cutoverOrder: order as number | null }
  })
  let plan: CutoverPlan
  try {
    plan = assertCutoverPlan(b.plan as CutoverPlan)
  } catch (err) {
    throw new SourceSystemsFetchError((err as Error).message)
  }
  const known = new Set(systems.filter((s) => s.enabled && s.kind === 'password_rp').map((s) => s.key))
  for (const k of [...plan.order, ...plan.pilots]) {
    if (!known.has(k)) throw new SourceSystemsFetchError(`plan names '${k}', which is not an enabled password_rp system`)
  }
  return { systems, plan: { order: [...plan.order], pilots: [...plan.pilots] } }
}

/** Ask the IdP. Never follows a redirect (the key rides along). */
export async function fetchSourceSystems(input: {
  issuer: string
  key: string
  fetch?: typeof fetch
  timeoutMs?: number
}): Promise<SourceSystemsAnswer> {
  const f = input.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 5000)
  let res: Response
  try {
    res = await f(`${input.issuer.replace(/\/+$/, '')}${SOURCE_SYSTEMS_ROUTE_PATH}`, {
      method: 'GET',
      headers: { 'X-Internal-API-Key': input.key },
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    })
  } catch (err) {
    throw new SourceSystemsFetchError(`IdP unreachable (${(err as Error).message})`)
  } finally {
    clearTimeout(timer)
  }
  if (res.status !== 200) throw new SourceSystemsFetchError(`IdP answered ${res.status}`, res.status)
  return parseSourceSystemsAnswer(await res.json().catch(() => null))
}

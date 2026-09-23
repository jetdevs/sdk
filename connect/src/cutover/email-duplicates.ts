/**
 * p77 STORY-005 — `EmailAudit` / `EmailReconcile`: audited retirement of
 * duplicate `lower(email)` rows before M7 (specs.md §3.5; feedback P77-12).
 *
 * AUDIT is read-only over the RP `inventory` op: every `lower(email)` group
 * with more than one row, with the facts a person needs to decide (ids,
 * active, bound, authority). The operator writes the decision file — one
 * entry per group: `{ email, surviving, retire: [ids], reason }`.
 *
 * RECONCILE runs under the switch (D26, the repair window) with a token
 * whose ops are exactly `['retire-email']`, and calls the RP op
 * `retire-email { userId, survivingUserId, email, reason }` per retired id.
 * The RP does the one ordered transaction (both rows locked, RECEIPT FIRST,
 * then the recheck, then the retirement + ledger); this side treats
 * `already_retired` as done (the rerun the receipt exists for), refuses a
 * `merge` decision (`merge_not_supported` — an identity merge is a product
 * decision, not a migration), and reports `409 source_changed` as a
 * decision to be remade. A group is satisfied when every member but the
 * survivor is retired; when the audit prints zero groups, M7 may apply.
 */

import type { RpSystem } from '../adapter/index.js'
import type { ConnectEnv, InventoryRowAnswer } from '../next-auth/internal-routes.js'
import { replyError, type RpOpsClient } from './rp-client.js'
import type { MaintenanceSwitchRow } from './switch.js'

export interface EmailGroupMember {
  id: number
  isActive: boolean
  bound: boolean
  credentialAuthority: string
  connectSub: string | null
}

export interface EmailGroup {
  system: RpSystem
  email: string
  members: EmailGroupMember[]
}

export interface EmailDecision {
  email: string
  surviving: number
  retire: number[]
  reason: string
  /** Refused: an identity merge is not a migration. */
  merge?: boolean
}

const RETIRED_RE = /^retired\+\d+@retired\.invalid$/

/** The audit: every duplicate group per RP, read-only. */
export async function auditEmailDuplicates(rps: Partial<Record<RpSystem, RpOpsClient>>, env: ConnectEnv): Promise<EmailGroup[]> {
  const groups: EmailGroup[] = []
  for (const [system, client] of Object.entries(rps) as Array<[RpSystem, RpOpsClient]>) {
    const rows = await client.inventoryAll(env)
    groups.push(...groupDuplicates(system, rows))
  }
  return groups
}

export function groupDuplicates(system: RpSystem, rows: readonly InventoryRowAnswer[]): EmailGroup[] {
  const byEmail = new Map<string, InventoryRowAnswer[]>()
  for (const r of rows) {
    if (!r.email || RETIRED_RE.test(r.email)) continue
    const key = r.email.toLowerCase()
    const b = byEmail.get(key)
    if (b) b.push(r)
    else byEmail.set(key, [r])
  }
  const out: EmailGroup[] = []
  for (const [email, members] of [...byEmail.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (members.length < 2) continue
    out.push({ system, email, members: members.map((m) => ({ id: m.id, isActive: m.isActive, bound: Boolean(m.connectSub), credentialAuthority: m.credentialAuthority, connectSub: m.connectSub })) })
  }
  return out
}

export function renderAudit(groups: EmailGroup[]): string[] {
  if (groups.length === 0) return ['no duplicate lower(email) groups — M7 may apply']
  const lines = [`${groups.length} duplicate group(s) — write the decision file, one entry per group, then connect:emails:reconcile:`]
  for (const g of groups) {
    lines.push(`  ${g.system} ${g.email}`)
    for (const m of g.members) lines.push(`    id ${m.id}  active ${m.isActive}  bound ${m.bound}  authority ${m.credentialAuthority}`)
  }
  return lines
}

/** Structural validation of the decision file. Throws on a bad entry. */
export function validateDecisions(value: unknown): EmailDecision[] {
  if (!Array.isArray(value)) throw new Error('the decisions file must be a JSON array')
  return value.map((d, i) => {
    const e = d as EmailDecision
    if (!e || typeof e.email !== 'string' || !e.email.trim()) throw new Error(`decision ${i}: email required`)
    if (e.merge === true) return { ...e, email: e.email.toLowerCase(), retire: Array.isArray(e.retire) ? e.retire : [] }
    if (!Number.isSafeInteger(e.surviving) || e.surviving < 1) throw new Error(`decision ${i} (${e.email}): surviving id required`)
    if (!Array.isArray(e.retire) || e.retire.length === 0 || e.retire.some((x) => !Number.isSafeInteger(x) || x < 1)) throw new Error(`decision ${i} (${e.email}): retire must list ids`)
    if (e.retire.includes(e.surviving)) throw new Error(`decision ${i} (${e.email}): the survivor cannot be retired`)
    if (typeof e.reason !== 'string' || !e.reason.trim()) throw new Error(`decision ${i} (${e.email}): reason required`)
    return { email: e.email.toLowerCase(), surviving: e.surviving, retire: [...e.retire], reason: e.reason.trim() }
  })
}

export interface EmailReconcileDeps {
  env: ConnectEnv
  rps: Partial<Record<RpSystem, RpOpsClient>>
  decisions: EmailDecision[]
  readSwitch: () => Promise<MaintenanceSwitchRow | null>
  /** Mints the token with ops ['retire-email']. */
  token: { refresh(): Promise<string> }
  execute: boolean
  log?: (line: string) => void
}

export interface EmailReconcileReport {
  mode: 'dry-run' | 'execute'
  results: Array<{ system: RpSystem; email: string; userId: number; survivingUserId: number; outcome: string }>
  refused: Array<{ email: string; reason: string }>
  exitCode: number
  refusal: string | null
}

export class EmailReconcile {
  private readonly log: (line: string) => void
  constructor(private readonly deps: EmailReconcileDeps) {
    this.log = deps.log ?? (() => {})
  }

  async run(): Promise<EmailReconcileReport> {
    const d = this.deps
    const report: EmailReconcileReport = { mode: d.execute ? 'execute' : 'dry-run', results: [], refused: [], exitCode: 2, refusal: null }
    const refuse = (message: string) => {
      report.refusal = message
      this.log(`REFUSED: ${message}`)
      return report
    }
    // A merge decision is refused before anything else — the whole file is re-made.
    for (const dec of d.decisions) if (dec.merge) report.refused.push({ email: dec.email, reason: 'merge_not_supported' })
    if (report.refused.length > 0) return refuse(`merge_not_supported for ${report.refused.map((r) => r.email).join(', ')} — an identity merge is a product decision, not a migration`)

    const groups = await auditEmailDuplicates(d.rps, d.env)
    const byEmail = new Map(groups.map((g) => [`${g.system}:${g.email}`, g]))
    if (d.execute) {
      const sw = await d.readSwitch()
      if (!sw || !sw.active) return refuse('maintenance_required — the estate maintenance switch is off (pnpm connect:maintenance on)')
      if (sw.liftingSince) return refuse('lifting — a lift is in progress')
      try {
        await d.token.refresh()
      } catch (err) {
        return refuse(`could not mint the operator token: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    let failed = false
    for (const [system, client] of Object.entries(d.rps) as Array<[RpSystem, RpOpsClient]>) {
      for (const dec of d.decisions) {
        const group = byEmail.get(`${system}:${dec.email}`)
        // A group already satisfied (every member but the survivor retired) is done; a decision for an unknown group is reported.
        if (!group) {
          if (groups.some((g) => g.email === dec.email)) continue
          // The audit lists no group for this email on this RP: every member but the survivor is retired (the rerun the receipt exists for), or it never had duplicates here.
          for (const id of dec.retire) report.results.push({ system, email: dec.email, userId: id, survivingUserId: dec.surviving, outcome: 'satisfied' })
          continue
        }
        if (!group.members.some((m) => m.id === dec.surviving)) {
          report.refused.push({ email: dec.email, reason: `surviving ${dec.surviving} is not in the ${system} group` })
          failed = true
          continue
        }
        for (const id of dec.retire) {
          if (!d.execute) {
            report.results.push({ system, email: dec.email, userId: id, survivingUserId: dec.surviving, outcome: 'would_retire' })
            continue
          }
          await d.token.refresh()
          const r = await client.retireEmail(String(id), dec.surviving, dec.email, dec.reason)
          const outcome = r.status === 200 ? String(r.json?.outcome ?? 'retired') : replyError(r)
          report.results.push({ system, email: dec.email, userId: id, survivingUserId: dec.surviving, outcome })
          this.log(`${system} retire ${id} → survivor ${dec.surviving}: ${outcome}`)
          if (r.status !== 200) failed = true
        }
      }
    }
    report.exitCode = failed ? 1 : 0
    return report
  }
}

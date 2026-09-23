/**
 * p77 STORY-005 — `IssuerBackfill`: expand → backfill → validate, per RP
 * (specs.md §3.4, D9, D25; feedback P77-02).
 *
 * WHY. Existing RP rows carry `connect_sub` alone; the pair rule (M1v) can
 * only be enforced once every such row carries its issuer. This is step 3
 * of §3.4: for every RP row with `connect_sub` set and `connect_issuer`
 * NULL, check against Connect's OWN `users` that `sub::int` exists, is
 * active, and that `lower(email)` matches the RP row's; a passing row is
 * REGISTERED at Connect first (`rp_identity_map`, class `linked`, D25 — the
 * same verified facts, one pass) and then stamped by the RP op
 * `stamp-issuer { userIds, issuer }`; a failing row is moved by
 * `quarantine-binding { userId, reason }` into `connect_binding_quarantine`
 * (reasons `subject_unknown`, `subject_inactive`, `email_mismatch`,
 * `subject_not_numeric`). Rows the D9 writer already upgraded (issuer set,
 * `connect_mapped_at` NULL) get only the map row and the mapped stamp.
 *
 * THE TRUSTED ISSUER is the driver's own — never a value read from a row;
 * the RP route refuses any other (`issuer_mismatch`).
 *
 * UNDER THE SWITCH (D26 — the repair window of §10.1 step 4): `--execute`
 * refuses `maintenance_required` otherwise, and mints its token with
 * `ops = ['stamp-issuer', 'quarantine-binding']` so a cutover token cannot
 * quarantine a binding and this token cannot fence anyone.
 */

import type { RpSystem } from '../adapter/index.js'
import type { ConnectEnv, InventoryRowAnswer } from '../next-auth/internal-routes.js'
import { replyError, type RpOpsClient } from './rp-client.js'
import type { MaintenanceSwitchRow } from './switch.js'

export type QuarantineBindingReason = 'subject_unknown' | 'subject_inactive' | 'email_mismatch' | 'subject_not_numeric'

/** What the driver (in yobo-auth) can read and write at Connect, in-process. */
export interface ConnectDirectory {
  lookupSubject(sub: string): Promise<{ id: number; email: string | null; active: boolean } | null>
  /** `identity/register`'s rule in-process: upsert `(system, sourceUserRef) → sub`; `ref_conflict` when mapped to another user. */
  registerMapping(system: RpSystem, sourceUserRef: string, sub: string): Promise<'registered' | 'ref_conflict' | 'subject_unknown' | 'subject_inactive'>
}

export interface IssuerBackfillDeps {
  env: ConnectEnv
  issuer: string
  rps: Partial<Record<RpSystem, RpOpsClient>>
  directory: ConnectDirectory
  readSwitch: () => Promise<MaintenanceSwitchRow | null>
  /** Mints the token with ops stamp-issuer / quarantine-binding (a reminting provider). */
  token: { refresh(): Promise<string> }
  execute: boolean
  log?: (line: string) => void
  /** Rows per `stamp-issuer` call. Default 200. */
  batchSize?: number
}

export interface IssuerBackfillRow {
  system: RpSystem
  sourceUserRef: string
  email: string | null
  sub: string | null
  plan: 'stamp' | 'map_only' | 'quarantine' | 'skip'
  reason: QuarantineBindingReason | 'already_mapped' | 'unbound' | null
  outcome: string | null
}

export interface IssuerBackfillReport {
  mode: 'dry-run' | 'execute'
  env: ConnectEnv
  issuer: string
  rows: IssuerBackfillRow[]
  counts: Record<RpSystem, { stamped: number; mapped: number; quarantined: number; skipped: number; refused: number }>
  exitCode: number
  refusal: string | null
}

export class IssuerBackfill {
  private readonly log: (line: string) => void
  constructor(private readonly deps: IssuerBackfillDeps) {
    this.log = deps.log ?? (() => {})
  }

  /** The plan for one inventory row, judged against Connect's directory. */
  async plan(system: RpSystem, r: InventoryRowAnswer): Promise<IssuerBackfillRow> {
    const base = { system, sourceUserRef: String(r.id), email: r.email, sub: r.connectSub, outcome: null }
    if (!r.connectSub) return { ...base, plan: 'skip', reason: 'unbound' }
    if (r.connectIssuer && r.connectMappedAt) return { ...base, plan: 'skip', reason: 'already_mapped' }
    if (!/^\d+$/.test(r.connectSub)) return { ...base, plan: 'quarantine', reason: 'subject_not_numeric' }
    const subject = await this.deps.directory.lookupSubject(r.connectSub)
    if (!subject) return { ...base, plan: 'quarantine', reason: 'subject_unknown' }
    if (!subject.active) return { ...base, plan: 'quarantine', reason: 'subject_inactive' }
    if ((subject.email ?? '').toLowerCase() !== (r.email ?? '').toLowerCase()) return { ...base, plan: 'quarantine', reason: 'email_mismatch' }
    if (r.connectIssuer) return { ...base, plan: 'map_only', reason: null }
    return { ...base, plan: 'stamp', reason: null }
  }

  async run(): Promise<IssuerBackfillReport> {
    const d = this.deps
    const report: IssuerBackfillReport = { mode: d.execute ? 'execute' : 'dry-run', env: d.env, issuer: d.issuer, rows: [], counts: {} as IssuerBackfillReport['counts'], exitCode: 2, refusal: null }
    const refuse = (message: string) => {
      report.refusal = message
      this.log(`REFUSED: ${message}`)
      return report
    }
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
      const counts = { stamped: 0, mapped: 0, quarantined: 0, skipped: 0, refused: 0 }
      report.counts[system] = counts
      let inventory: InventoryRowAnswer[]
      try {
        inventory = await client.inventoryAll(d.env)
      } catch (err) {
        return refuse(`${system}: ${err instanceof Error ? err.message : String(err)}`)
      }
      const planned: IssuerBackfillRow[] = []
      for (const r of inventory) planned.push(await this.plan(system, r))
      report.rows.push(...planned)
      if (!d.execute) {
        for (const p of planned) {
          if (p.plan === 'skip') counts.skipped += 1
          else if (p.plan === 'quarantine') counts.quarantined += 1
          else if (p.plan === 'map_only') counts.mapped += 1
          else counts.stamped += 1
        }
        continue
      }
      // Register BEFORE stamping (D25): the map row is the verified fact; the stamp follows it.
      const toStamp: IssuerBackfillRow[] = []
      for (const p of planned) {
        if (p.plan === 'skip') {
          counts.skipped += 1
          p.outcome = 'skipped'
          continue
        }
        if (p.plan === 'quarantine') {
          await d.token.refresh()
          const r = await client.quarantineBinding(p.sourceUserRef, p.reason!)
          p.outcome = r.status === 200 ? 'quarantined' : replyError(r)
          if (r.status === 200) counts.quarantined += 1
          else {
            counts.refused += 1
            failed = true
          }
          continue
        }
        const reg = await d.directory.registerMapping(system, p.sourceUserRef, p.sub!)
        if (reg !== 'registered') {
          // The directory refused what the lookup admitted a moment ago: quarantine on the directory's word (`ref_conflict` is left for G9).
          if (reg === 'ref_conflict') {
            p.outcome = 'ref_conflict'
            counts.refused += 1
            failed = true
            continue
          }
          await d.token.refresh()
          const r = await client.quarantineBinding(p.sourceUserRef, reg)
          p.reason = reg
          p.plan = 'quarantine'
          p.outcome = r.status === 200 ? 'quarantined' : replyError(r)
          if (r.status === 200) counts.quarantined += 1
          else {
            counts.refused += 1
            failed = true
          }
          continue
        }
        toStamp.push(p)
      }
      const size = Math.max(1, d.batchSize ?? 200)
      for (let i = 0; i < toStamp.length; i += size) {
        const batch = toStamp.slice(i, i + size)
        await d.token.refresh()
        const r = await client.stampIssuer(batch.map((p) => Number(p.sourceUserRef)), d.issuer)
        const ok = r.status === 200
        for (const p of batch) {
          p.outcome = ok ? (p.plan === 'map_only' ? 'mapped' : 'stamped') : replyError(r)
          if (ok) {
            if (p.plan === 'map_only') counts.mapped += 1
            else counts.stamped += 1
          } else {
            counts.refused += 1
            failed = true
          }
        }
      }
      this.log(`${system}: stamped ${counts.stamped} mapped ${counts.mapped} quarantined ${counts.quarantined} skipped ${counts.skipped} refused ${counts.refused}`)
    }
    report.exitCode = failed ? 1 : 0
    return report
  }
}

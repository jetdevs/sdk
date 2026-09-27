/**
 * p77 STORY-005 — `EstateCutover`: the sequential per-RP cutover inside the
 * maintenance window (specs.md §6.3, D12, D22, D23, D26).
 *
 * ONE DRIVER, ONE ENVIRONMENT, CRM THEN YOBO, ROW BY ROW. While the switch
 * is on nothing can log in or write a credential, so a half-moved person is
 * not observable and no cross-RP coordination is needed: the driver simply
 * finishes each RP's pass before the next RP's first row is classified,
 * which makes Connect's first-come rule the manifest's election (D10).
 *
 *   0. `--execute` needs the switch ON (`403 maintenance_required`), no lift
 *      in progress (`403 lifting`), an APPROVED manifest whose digest still
 *      fits its rows, and the per-environment advisory lock
 *      (`pg_try_advisory_lock(hashtext('p77:cutover:' || env))` on the IdP
 *      database — a second driver is `409 driver_running`).
 *   1. The operator token is minted from the switch row (ops prepare / fence
 *      / activate / release / deactivate / reconcile) and re-minted every 10
 *      minutes; every RP call carries it.
 *   2. The D18 `deactivate` allowlist entries first.
 *   3. For crm, then yobo: every actionable manifest row — `prepare`
 *      (`expectedClass` asserted; `409 class_mismatch` → the row is skipped
 *      and reported, nothing written) → `fence` → `activate`. A refused step
 *      fails THAT ROW ONLY (the RP already carried `handoff/fail` on
 *      Connect's word and released it) and the pass continues. An RP not
 *      given with `--rp`, or not ready (G5 re-probe), refuses every row
 *      `rp_not_ready`. A rerun is idempotent: `already_activated` for rows
 *      already `connect`, resumed handoffs for open rows.
 *   4. Each RP's `reconcile` op (looped until `remaining` is 0), then
 *      `state`; the flag lines for apps at zero are the LAST lines; exit
 *      0 / 1 / 2. The 45-minute warning is printed once past 45 min from
 *      the switch's `since`.
 *
 * Reports carry digests only. The driver never edits env and never lifts
 * the switch (that is `EstateMaintenance.lift`, G10).
 *
 * Ported-From: cadra-web@b615864c:scripts/p79/cutover-lib.ts (`runCutover`,
 * re-shaped over `RpOpsClient`s and the estate manifest)
 */

import { randomUUID } from 'node:crypto'

import type { RpSystem } from '../adapter/index.js'
import type { ConnectEnv, DeactivateAllowlistEntry, RpStateAnswer } from '../next-auth/internal-routes.js'
import { assertCutoverPlan } from './classify.js'
import { digestPrefix, dryRunIsClean, FLAG_LINE, planRows, renderReport, type EstateRunReport, type RowOutcome } from './dry-run.js'
import { actionableRows, assertManifestApproved, isApproved, ManifestNotApprovedError, type EstateManifest } from './manifest.js'
import { replyError, type RpOpsClient, type RpReply } from './rp-client.js'
import type { MaintenanceSwitchRow } from './switch.js'

export interface EstateLock {
  /** `pg_try_advisory_lock(hashtext('p77:cutover:' || env))` on a DIRECT-host IdP connection. */
  tryAcquire(env: ConnectEnv): Promise<boolean>
  release(env: ConnectEnv): Promise<void>
}

export interface EstateCutoverDeps {
  env: ConnectEnv
  issuer: string
  manifest: EstateManifest
  /** The RPs given with `--rp`. */
  rps: Partial<Record<RpSystem, RpOpsClient>>
  /** The switch row (read live from the IdP's own store). */
  readSwitch: () => Promise<MaintenanceSwitchRow | null>
  lock: EstateLock
  /** Mints/refreshes the operator token (the reminting provider of `switch.ts`). */
  token: { refresh(): Promise<string>; current(): string | null }
  allowlist?: readonly DeactivateAllowlistEntry[]
  execute: boolean
  only?: readonly string[]
  /** G5 re-probe per RP before its pass (served code + the paused answer). Default: ready. */
  rpReady?: (system: RpSystem, client: RpOpsClient) => Promise<{ ready: boolean; reason?: string }>
  now?: () => Date
  log?: (line: string) => void
  runId?: string
  warnAfterMs?: number
  /** Bound on reconcile loops per RP (each pass ≤ 10 rows). Default 200. */
  maxReconcilePasses?: number
}

export interface EstateCutoverResult {
  exitCode: number
  flagLines: string[]
  report: EstateRunReport
  lines: string[]
}

export const WARN_AFTER_MS = 45 * 60 * 1000

/** Which HTTP answers are the operator contract's own refusals — the run stops on them (they are not per-row). */
const RUN_STOPPING = new Set(['operator_token_required', 'operator_invalid', 'operator_env_mismatch', 'op_not_permitted', 'maintenance_off', 'operator_superseded', 'maintenance_unverifiable', 'operator_unverifiable', 'not_configured', 'unauthorized'])

export class EstateCutover {
  private readonly now: () => Date
  private readonly log: (line: string) => void
  private warned = false

  constructor(private readonly deps: EstateCutoverDeps) {
    this.now = deps.now ?? (() => new Date())
    this.log = deps.log ?? (() => {})
  }

  async run(): Promise<EstateCutoverResult> {
    const d = this.deps
    const startedAt = this.now()
    const runId = d.runId ?? randomUUID()
    const report: EstateRunReport = {
      version: 1,
      env: d.env,
      mode: d.execute ? 'execute' : 'dry-run',
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      issuer: d.issuer,
      manifest: { approved: isApproved(d.manifest), approvedBy: d.manifest.approval?.approvedBy ?? null, counts: d.manifest.counts },
      deactivations: [],
      rows: [],
      states: {},
      reconcile: {},
      flagLines: [],
      warnings: [],
      exitCode: 2,
      refusal: null,
    }
    const finish = (exitCode: number): EstateCutoverResult => {
      report.exitCode = exitCode
      report.finishedAt = this.now().toISOString()
      const lines = renderReport(report)
      for (const l of lines) this.log(l)
      return { exitCode, flagLines: report.flagLines, report, lines }
    }
    const refuse = (message: string): EstateCutoverResult => {
      report.refusal = message
      return finish(2)
    }

    // p77 STORY-041: the driver order is the one the approval signed (manifest.plan).
    try {
      assertCutoverPlan(d.manifest.plan)
    } catch (err) {
      return refuse(`manifest has no valid plan (${(err as Error).message}); rebuild it with the IdP's source-system plan`)
    }
    if (d.manifest.env !== d.env) return refuse(`manifest env ${d.manifest.env} does not match --env ${d.env}`)
    if (d.manifest.connectIssuer.replace(/\/+$/, '') !== d.issuer.replace(/\/+$/, '')) return refuse(`manifest issuer ${d.manifest.connectIssuer} does not match the configured issuer ${d.issuer}`)
    const given = Object.keys(d.rps) as RpSystem[]

    // ── dry run: writes nothing, needs no switch ────────────────────────────
    if (!d.execute) {
      report.rows = planRows(d.manifest, given).filter((r) => !d.only?.length || (r.email && d.only.includes(r.email)))
      for (const system of given) report.states[system] = await this.readState(d.rps[system]!)
      const clean = dryRunIsClean(report.rows, d.manifest)
      if (!isApproved(d.manifest)) report.warnings.push('the manifest is NOT approved; --execute will refuse it')
      return finish(clean ? 0 : 1)
    }

    // ── execute: the switch, the approval, the lock ─────────────────────────
    const sw = await d.readSwitch()
    if (!sw || !sw.active) return refuse('maintenance_required — the estate maintenance switch is off (pnpm connect:maintenance on)')
    if (sw.liftingSince) return refuse('lifting — a lift is in progress; wait for it to complete or be refused')
    try {
      assertManifestApproved(d.manifest)
    } catch (err) {
      return refuse(err instanceof ManifestNotApprovedError ? err.message : String(err))
    }
    if (!(await d.lock.tryAcquire(d.env))) return refuse('driver_running — another connect:cutover holds the advisory lock for this environment')
    try {
      try {
        await d.token.refresh()
      } catch (err) {
        return refuse(`could not mint the operator token: ${err instanceof Error ? err.message : String(err)}`)
      }

      // ── 2. deactivations first (D18) ──────────────────────────────────────
      for (const entry of (d.allowlist ?? []).filter((e) => e.env === d.env)) {
        const client = d.rps[entry.system]
        if (!client) {
          report.deactivations.push({ system: entry.system, sourceUserRef: entry.sourceUserRef, outcome: 'rp_not_ready' })
          continue
        }
        await d.token.refresh()
        const r = await client.deactivate(entry.sourceUserRef, entry.reason)
        const outcome = r.status === 200 ? String(r.json?.outcome ?? 'deactivated') : replyError(r)
        report.deactivations.push({ system: entry.system, sourceUserRef: entry.sourceUserRef, outcome })
        if (r.status !== 200 && RUN_STOPPING.has(outcome)) return refuse(`deactivate ${entry.system}:${entry.sourceUserRef} refused ${outcome}; the run stops`)
      }

      // ── 3. crm, then yobo, row by row ─────────────────────────────────────
      let stop: string | null = null
      for (const system of d.manifest.plan.order) {
        const rows = actionableRows(d.manifest, system).filter((r) => !d.only?.length || (r.email && d.only.includes(r.email)))
        if (rows.length === 0) continue
        const client = d.rps[system]
        let notReady: string | null = client ? null : `--rp ${system}=<origin> not given`
        if (client && d.rpReady) {
          const probe = await d.rpReady(system, client)
          if (!probe.ready) notReady = probe.reason ?? 'not ready'
        }
        if (notReady) {
          for (const r of rows) report.rows.push({ system, sourceUserRef: r.sourceUserRef, email: r.email, class: r.class, before: '?', after: '?', handoffId: null, outcome: 'rp_not_ready', reason: notReady, digestPrefix: digestPrefix(r.passwordDigest) })
          continue
        }
        for (const r of rows) {
          this.warnIfLate(sw, report)
          await d.token.refresh()
          const outcome = await this.driveRow(client!, r.sourceUserRef, r.class as 'import' | 'retire' | 'adopt' | 'recover', r.email, r.passwordDigest)
          report.rows.push(outcome)
          if (RUN_STOPPING.has(outcome.outcome)) {
            stop = `${system}:${r.sourceUserRef} ${outcome.outcome}`
            break
          }
        }
        if (stop) break
      }
      if (stop) return refuse(`the operator contract refused (${stop}); the run stops. Rerun --execute after fixing the cause`)

      // ── 4. reconcile and count ────────────────────────────────────────────
      for (const system of given) {
        const client = d.rps[system]!
        await d.token.refresh()
        report.reconcile[system] = await this.reconcileUntilZero(client)
        report.states[system] = await this.readState(client)
      }
      let allMoved = report.rows.every((r) => r.outcome === 'connect' || r.outcome === 'already_activated')
      for (const system of d.manifest.plan.order) {
        const s = report.states[system]
        if (s && !('error' in s) && s.counts.eligibleLocal === 0 && s.counts.prepared === 0 && s.counts.fenced === 0) report.flagLines.push(FLAG_LINE(system))
        else if (s && !('error' in s)) allMoved = false
      }
      return finish(allMoved ? 0 : 1)
    } finally {
      await d.lock.release(d.env).catch(() => {})
    }
  }

  private warnIfLate(sw: MaintenanceSwitchRow, report: EstateRunReport): void {
    if (this.warned || !sw.since) return
    const age = this.now().getTime() - Date.parse(sw.since)
    if (age >= (this.deps.warnAfterMs ?? WARN_AFTER_MS)) {
      this.warned = true
      const w = `the window has been on for ${Math.round(age / 60000)} min (budget 60): past 60 min run pnpm connect:maintenance extend --minutes 15 --reason "<what is left>" and announce it`
      report.warnings.push(w)
      this.log(`WARNING: ${w}`)
    }
  }

  private async readState(client: RpOpsClient): Promise<RpStateAnswer | { error: string }> {
    const r = await client.state()
    if (r.status !== 200 || !r.json?.state) return { error: r.status === 0 ? (r.error ?? 'transport') : `HTTP ${r.status} ${replyError(r)}` }
    return r.json.state
  }

  private async reconcileUntilZero(client: RpOpsClient): Promise<{ passes: number; remaining: number; opExpired: boolean }> {
    const max = this.deps.maxReconcilePasses ?? 200
    let passes = 0
    let remaining = -1
    let opExpired = false
    while (passes < max) {
      await this.deps.token.refresh()
      const r = await client.reconcile(10)
      passes += 1
      if (r.status !== 200 || !r.json) {
        this.log(`reconcile ${client.system}: ${r.status === 0 ? r.error : `HTTP ${r.status} ${replyError(r)}`}`)
        break
      }
      remaining = r.json.remaining
      opExpired = Boolean((r.json as { report?: { opExpired?: boolean } }).report?.opExpired)
      if (remaining === 0 || opExpired) break
    }
    return { passes, remaining, opExpired }
  }

  /** prepare → fence → activate for one row; a refused step fails that row only. */
  private async driveRow(client: RpOpsClient, ref: string, expectedClass: 'import' | 'retire' | 'adopt' | 'recover', email: string | null, digest: string | null): Promise<RowOutcome> {
    const base: RowOutcome = { system: client.system, sourceUserRef: ref, email, class: expectedClass, before: 'local', after: 'local', handoffId: null, outcome: '', reason: null, digestPrefix: digestPrefix(digest) }
    const word = (r: RpReply, fallback: string) => (r.status === 0 ? 'rp_unreachable' : typeof r.json?.outcome === 'string' ? r.json.outcome : typeof r.json?.error === 'string' ? r.json.error : fallback)
    const detailOf = (r: RpReply) => {
      const dt = r.json?.detail ?? r.json?.remote?.detail
      return dt == null ? null : typeof dt === 'string' ? dt : JSON.stringify(dt)
    }

    const p = await client.prepare(ref, expectedClass)
    const pWord = word(p, `HTTP ${p.status}`)
    // D22: a row already `connect` answers `already_activated` at the estate level.
    if (pWord === 'already_connect') return { ...base, before: 'connect', after: 'connect', outcome: 'already_activated' }
    if (p.status !== 200 || (pWord !== 'prepared' && pWord !== 'resumed')) {
      return { ...base, outcome: pWord, reason: detailOf(p) ?? (p.status === 0 ? p.error : null) }
    }
    base.handoffId = p.json?.handoff?.handoffId ?? null
    base.before = p.json?.resumed ? String(p.json?.handoff?.state ?? 'prepared') : 'local'
    const remote = p.json?.remote as { ok: boolean; outcome: string; detail?: Record<string, unknown> } | undefined
    if (remote && (!remote.ok || remote.outcome === 'failed')) {
      return { ...base, after: remote.outcome === 'failed' ? 'local' : 'prepared', outcome: remote.outcome, reason: remote.detail ? JSON.stringify(remote.detail) : null }
    }
    if (remote && (remote.outcome === 'completed_over_fail' || remote.outcome === 'activation_replayed')) return { ...base, after: 'connect', outcome: 'connect' }

    const f = await client.fence(ref, base.handoffId ?? undefined)
    const fWord = word(f, `HTTP ${f.status}`)
    if (f.status !== 200 || !f.json?.ok || fWord === 'failed') {
      const after = fWord === 'failed' ? 'local' : f.json?.handoff?.state === 'fenced' ? 'fenced' : 'prepared'
      return { ...base, after, outcome: fWord, reason: detailOf(f) }
    }

    const a = await client.activate(ref, base.handoffId ?? undefined)
    const aWord = word(a, `HTTP ${a.status}`)
    if (a.status !== 200) return { ...base, after: 'fenced', outcome: aWord, reason: detailOf(a) }
    const ok = Boolean(a.json?.ok) && aWord !== 'failed' && aWord !== 'already_failed'
    if (ok) return { ...base, after: 'connect', outcome: 'connect', reason: aWord === 'activated' ? null : aWord }
    return { ...base, after: aWord === 'failed' ? 'local' : 'fenced', outcome: aWord, reason: detailOf(a) }
  }
}

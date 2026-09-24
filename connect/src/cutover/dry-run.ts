/**
 * p77 STORY-005 — the dry-run plan and the report renderer (§5.3, §6.3
 * step 4). A dry run writes nothing anywhere and needs no switch: it reads
 * each RP's `state`, lists every manifest row with the step the driver
 * WOULD take, and says whether the plan is clean.
 *
 * Reports carry digests, never hashes (trap 4 of the p79 runbook).
 *
 * Ported-From: cadra-web@b615864c:scripts/p79/cutover-lib.ts (renderTable, the
 * plan/report shape)
 */

import type { RpSystem } from '../adapter/index.js'
import type { RpStateAnswer } from '../next-auth/internal-routes.js'
import { actionableRows, isApproved, type EstateManifest } from './manifest.js'

export interface RowOutcome {
  system: RpSystem
  sourceUserRef: string
  email: string | null
  class: string
  before: string
  after: string
  handoffId: string | null
  outcome: string
  reason: string | null
  digestPrefix: string | null
}

export interface EstateRunReport {
  version: 1
  env: string
  mode: 'dry-run' | 'execute'
  runId: string
  startedAt: string
  finishedAt: string | null
  issuer: string
  manifest: { approved: boolean; approvedBy: string | null; counts: EstateManifest['counts'] } | null
  deactivations: Array<{ system: RpSystem; sourceUserRef: string; outcome: string }>
  rows: RowOutcome[]
  states: Partial<Record<RpSystem, RpStateAnswer | { error: string }>>
  reconcile: Partial<Record<RpSystem, { passes: number; remaining: number; opExpired: boolean }>>
  flagLines: string[]
  warnings: string[]
  exitCode: number
  refusal: string | null
}

export const FLAG_LINE = (system: RpSystem) => `set YOBO_CONNECT_ENABLED=true for ${system}`

export const digestPrefix = (digest: string | null | undefined): string | null => (digest ? `${digest.slice(0, 12)}…` : null)

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

export function renderTable(rows: string[][], header: string[]): string[] {
  const all = [header, ...rows]
  const widths = header.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)))
  const line = (r: string[]) => r.map((c, i) => pad(c ?? '', widths[i]!)).join('  ').trimEnd()
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)]
}

/** What the driver would do per row, judged on the RP's LIVE state answer. */
export function planRows(manifest: EstateManifest, rpGiven: readonly RpSystem[]): RowOutcome[] {
  const out: RowOutcome[] = []
  for (const system of manifest.plan?.order ?? []) {
    for (const r of actionableRows(manifest, system)) {
      const ready = rpGiven.includes(system)
      out.push({
        system,
        sourceUserRef: r.sourceUserRef,
        email: r.email,
        class: r.class,
        before: 'local',
        after: 'local',
        handoffId: null,
        outcome: ready ? 'would_run' : 'rp_not_ready',
        reason: ready ? `prepare(${r.class}) → fence → ${r.class === 'import' ? 'activate' : 'activate-existing'}` : `--rp ${system}=<origin> not given`,
        digestPrefix: digestPrefix(r.passwordDigest),
      })
    }
  }
  return out
}

export function renderReport(report: EstateRunReport): string[] {
  const lines: string[] = []
  lines.push(`p77 connect:cutover — env ${report.env}, ${report.mode}, run ${report.runId}`)
  lines.push(`  connect    ${report.issuer}`)
  if (report.manifest) lines.push(`  manifest   ${report.manifest.approved ? `approved by ${report.manifest.approvedBy}` : 'NOT approved'}; import ${report.manifest.counts.import} retire ${report.manifest.counts.retire} adopt ${report.manifest.counts.adopt} recover ${report.manifest.counts.recover} quarantine ${report.manifest.counts.quarantine}`)
  if (report.refusal) lines.push(`REFUSED: ${report.refusal}`)
  if (report.deactivations.length > 0) {
    lines.push('')
    lines.push(`deactivations (D18): ${report.deactivations.map((d) => `${d.system}:${d.sourceUserRef} ${d.outcome}`).join(', ')}`)
  }
  lines.push('')
  const table = report.rows.map((u) => [`${u.system}:${u.sourceUserRef}`, u.email ?? '(no email)', u.class, `${u.before} → ${u.after}`, u.handoffId ? u.handoffId.slice(0, 8) : '-', u.outcome, u.reason ?? '', u.digestPrefix ?? '-'])
  for (const l of renderTable(table, ['row', 'email', 'class', 'authority', 'handoff', 'outcome', 'reason', 'digest'])) lines.push(l)
  if (report.rows.length === 0) lines.push('(no handoff rows to act on)')
  const tally = new Map<string, number>()
  for (const u of report.rows) tally.set(u.outcome, (tally.get(u.outcome) ?? 0) + 1)
  lines.push('')
  lines.push(`summary (${report.mode}): ${[...tally].map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing acted on'}`)
  for (const [system, s] of Object.entries(report.states)) {
    if (!s) continue
    if ('error' in s) lines.push(`state ${system}: ${s.error}`)
    else lines.push(`state ${system}: eligibleLocal ${s.counts.eligibleLocal} prepared ${s.counts.prepared} fenced ${s.counts.fenced} connect ${s.counts.connect} inFlightOps ${s.counts.inFlightOps} flag ${s.flagEnabled ? 'on' : 'off'}`)
  }
  for (const w of report.warnings) lines.push(`WARNING: ${w}`)
  for (const f of report.flagLines) lines.push(f)
  return lines
}

export function dryRunIsClean(rows: RowOutcome[], manifest: EstateManifest): boolean {
  return isApproved(manifest) && rows.every((r) => r.outcome === 'would_run' || r.outcome === 'already_activated')
}

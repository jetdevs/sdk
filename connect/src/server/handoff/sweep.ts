/**
 * p77 STORY-004 — the MAPPING SWEEP (specs.md D25, §6.4 "Mapping sweep").
 *
 * WHY. Every RP writer that stamps `connect_sub` registers the pair at
 * Connect (`identity/register { sub, sourceUserRef }`) and records success
 * in `users.connect_mapped_at`; a failed call leaves it NULL. Without a
 * retry of its own, D24's scoped lookup would answer `{ found: false }` for
 * every user whose registration failed once — and enforcement is gated on
 * mapping completeness (G9). This is that retry: a SEPARATE function from
 * the reconciler, called by the RP's `sweep-mappings` op under the RP key
 * alone (no operator token — it writes nothing but `connect_mapped_at`, and
 * only after Connect's own authenticated route answered 2xx), on the IdP's
 * minute tick with or without the switch.
 *
 *   2xx              → `markMapped`
 *   409 ref_conflict → logged, left unmarked (never rebound; G9 surfaces it)
 *   5xx / transport  → left for the next call
 *   any other 4xx    → logged, left (a subject Connect does not know cannot be
 *                      fixed by retrying; G9 sees the NULL)
 */

import type { RpAdapter } from '../../adapter/index.js'
import { isTransientReply, replyError, type HandoffTransport } from './transport.js'

export interface SweepMappingsOptions {
  adapter: Pick<RpAdapter, 'system' | 'unmappedBindings' | 'markMapped'>
  transport: Pick<HandoffTransport, 'identityRegister'>
  limit?: number
  log?: (event: { kind: 'registered' | 'ref_conflict' | 'register_failed' | 'register_refused'; userId: number; sub: string; detail?: Record<string, unknown> }) => void
}

export interface SweepMappingsReport {
  registered: number
  conflicts: number
  /** Transient failures, retried on the next call. */
  failed: number
  /** Permanent non-conflict refusals (e.g. `subject_unknown`), left unmarked. */
  refused: number
}

export const SWEEP_DEFAULT_LIMIT = 100

export async function sweepMappings(opts: SweepMappingsOptions): Promise<SweepMappingsReport> {
  const limit = Math.max(1, opts.limit ?? SWEEP_DEFAULT_LIMIT)
  const report: SweepMappingsReport = { registered: 0, conflicts: 0, failed: 0, refused: 0 }
  const rows = await opts.adapter.unmappedBindings(limit)
  for (const { userId, sub } of rows) {
    const reply = await opts.transport.identityRegister({ sub, sourceUserRef: String(userId) })
    if (reply.status === 200 || reply.status === 201) {
      await opts.adapter.markMapped(userId)
      report.registered += 1
      opts.log?.({ kind: 'registered', userId, sub })
      continue
    }
    if (isTransientReply(reply)) {
      report.failed += 1
      opts.log?.({ kind: 'register_failed', userId, sub, detail: { status: reply.status, error: reply.error } })
      continue
    }
    const error = replyError(reply)
    if (reply.status === 409 && error === 'ref_conflict') {
      report.conflicts += 1
      opts.log?.({ kind: 'ref_conflict', userId, sub, detail: { error } })
      continue
    }
    report.refused += 1
    opts.log?.({ kind: 'register_refused', userId, sub, detail: { status: reply.status, error } })
  }
  return report
}

/**
 * p77 STORY-004 — the per-RP RECONCILER (specs.md §6.4, D22).
 *
 * WHY. Every crash point of the handshake (§6.2) leaves a row that is
 * `prepared` or `fenced` and a Connect side that may or may not have heard
 * the last call. Nothing cross-RP is needed to repair it: the row's own RP
 * re-drives it. One pass:
 *
 *   - claims the open rows that are due (`handoffTable.listDue(limit)` —
 *     `FOR UPDATE SKIP LOCKED` in the adapter's own short transaction; a row
 *     a live driver step holds is not returned, and a step that meets the
 *     driver's `FOR UPDATE NOWAIT` on the users row answers `in_flight` —
 *     both are `skipped_in_flight`);
 *   - a `connect` user with an open row → completes the row (`flip_completed`);
 *   - `fail_requested_at` set → carries the fail to Connect and releases on its
 *     word (activation wins if Connect says so);
 *   - `prepared` → re-posts `handoff/prepare` while `prepare_acked_at` is NULL
 *     (idempotent per `(source_system, source_user_ref)`; nothing is staged
 *     twice), re-stages an `import` row from its source, fences, activates;
 *   - `fenced` → re-asserts the fence, activates (`already_activated`
 *     completes the flip);
 *   - `409 canonical_pending` is backed off (5 s → 1 h), never a fail.
 *
 * It never opens a handoff, never sets `operatorCutover`, never calls
 * `identity/register` (the mapping sweep is `sweep.ts`, D25), and has no
 * schedule of its own: the estate driver calls it through the RP's
 * `reconcile` op at the end of every `--execute`, and the IdP's minute tick
 * calls it while the switch is on (STORY-036). Each call is ONE leased op
 * (§6.5 step 0) over at most `limit` (default 10) rows and answers
 * `{ remaining }`; the caller loops until zero, so no single request
 * outlives its 30 s lease. An `op_expired` from the lease ends the pass.
 *
 * There are NO run ids, generations, acknowledgements or barrier checks.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/credential-handoff.ts
 * (`reconcileCredentialHandoffs`, :1155-1264, over `RpAdapter`)
 */

import { createHandoffDriver, type DriverOptions, type HandoffDriver, type StepResult } from './driver.js'
import type { HandoffRow, HandoffState } from '../../adapter/index.js'

export const RECONCILE_DEFAULT_LIMIT = 10
/** How many due rows `remaining` counts up to after a pass (the caller loops until zero). */
export const RECONCILE_REMAINING_CAP = 1_000

/**
 * The reference claim for an adapter's `listDue` (the reconciler's SKIP LOCKED claim, §6.4):
 * run in the adapter's own short transaction. `$1` = limit.
 */
export const RECONCILER_CLAIM_SQL = `SELECT * FROM credential_handoff
 WHERE state IN ('prepared', 'fenced') AND next_attempt_at <= clock_timestamp()
 ORDER BY prepared_at
 LIMIT $1
 FOR UPDATE SKIP LOCKED`

export interface ReconcileOptions extends Omit<DriverOptions, 'operatorCutover'> {
  /** Rows claimed per call. Default 10 (§6.4). */
  limit?: number
  /** Test seam: the driver constructor. The reconciler never passes `operatorCutover`. */
  driverFactory?: (opts: DriverOptions) => HandoffDriver
}

export interface ReconcileReport {
  examined: number
  skippedInFlight: number
  flipsCompleted: number
  /** Open rows still due after this pass (capped at `RECONCILE_REMAINING_CAP`). */
  remaining: number
  /** The pass ended early because the op's lease was gone. */
  opExpired: boolean
  items: Array<{ handoffId: string; userId: number | null; from: HandoffState; to: HandoffState | null; outcome: string }>
}

export async function reconcile(opts: ReconcileOptions): Promise<ReconcileReport> {
  const limit = Math.max(1, opts.limit ?? RECONCILE_DEFAULT_LIMIT)
  const { limit: _l, driverFactory, ...driverOpts } = opts
  // `operatorCutover` is deliberately absent: the reconciler resumes, it never opens.
  const driver = (driverFactory ?? createHandoffDriver)({ ...driverOpts, operatorCutover: undefined })
  const report: ReconcileReport = { examined: 0, skippedInFlight: 0, flipsCompleted: 0, remaining: 0, opExpired: false, items: [] }

  const claimed: HandoffRow[] = await opts.adapter.handoffTable.listDue(limit)
  for (const row of claimed) {
    const step: StepResult = await driver.resume(row)
    if (step.outcome === 'in_flight') {
      report.skippedInFlight += 1
      opts.log?.({ kind: 'skipped_in_flight', handoffId: row.handoffId, userId: row.localUserId })
      continue
    }
    if (step.outcome === 'op_expired') {
      report.opExpired = true
      break
    }
    report.examined += 1
    if (step.outcome === 'flip_completed') report.flipsCompleted += 1
    report.items.push({ handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: step.handoff?.state ?? null, outcome: step.outcome })
  }

  report.remaining = report.opExpired ? claimed.length : (await opts.adapter.handoffTable.listDue(RECONCILE_REMAINING_CAP)).length
  return report
}

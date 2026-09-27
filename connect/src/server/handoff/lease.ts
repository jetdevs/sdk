/**
 * p77 STORY-004 — operator LEASES: the enforced request lifetime of §6.5 step 0
 * (D23; feedback P77-13 rounds 5–6).
 *
 * WHY. The estate driver in yobo-auth authorizes a mutating op on an RP over
 * HTTP and then dies, or the lift begins, while that request is still
 * running inside the RP. Nothing in the pinned p79 driver can recall an
 * authorization already consumed: the advisory lock is the CLI's connection,
 * the `FOR UPDATE NOWAIT` row lock refuses only a concurrent conflict and
 * covers no row that is not yet inserted, and a cleared `jti` is checked
 * before the op, not inside its writes (`cadra-web@b615864c:
 * src/server/auth/credential-handoff.ts:837-853, 1022-1053`). The lease is
 * the thing the op's every local transaction must find alive, and `drain` is
 * the thing the lift runs to make sure none is.
 *
 * THE MECHANISM (the P77-13 build decision — recorded in specs.md §12):
 *
 *   1. `openLease` inserts `connect_operator_leases` (M4) with
 *      `lease_until = clock_timestamp() + 30 s` on the RP database's clock,
 *      in its own transaction, after the offline token check and before the
 *      live one.
 *   2. `withOperatorLease(db, opId)` returns a db whose EVERY transaction
 *      begins with the three `SET LOCAL` timeouts (lock 5 s, statement 10 s,
 *      idle-in-transaction 10 s) and THEN the claim:
 *        SELECT 1 FROM connect_operator_leases
 *         WHERE op_id = $1 AND finished_at IS NULL AND outcome IS NULL
 *           AND lease_until > clock_timestamp() FOR UPDATE
 *      0 rows → `OperatorLeaseExpiredError` (`op_expired`), the transaction
 *      rolls back, nothing written. The timeouts go first because they never
 *      block and the claim can (it waits on a drain's lock): Codex round 6's
 *      point, and STORY-004's AC13. `clock_timestamp()`, not `now()`: `now()`
 *      is the TRANSACTION-START time, so a transaction begun before a drain
 *      would compare the drained `lease_until` against a stale clock and
 *      accept it. And `outcome IS NULL` is checked, not the clock alone: the
 *      drain persists a terminal `drained` outcome, and under READ COMMITTED
 *      a claim that waited on the drain's row lock re-evaluates its predicate
 *      against the drained row version and finds nothing.
 *   3. `drainLeases` runs ONE statement:
 *        UPDATE connect_operator_leases
 *           SET lease_until = LEAST(lease_until, clock_timestamp()),
 *               outcome = 'drained'
 *         WHERE finished_at IS NULL AND outcome IS NULL
 *      EVERY unfinished lease, expired or not — a transaction that claimed
 *      its lease at t = 29 s and still holds the row lock at t = 31 s is
 *      exactly the case `lease_until > now()` would have skipped. The UPDATE
 *      blocks on the `FOR UPDATE` lock of every such transaction and returns
 *      only after each has committed or rolled back (bounded by their own
 *      statement/idle timeouts), so after the drain no admitted request can
 *      still commit, and no new transaction under an old lease can begin.
 *   4. `finishLease` records `finished_at` and the op's outcome on every exit;
 *      a `drained` outcome is kept (the drain's word wins).
 *
 * The leased db's plain `execute` also runs inside a leased transaction, so an
 * adapter cannot slip a single-statement write past the claim.
 *
 * The receiver of `op_expired` is the route factory (STORY-005): it answers
 * `409 op_expired`. The adapter surfaces it as the `FenceRefusal` `op_expired`.
 */

import type { RpSqlClient, SqlExecutor } from '../../adapter/index.js'

export const OPERATOR_LEASE_TABLE = 'connect_operator_leases'
export const OPERATOR_LEASE_SECONDS = 30

/** M4 — the exact table the RP migration stories (020/024/039) create. */
export const OPERATOR_LEASE_DDL = `CREATE TABLE IF NOT EXISTS ${OPERATOR_LEASE_TABLE} (
  op_id uuid PRIMARY KEY,
  op text NOT NULL,
  source_user_ref text,
  operator_jti text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text
);
CREATE INDEX IF NOT EXISTS ${OPERATOR_LEASE_TABLE}_live_idx ON ${OPERATOR_LEASE_TABLE} (lease_until) WHERE finished_at IS NULL;`

/** The three bounds every leased transaction runs under (§6.5 step 0), in the order they are sent. */
export const LEASE_TRANSACTION_SETTINGS: readonly string[] = [
  `SET LOCAL lock_timeout = '5s'`,
  `SET LOCAL statement_timeout = '10s'`,
  `SET LOCAL idle_in_transaction_session_timeout = '10s'`,
]

/** The claim — the first potentially blocking statement of every leased transaction. */
export const LEASE_CLAIM_SQL = `SELECT 1 AS live FROM ${OPERATOR_LEASE_TABLE}
 WHERE op_id = $1::uuid AND finished_at IS NULL AND outcome IS NULL AND lease_until > clock_timestamp()
 FOR UPDATE`

/** The drain — every unfinished lease, expired or not; blocks on every held lease row. */
export const LEASE_DRAIN_SQL = `UPDATE ${OPERATOR_LEASE_TABLE}
   SET lease_until = LEAST(lease_until, clock_timestamp()), outcome = 'drained'
 WHERE finished_at IS NULL AND outcome IS NULL
 RETURNING op_id`

export class OperatorLeaseExpiredError extends Error {
  readonly code = 'op_expired' as const
  constructor(
    public readonly opId: string,
    detail = 'no live lease',
  ) {
    super(`operator lease ${opId} is not live (${detail})`)
    this.name = 'OperatorLeaseExpiredError'
  }
}

export function isOperatorLeaseExpired(err: unknown): err is OperatorLeaseExpiredError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'op_expired' &&
    typeof (err as { opId?: unknown }).opId === 'string'
  )
}

export interface OpenLeaseInput {
  opId: string
  op: string
  sourceUserRef?: string | null
  operatorJti: string
  /** Default 30 s (§6.5). */
  leaseSeconds?: number
}

/** Step 0: record the lease in its own transaction, on the RP database's clock. */
export async function openLease(db: RpSqlClient, input: OpenLeaseInput): Promise<{ opId: string; leaseUntil: string }> {
  const seconds = Math.max(1, Math.floor(input.leaseSeconds ?? OPERATOR_LEASE_SECONDS))
  const rows = await db.transaction((tx) =>
    tx.execute(
      `INSERT INTO ${OPERATOR_LEASE_TABLE} (op_id, op, source_user_ref, operator_jti, lease_until)
       VALUES ($1::uuid, $2, $3, $4, clock_timestamp() + make_interval(secs => $5))
       RETURNING op_id, lease_until`,
      [input.opId, input.op, input.sourceUserRef ?? null, input.operatorJti, seconds],
    ),
  )
  const r = rows[0]
  return { opId: String(r?.op_id ?? input.opId), leaseUntil: toIso(r?.lease_until) }
}

/**
 * Run the claim on an already-open transaction. Exported so a caller that
 * manages its own transaction (and the tests) runs the SAME statement.
 * Throws `OperatorLeaseExpiredError` when the lease is gone.
 */
export async function claimOperatorLease(tx: { execute: SqlExecutor }, opId: string): Promise<void> {
  for (const stmt of LEASE_TRANSACTION_SETTINGS) await tx.execute(stmt)
  const rows = await tx.execute(LEASE_CLAIM_SQL, [opId])
  if (rows.length === 0) throw new OperatorLeaseExpiredError(opId)
}

/**
 * The db every local transaction of an operator op runs on: the claim is the
 * first thing each transaction does (after the never-blocking SET LOCALs).
 */
export function withOperatorLease(db: RpSqlClient, opId: string): RpSqlClient {
  const transaction = <T>(fn: (tx: { execute: SqlExecutor }) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await claimOperatorLease(tx, opId)
      return fn(tx)
    })
  return {
    transaction,
    execute: (text, params) => transaction((tx) => tx.execute(text, params)),
  }
}

/** Every exit of the op records its outcome; a `drained` outcome is kept. */
export async function finishLease(db: RpSqlClient, opId: string, outcome: string): Promise<void> {
  await db.execute(
    `UPDATE ${OPERATOR_LEASE_TABLE}
        SET finished_at = clock_timestamp(),
            outcome = CASE WHEN outcome = 'drained' THEN outcome ELSE $2 END
      WHERE op_id = $1::uuid AND finished_at IS NULL`,
    [opId, outcome],
  )
}

/**
 * The lift's first call on every RP (§6.3 step 6 (iii)). Returns only after
 * every transaction holding a lease row has ended; `expired` counts the
 * leases it drained (a second drain finds none).
 */
export async function drainLeases(db: RpSqlClient): Promise<{ expired: number }> {
  const rows = await db.execute(LEASE_DRAIN_SQL)
  return { expired: rows.length }
}

/** `state.counts.inFlightOps` (§6.5): unfinished, undrained, unexpired leases. */
export async function countInFlightLeases(db: RpSqlClient): Promise<number> {
  const rows = await db.execute(
    `SELECT count(*)::int AS n FROM ${OPERATOR_LEASE_TABLE}
      WHERE finished_at IS NULL AND outcome IS NULL AND lease_until > clock_timestamp()`,
  )
  return Number(rows[0]?.n ?? 0)
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return new Date(v).toISOString()
  return new Date(NaN).toString()
}

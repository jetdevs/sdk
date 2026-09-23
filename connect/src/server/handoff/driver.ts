/**
 * p77 STORY-004 — the credential handoff DRIVER: prepare → fence →
 * activate | activate-existing, "activation wins", release on Connect's word
 * only — the state machine of specs.md §6.2 implemented ONCE, over the
 * `RpAdapter` contract, for every relying party.
 *
 * WHY A PROTOCOL AND NOT A TRANSACTION (p79, unchanged). The RP's
 * `users.credential_authority` and Connect's canonical verifier live in two
 * databases; no transaction commits both. The handoff is a durable local row
 * (`credential_handoff`, M5) driven through authenticated, idempotent calls
 * to Connect, addressed by `(source_system, source_user_ref)` and a handoff
 * id. Every local write is one adapter call — one short transaction under
 * the users row lock — and every Connect call happens OUTSIDE a transaction:
 * this port does not hold a row lock across an HTTP call the way the pinned
 * source did (`cadra-web@b615864c:src/server/auth/credential-handoff.ts:
 * 837-851`); what the lock covered there, the lease covers here (§6.5,
 * `lease.ts`), and each step is idempotent so a crash between the local
 * commit and the remote call — or the reverse — is repaired by a rerun or
 * the reconciler (§6.4).
 *
 * THE THREE-STEP PREPARE (D10, §6.2 "The prepare handshake", feedback P77-20).
 * `credential_handoff.handoff_class` is NOT NULL and Connect decides the
 * class, yet the pinned driver commits the local row before Connect hears of
 * it (`W:1022-1073`). So: (1) `handoff/classify` — a READ, nothing written or
 * staged; Connect answers by the ORDERED first-come rule whose provenance is
 * the retained receipt — (a) verifier reported AND a staged row or an
 * `established_canonical` receipt exists for the user → `retire`; (b) else
 * Connect password present → `adopt`; (c) else verifier → `import`; (d) else
 * `recover` — and `409 class_mismatch` when the manifest's `expectedClass`
 * differs: the driver reports the row and writes NOTHING. (2) The local row
 * is inserted with that class and authority moves to `prepared`, one
 * transaction (`handoffTable.insert`). (3) `handoff/prepare { …,
 * handoffClass }` stages (import only) and persists the class on the receipt;
 * the RP records `prepare_acked_at`. Connect re-derives and answers
 * `409 class_changed` on a difference → the row is failed and released, the
 * rerun classifies again. A `prepared` row whose `prepare_acked_at` is NULL
 * cannot be fenced (the M5 trigger; the driver refuses `prepare_unacked`
 * before asking) — the reconciler re-posts (3), idempotent per
 * `(source_system, source_user_ref)`.
 *
 * WHAT EACH CLASS PINS (§6.2 table). `import`: the hash is staged, its
 * digest and `users.updated_at` pinned as `source_*`. `adopt` and `retire`:
 * `expected_local_digest = digest(password)` (NULL without a verifier) and
 * `expected_local_revision = users.updated_at`, NOTHING staged — I8: an
 * existing Connect credential is never overwritten or re-staged by an RP
 * hash. `recover`: nothing pinned, nothing staged. p79's NULL-digest
 * discriminator (`isRecoverHandoff`, `W:295-297`) is gone: every branch
 * reads `handoff_class`.
 *
 * THE FENCE (per class, under the users row lock, same tx as the handoff row
 * — the ADAPTER's `fence`): import → verifier required, a digest that moved
 * is re-pinned (`source_drift_under_fence`; activation's compare-and-set
 * re-stages from it); adopt | retire → digest and `updated_at` must equal
 * the pinned `expected_*` or the handoff fails `adopt_source_changed` (the
 * rerun re-prepares as adopt with the new value; it can never become import
 * while Connect holds a password); recover → any verifier present fails it
 * `local_verifier_appeared` (the rerun imports or retires it). From `fenced`
 * on, no new local session is issued and every local writer is closed (M2).
 *
 * ACTIVATION WINS. A `handoff/fail` that lands after Connect's activation is
 * answered `409 already_activated`, and this side COMPLETES the flip instead
 * of releasing the fence. `activate-existing` for a `retire` row answers
 * `409 canonical_pending` until the source RP's row has been activated: a
 * transient — logged, backed off, retried, never a fail; with the fixed RP
 * order (crm, then yobo) it fires only when the source row failed, and that
 * row's fix + rerun completes both.
 *
 * RELEASE ONLY ON CONNECT'S WORD, NEVER AFTER ACTIVATION. A release request
 * is first persisted (`fail_requested_at` / `_reason`, durable) and then
 * carried to `handoff/fail`; a lost response is replayed by the reconciler,
 * never lost. `release(userId)` resolves the user's open handoff itself and
 * answers `released`, or `no_handoff` when nothing is open (D23 — the
 * authoritative no-local-handoff result; a `connect` row is `no_handoff` and
 * is left untouched).
 *
 * THE FLIP IS FIRST, THE ROW SECOND. `adapter.flipToConnect` is the one
 * statement that matters (authority `connect`, password NULL, version :=
 * Connect's); the row's `activated` transition follows. A crash between the
 * two leaves a `connect` user with an open row, which every later pass
 * completes without asking Connect (`flip_completed`).
 *
 * NO NEW CUTOVERS WITH THE FLAG OFF — except for the operator (§6.5, D23).
 * `DriverOptions.operatorCutover` is set ONLY by the route factory
 * (STORY-005) after the operator token and the live switch read passed; the
 * reconciler and every application caller leave it unset and `prepare`
 * answers `connect_disabled` while `connectEnabled` is false (the cadra-web
 * rule at `W:73-86, 1002-1009`, unchanged). fence / activate / release never
 * read the flag: a user already `prepared` or `fenced` must stay completable
 * or releasable.
 *
 * NO RUN IDS, GENERATIONS, ACKNOWLEDGEMENTS OR BARRIERS anywhere (D22;
 * feedback P77-06/13 round 4). `403 operator_superseded` from Connect ends
 * the op with nothing further written.
 *
 * NEVER LOG A VERIFIER. Digests and ids only.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/credential-handoff.ts
 */

import { createHash } from 'node:crypto'

import {
  isOperatorLeaseExpired,
  OperatorLeaseExpiredError,
} from './lease.js'
import {
  isOperatorSuperseded,
  isTransientReply,
  replyError,
  type ConnectReply,
  type HandoffTransport,
} from './transport.js'
import type {
  FenceResult,
  HandoffClass,
  HandoffRow,
  HandoffState,
  LocalCredentialRead,
  RpAdapter,
} from '../../adapter/index.js'

// =============================================================================
// Types
// =============================================================================

export type HandoffLogKind =
  | 'classified'
  | 'class_mismatch'
  | 'prepared'
  | 'prepare_acked'
  | 'staged'
  | 'restaged'
  | 'fenced'
  | 'fence_reasserted'
  | 'source_drift_under_fence'
  | 'activated'
  | 'activation_replayed'
  | 'completed_over_fail'
  | 'flip_completed'
  | 'canonical_pending'
  | 'recover_refused'
  | 'local_verifier_appeared'
  | 'adopt_source_changed'
  | 'failed'
  | 'fail_requested'
  | 'released'
  | 'connect_unreachable'
  | 'operator_superseded'
  | 'op_expired'
  | 'refused'
  | 'skipped_in_flight'

export interface HandoffLogEvent {
  kind: HandoffLogKind
  handoffId?: string | null
  userId?: number | null
  from?: string | null
  to?: string | null
  detail?: Record<string, unknown>
}

/** Where the driver reports each step; an adapter may persist it (`credential_handoff_log`). Never a verifier. */
export type HandoffLogger = (event: HandoffLogEvent) => void

/** What one step ended with. `outcome` is the driver's word; `detail.connectOutcome` is Connect's. */
export interface StepResult {
  ok: boolean
  handoff: HandoffRow | null
  outcome: string
  detail?: Record<string, unknown>
}

/** TEST-ONLY pause/crash points, one per protocol step (§6.4's crash matrix). */
export interface DriverHooks {
  afterClassify?: (ctx: { userId: number; handoffClass: HandoffClass }) => Promise<void>
  afterLocalInsert?: (row: HandoffRow) => Promise<void>
  afterPrepareAck?: (row: HandoffRow) => Promise<void>
  afterFence?: (row: HandoffRow) => Promise<void>
  /** Connect has activated; the RP's reply is about to be acted on (the "reply lost" point). */
  afterConnectActivation?: (row: HandoffRow) => Promise<void>
  /** The flip landed; the row's `activated` transition has not. */
  afterFlip?: (row: HandoffRow) => Promise<void>
}

export interface DriverOptions {
  adapter: RpAdapter
  transport: HandoffTransport
  /** `YOBO_CONNECT_ENABLED` as this process serves it. */
  connectEnabled: boolean
  /**
   * Set ONLY by the route factory (STORY-005) after `verifyOperatorToken` accepted the
   * `X-Cutover-Operator` header AND the live maintenance read confirmed the switch is on with
   * the token's jti. Lets `prepare` open a NEW handoff while the flag is off. Every other
   * caller leaves it unset and gets `connect_disabled`.
   */
  operatorCutover?: boolean
  now?: () => Date
  log?: HandoffLogger
  hooks?: DriverHooks
}

export type PrepareRefusal =
  | 'connect_disabled'
  | 'already_connect'
  | 'unbound'
  | 'user_missing'
  | 'class_mismatch'
  | 'subject_not_mapped'
  | 'connect_unreachable'
  | 'operator_superseded'
  | 'op_expired'
  | 'in_flight'
  | 'refused'

export type PrepareResult =
  | {
      ok: true
      handoff: HandoffRow
      handoffClass: HandoffClass
      resumed: boolean
      /**
       * Connect's word on step (3): `staged` | `restaged` | `recorded` | `acked` (ok), or
       * `connect_unreachable` / `operator_superseded` (not ok — the row is `prepared` with
       * `prepare_acked_at` NULL; the reconciler re-posts), or `failed` (`class_changed` and
       * the other permanent answers — released on Connect's word).
       */
      remote: StepResult
    }
  | {
      ok: false
      handoff: HandoffRow | null
      outcome: PrepareRefusal
      detail?: Record<string, unknown>
    }

export type ReleaseOutcome = 'released' | 'no_handoff' | 'already_activated' | 'connect_unreachable' | 'op_expired' | 'in_flight'

export interface RunResult {
  prepare: PrepareResult
  fence: StepResult | null
  activate: StepResult | null
  handoff: HandoffRow | null
  /** The row's terminal word for the report: `connect`, `failed`, `fenced` (waiting), or the refusal. */
  outcome: string
}

export interface HandoffDriver {
  /** §6.2 steps (1)–(3). `expectedClass` is the manifest's election (operator runs); absent for an application caller. */
  prepare(userId: number, opts?: { expectedClass?: HandoffClass }): Promise<PrepareResult>
  /** `fenced`: closes the local writers and pins the observation. Idempotent (re-asserts). */
  fence(userId: number): Promise<StepResult>
  /** `activated`: re-asserts the fence, then `activate` (import) or `activate-existing` (adopt | retire | recover); completes the flip on Connect's word. Replay-safe. */
  activate(userId: number): Promise<StepResult>
  /** Persist the request, carry it to Connect, release on its word. Never after activation. */
  release(userId: number, reason?: string): Promise<{ outcome: ReleaseOutcome; handoff: HandoffRow | null }>
  /** prepare → fence → activate for one user, stopping at the first step that did not complete. */
  run(userId: number, opts?: { expectedClass?: HandoffClass }): Promise<RunResult>
  /**
   * The reconciler's per-row resume (§6.4): completes a landed flip, carries a pending fail,
   * re-posts an unacked prepare, re-stages + fences a `prepared` row, re-asserts + activates a
   * `fenced` row. Never opens a handoff; never reads the flag.
   */
  resume(row: HandoffRow): Promise<StepResult>
}

// =============================================================================
// Constants and pure helpers
// =============================================================================

export const NO_CONNECT_CREDENTIAL_YET = 'no_connect_credential_yet'
export const LOCAL_VERIFIER_APPEARED = 'local_verifier_appeared'
export const ADOPT_SOURCE_CHANGED = 'adopt_source_changed'
export const RELEASED_BY_OPERATOR = 'released_by_operator'

const BACKOFF_BASE_MS = 5_000
const BACKOFF_CAP_MS = 60 * 60 * 1_000

/** Exponential from 5 s, capped at one hour (the p79 schedule). */
export function backoffMs(attempts: number): number {
  const exp = Math.min(Math.max(attempts, 1) - 1, 30)
  return Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_CAP_MS)
}

/** Same shape check Connect applies at staging — what "the RP reports a verifier" means. */
export const BCRYPT_VERIFIER_RE = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/

export function digestVerifier(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('hex')
}

const HANDOFF_CLASSES: readonly HandoffClass[] = ['import', 'retire', 'recover', 'adopt']
export function isHandoffClass(v: unknown): v is HandoffClass {
  return typeof v === 'string' && (HANDOFF_CLASSES as readonly string[]).includes(v)
}

function isLockNotAvailable(err: unknown): boolean {
  let cur: any = err
  for (let i = 0; cur && i < 6; i += 1) {
    if (cur?.code === '55P03' || /could not obtain lock/i.test(String(cur?.message ?? ''))) return true
    cur = cur.cause
  }
  return false
}

function isUniqueViolation(err: unknown): boolean {
  let cur: any = err
  for (let i = 0; cur && i < 6; i += 1) {
    if (cur?.code === '23505' || /credential_handoff_open_user_uq/i.test(String(cur?.message ?? ''))) return true
    cur = cur.cause
  }
  return false
}

/** The values the fence compares, per persisted class (§6.2 table). */
export function fenceExpectation(row: HandoffRow): { digest?: string; revision?: string } {
  switch (row.handoffClass) {
    case 'import':
      return { ...(row.sourceDigest ? { digest: row.sourceDigest } : {}) }
    case 'adopt':
    case 'retire':
      return {
        ...(row.expectedLocalDigest ? { digest: row.expectedLocalDigest } : {}),
        ...(row.expectedLocalRevision ? { revision: row.expectedLocalRevision } : {}),
      }
    case 'recover':
    default:
      return {}
  }
}

// =============================================================================
// The driver
// =============================================================================

export function createHandoffDriver(opts: DriverOptions): HandoffDriver {
  const { adapter, transport } = opts
  const now = opts.now ?? (() => new Date())
  const log: HandoffLogger = opts.log ?? (() => {})
  const hooks = opts.hooks ?? {}
  const table = adapter.handoffTable
  const refOf = (userId: number) => String(userId)

  // ---------------------------------------------------------------------------
  // Row helpers — every write is one adapter call
  // ---------------------------------------------------------------------------

  const patch = (
    row: HandoffRow,
    p: NonNullable<Parameters<typeof table.transition>[2]>,
  ): Promise<HandoffRow> => table.transition(row.handoffId, row.state, p)

  async function recordUnreachable(row: HandoffRow, reply: ConnectReply, op: string): Promise<StepResult> {
    const attempts = row.attempts + 1
    const next = new Date(now().getTime() + backoffMs(attempts))
    const error = reply.error ?? `${op}: connect returned ${reply.status}: ${replyError(reply)}`
    const updated = await patch(row, { nextAttemptAt: next.toISOString(), lastError: error })
    log({ kind: 'connect_unreachable', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state, detail: { op, status: reply.status, error, attempts } })
    return { ok: false, handoff: { ...updated, attempts }, outcome: 'connect_unreachable', detail: { op, status: reply.status } }
  }

  /** `403 operator_superseded`: the op ends here with nothing further written. */
  function superseded(row: HandoffRow | null, op: string): StepResult {
    log({ kind: 'operator_superseded', handoffId: row?.handoffId, userId: row?.localUserId, detail: { op } })
    return { ok: false, handoff: row, outcome: 'operator_superseded', detail: { op } }
  }

  /** The `failed` transition, on Connect's word: request persisted → row failed + authority local (adapter.release). */
  async function completeFailure(row: HandoffRow, reason: string, connectOutcome: string): Promise<StepResult> {
    let current = row
    if (current.failRequestedReason !== reason || !current.failRequestedAt) {
      current = await patch(current, { failRequestedAt: now().toISOString(), failRequestedReason: reason })
    }
    const released = current.localUserId == null ? 'no_handoff' : await adapter.release(current.localUserId)
    const updated = (await table.readHandoff(current.handoffId)) ?? current
    log({ kind: 'failed', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: 'failed', detail: { reason, connectOutcome, released } })
    return { ok: true, handoff: updated, outcome: 'failed', detail: { reason, connectOutcome, released } }
  }

  /** Connect's credential version for the flip's mirror (from the activation answer, else `handoff/state`, else 1). */
  async function connectCredentialVersion(row: HandoffRow, fromAnswer: unknown): Promise<number> {
    if (Number.isInteger(fromAnswer) && (fromAnswer as number) >= 1) return fromAnswer as number
    if (row.localUserId == null) return 1
    const reply = await transport.state({ sourceUserRef: refOf(row.localUserId) })
    const cv = reply.status === 200 ? reply.json?.credentialVersion : undefined
    if (Number.isInteger(cv) && (cv as number) >= 1) return cv as number
    console.warn('[connect handoff] flip without Connect\'s credential version — mirror set to 1', { status: reply.status, error: reply.error })
    return 1
  }

  /** The `activated` transition: FLIP first (the statement that matters), then the row. */
  async function completeActivation(row: HandoffRow, connectOutcome: string, kind: HandoffLogKind, cvFromAnswer?: unknown): Promise<StepResult> {
    if (hooks.afterConnectActivation) await hooks.afterConnectActivation(row)
    if (row.localUserId != null) {
      const cv = await connectCredentialVersion(row, cvFromAnswer)
      await adapter.flipToConnect(row.localUserId, cv)
    }
    if (hooks.afterFlip) await hooks.afterFlip(row)
    return completeRow(row, connectOutcome, kind)
  }

  /** The row's walk to `activated` (the flip has landed). */
  async function completeRow(row: HandoffRow, connectOutcome: string, kind: HandoffLogKind): Promise<StepResult> {
    let current = row
    if (current.state === 'prepared') {
      // Only reachable when Connect reports an activation for a row that never recorded its
      // fence. Walk the machine honestly: ack (the trigger refuses an unacked fence), then fence.
      if (!current.prepareAckedAt) current = await patch(current, { prepareAckedAt: now().toISOString() })
      current = await table.transition(current.handoffId, 'fenced')
    }
    const updated =
      current.state === 'activated'
        ? current
        : await table.transition(current.handoffId, 'activated', { lastOutcome: connectOutcome, lastError: null, failRequestedReason: null, failRequestedAt: null })
    log({ kind, handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: 'activated', detail: { connectOutcome } })
    return { ok: true, handoff: updated, outcome: kind, detail: { connectOutcome } }
  }

  /** `handoff/fail`, carried on a persisted request. ACTIVATION WINS. */
  async function stepFail(row: HandoffRow, reason: string): Promise<StepResult> {
    if (row.state === 'activated') return { ok: false, handoff: row, outcome: 'refused', detail: { why: 'already_activated' } }
    if (row.state === 'failed') return { ok: true, handoff: row, outcome: 'already_failed' }
    let current = row
    if (current.failRequestedReason !== reason || !current.failRequestedAt) {
      current = await patch(current, { failRequestedAt: now().toISOString(), failRequestedReason: reason })
      log({ kind: 'fail_requested', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state, detail: { reason } })
    }
    const reply = await transport.fail({ sourceUserRef: refOf(current.localUserId ?? 0), handoffId: current.handoffId, reason })
    if (isOperatorSuperseded(reply)) return superseded(current, 'fail')
    if (isTransientReply(reply)) return recordUnreachable(current, reply, 'fail')
    if (reply.status === 200) return completeFailure(current, reason, String(reply.json?.outcome ?? 'ok'))
    const error = replyError(reply)
    if (reply.status === 409 && error === 'already_activated') return completeActivation(current, 'already_activated', 'completed_over_fail')
    if (reply.status === 404) return completeFailure(current, reason, 'subject_not_mapped')
    return recordUnreachable(current, { ...reply, error: `fail: connect returned ${reply.status} ${error}` }, 'fail')
  }

  // ---------------------------------------------------------------------------
  // Step (3) — handoff/prepare, and its re-post / re-stage
  // ---------------------------------------------------------------------------

  async function postPrepare(row: HandoffRow, lc: LocalCredentialRead | null): Promise<StepResult> {
    const verifier = lc?.verifier ?? null
    const isImport = row.handoffClass === 'import'
    if (isImport && !verifier) return stepFail(row, 'verifier_missing')
    const reply = await transport.prepare({
      handoffId: row.handoffId,
      sourceUserRef: refOf(row.localUserId ?? 0),
      handoffClass: row.handoffClass,
      hasVerifier: !!verifier,
      digest: lc?.digest ?? null,
      revision: lc?.revision ?? null,
      ...(isImport && verifier ? { source: { verifier, revision: lc!.revision } } : {}),
    })
    if (isOperatorSuperseded(reply)) return superseded(row, 'prepare')
    if (isTransientReply(reply)) return recordUnreachable(row, reply, 'prepare')
    if (reply.status === 200) {
      const outcome = String(reply.json?.outcome ?? 'recorded')
      const answered = reply.json?.handoffClass
      if (isHandoffClass(answered) && answered !== row.handoffClass) {
        // Connect persisted a different class on its receipt — a re-derivation the receiver
        // should have refused as `class_changed`. Fail closed on our word being different.
        return stepFail(row, `class_changed:${answered}`)
      }
      const updated = await patch(row, {
        ...(row.prepareAckedAt ? {} : { prepareAckedAt: now().toISOString() }),
        lastOutcome: `prepare:${outcome}`,
        lastError: null,
        ...(isImport && lc?.digest ? { sourceDigest: lc.digest, sourceRevision: lc.revision } : {}),
      })
      log({ kind: row.prepareAckedAt ? (outcome === 'restaged' ? 'restaged' : 'staged') : 'prepare_acked', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state, detail: { outcome } })
      if (hooks.afterPrepareAck && !row.prepareAckedAt) await hooks.afterPrepareAck(updated)
      return { ok: true, handoff: updated, outcome: row.prepareAckedAt ? outcome : 'acked', detail: { connectOutcome: outcome } }
    }
    const error = replyError(reply)
    if (reply.status === 409 && error === 'class_changed') return stepFail(row, `class_changed:${String(reply.json?.handoffClass ?? '')}`)
    if (reply.status === 409 && error === 'already_activated') return completeActivation(row, 'already_activated', 'completed_over_fail')
    if (reply.status === 409) return completeFailure(row, `connect:${error}`, error)
    if (reply.status === 404) return completeFailure(row, 'connect:subject_not_mapped', 'subject_not_mapped')
    return stepFail(row, `prepare refused: ${error}`)
  }

  // ---------------------------------------------------------------------------
  // prepare — steps (1), (2), (3)
  // ---------------------------------------------------------------------------

  async function prepareInner(userId: number, o: { expectedClass?: HandoffClass }): Promise<PrepareResult> {
    const newCutoverAllowed = opts.connectEnabled || opts.operatorCutover === true

    // An open handoff is resumed whatever the flag says (a user already `prepared` or
    // `fenced` must stay completable); a NEW one needs the flag or the operator.
    const existing = await table.readOpenHandoffForUser(userId)
    if (existing) {
      if (!existing.prepareAckedAt) {
        const lc = await adapter.readLocalCredential(userId)
        const remote = await postPrepare(existing, lc)
        return { ok: true, handoff: remote.handoff ?? existing, handoffClass: existing.handoffClass, resumed: true, remote }
      }
      return { ok: true, handoff: existing, handoffClass: existing.handoffClass, resumed: true, remote: { ok: true, handoff: existing, outcome: 'resumed' } }
    }
    if (!newCutoverAllowed) return { ok: false, handoff: null, outcome: 'connect_disabled' }

    const lc = await adapter.readLocalCredential(userId)
    if (!lc) return { ok: false, handoff: null, outcome: 'user_missing' }
    if (lc.authority === 'connect') return { ok: false, handoff: null, outcome: 'already_connect' }
    const auth = await adapter.readAuthority(userId)
    if (!auth.issuer || !auth.sub) return { ok: false, handoff: null, outcome: 'unbound' }
    if (lc.authority !== 'local') {
      // `prepared`/`fenced` with no open row: a hand edit or a lost release. The reconciler's
      // invariant is the adapter's; here we refuse rather than open a second lineage.
      return { ok: false, handoff: null, outcome: 'refused', detail: { why: `authority_${lc.authority}_without_open_handoff` } }
    }

    // (1) classify — a read. Nothing written on any refusal.
    const hasVerifier = !!lc.verifier
    const classified = await transport.classify({
      sourceUserRef: refOf(userId),
      hasVerifier,
      digest: lc.digest,
      revision: lc.revision,
      ...(o.expectedClass ? { expectedClass: o.expectedClass } : {}),
    })
    if (isOperatorSuperseded(classified)) return { ok: false, handoff: null, outcome: 'operator_superseded', detail: { op: 'classify' } }
    if (isTransientReply(classified)) return { ok: false, handoff: null, outcome: 'connect_unreachable', detail: { op: 'classify', status: classified.status, error: classified.error } }
    if (classified.status === 409 && replyError(classified) === 'class_mismatch') {
      log({ kind: 'class_mismatch', userId, detail: { expected: o.expectedClass ?? null, answered: classified.json?.handoffClass ?? null } })
      return { ok: false, handoff: null, outcome: 'class_mismatch', detail: { expected: o.expectedClass ?? null, answered: classified.json?.handoffClass ?? null } }
    }
    if (classified.status === 404) return { ok: false, handoff: null, outcome: 'subject_not_mapped' }
    const handoffClass = classified.status === 200 ? classified.json?.handoffClass : undefined
    if (!isHandoffClass(handoffClass)) {
      return { ok: false, handoff: null, outcome: 'refused', detail: { why: 'classify_unrecognised', status: classified.status, error: replyError(classified) } }
    }
    if (o.expectedClass && o.expectedClass !== handoffClass) {
      // Belt and braces: the receiver should have answered 409; the manifest is asserted here too.
      log({ kind: 'class_mismatch', userId, detail: { expected: o.expectedClass, answered: handoffClass } })
      return { ok: false, handoff: null, outcome: 'class_mismatch', detail: { expected: o.expectedClass, answered: handoffClass } }
    }
    if (handoffClass === 'import' && !hasVerifier) {
      return { ok: false, handoff: null, outcome: 'refused', detail: { why: 'import_without_verifier' } }
    }
    log({ kind: 'classified', userId, detail: { handoffClass, hasVerifier, expected: o.expectedClass ?? null } })
    if (hooks.afterClassify) await hooks.afterClassify({ userId, handoffClass })

    // (2) the local row, with the answered class, authority prepared — ONE adapter transaction.
    const isImport = handoffClass === 'import'
    const pins = handoffClass === 'adopt' || handoffClass === 'retire'
    let row: HandoffRow
    try {
      row = await table.insert({
        connectIssuer: auth.issuer,
        connectSub: auth.sub,
        localUserId: userId,
        handoffClass,
        sourceDigest: isImport ? lc.digest : null,
        sourceRevision: isImport ? lc.revision : null,
        expectedLocalDigest: pins ? lc.digest : null,
        expectedLocalRevision: pins ? lc.revision : null,
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Lost the race to another prepare for this user: resume theirs.
        const raced = await table.readOpenHandoffForUser(userId)
        if (raced) return { ok: true, handoff: raced, handoffClass: raced.handoffClass, resumed: true, remote: { ok: true, handoff: raced, outcome: 'resumed' } }
      }
      throw err
    }
    log({ kind: 'prepared', handoffId: row.handoffId, userId, from: 'local', to: 'prepared', detail: { handoffClass } })
    if (hooks.afterLocalInsert) await hooks.afterLocalInsert(row)

    // (3) handoff/prepare — stages (import) and persists the class; the ack is recorded on its answer.
    const remote = await postPrepare(row, lc)
    return { ok: true, handoff: remote.handoff ?? row, handoffClass, resumed: false, remote }
  }

  // ---------------------------------------------------------------------------
  // fence
  // ---------------------------------------------------------------------------

  async function fenceRow(row: HandoffRow): Promise<StepResult & { digest?: string | null; revision?: string | null }> {
    if (row.localUserId == null) return { ok: false, handoff: row, outcome: 'refused', detail: { why: 'no_local_user' } }
    if (row.state !== 'prepared' && row.state !== 'fenced') return { ok: false, handoff: row, outcome: 'refused', detail: { why: `state_${row.state}` } }
    if (!row.prepareAckedAt) {
      log({ kind: 'refused', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state, detail: { why: 'prepare_unacked' } })
      return { ok: false, handoff: row, outcome: 'refused', detail: { why: 'prepare_unacked' } }
    }
    const r: FenceResult = await adapter.fence(row.localUserId, fenceExpectation(row))
    if (r.outcome === 'refused') {
      switch (r.reason) {
        case 'adopt_source_changed':
          log({ kind: 'adopt_source_changed', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state })
          return stepFail(row, ADOPT_SOURCE_CHANGED)
        case 'local_verifier_appeared':
          log({ kind: 'local_verifier_appeared', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state })
          return stepFail(row, LOCAL_VERIFIER_APPEARED)
        case 'verifier_missing':
          return stepFail(row, 'verifier_missing')
        case 'source_drift_under_fence': {
          // An adapter that refuses instead of re-pinning: re-stage from the row now, then fence again once.
          const lc = await adapter.readLocalCredential(row.localUserId)
          const restaged = await postPrepare(row, lc)
          if (!restaged.ok || restaged.outcome === 'failed') return restaged
          const again = await adapter.fence(row.localUserId, fenceExpectation(restaged.handoff ?? row))
          if (again.outcome === 'refused') return { ok: false, handoff: restaged.handoff ?? row, outcome: 'refused', detail: { why: again.reason } }
          return fenced(restaged.handoff ?? row, again)
        }
        case 'not_acked':
          return { ok: false, handoff: row, outcome: 'refused', detail: { why: 'prepare_unacked' } }
        case 'in_flight':
          return { ok: false, handoff: row, outcome: 'in_flight' }
        case 'op_expired':
          log({ kind: 'op_expired', handoffId: row.handoffId, userId: row.localUserId, detail: { op: 'fence' } })
          return { ok: false, handoff: row, outcome: 'op_expired' }
        default:
          return { ok: false, handoff: row, outcome: 'refused', detail: { why: r.reason } }
      }
    }
    return fenced(row, r)
  }

  async function fenced(row: HandoffRow, r: Extract<FenceResult, { outcome: 'fenced' }>): Promise<StepResult & { digest?: string | null; revision?: string | null }> {
    let updated = (await table.readHandoff(row.handoffId)) ?? { ...row, state: 'fenced' as HandoffState }
    const reasserted = row.state === 'fenced'
    if (row.handoffClass === 'import' && r.digest && r.digest !== row.sourceDigest) {
      // The verifier moved under `prepared` (local writes were still open). Re-pin: activation's
      // compare-and-set re-stages from what is on the row NOW.
      log({ kind: 'source_drift_under_fence', handoffId: row.handoffId, userId: row.localUserId, from: 'fenced', to: 'fenced', detail: { was: row.sourceDigest, now: r.digest } })
      updated = await table.transition(row.handoffId, 'fenced', { sourceDigest: r.digest, sourceRevision: r.revision, lastOutcome: 'source_drift_under_fence' })
    }
    log({ kind: reasserted ? 'fence_reasserted' : 'fenced', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: 'fenced', detail: { handoffClass: row.handoffClass } })
    if (hooks.afterFence && !reasserted) await hooks.afterFence(updated)
    return { ok: true, handoff: updated, outcome: reasserted ? 'fence_reasserted' : 'fenced', digest: r.digest, revision: r.revision }
  }

  // ---------------------------------------------------------------------------
  // activate — import: compare-and-set on the staged verifier; others: activate-existing
  // ---------------------------------------------------------------------------

  async function activateImport(row: HandoffRow): Promise<StepResult> {
    const lc = row.localUserId == null ? null : await adapter.readLocalCredential(row.localUserId)
    if (!lc?.verifier) return stepFail(row, 'verifier_missing')
    let current = row
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reply = await transport.activate({ handoffId: current.handoffId, sourceUserRef: refOf(current.localUserId ?? 0), source: { verifier: lc.verifier, revision: lc.revision } })
      if (isOperatorSuperseded(reply)) return superseded(current, 'activate')
      if (isTransientReply(reply)) return recordUnreachable(current, reply, 'activate')
      const error = replyError(reply)
      if (reply.status === 200) {
        const outcome = String(reply.json?.outcome ?? '')
        if (outcome === 'activated') return completeActivation(current, outcome, 'activated', reply.json?.credentialVersion)
        if (outcome === 'already_activated') return completeActivation(current, outcome, 'activation_replayed', reply.json?.credentialVersion)
        if (outcome === 'quarantined') return completeFailure(current, `quarantined:${String(reply.json?.reason ?? '')}`, 'quarantined')
        if (outcome === 'restaged') {
          current = await patch(current, { lastOutcome: 'activate:restaged', sourceDigest: lc.digest, sourceRevision: lc.revision })
          log({ kind: 'restaged', handoffId: current.handoffId, userId: current.localUserId, from: 'fenced', to: 'fenced', detail: { at: 'activate', attempt } })
          continue
        }
        if (outcome === 'not_staged') {
          // Prepare never reached Connect (or its staging was purged). Stage under the fence and try again.
          const staged = await postPrepare(current, lc)
          if (!staged.ok || staged.outcome === 'failed') return staged
          current = staged.handoff ?? current
          continue
        }
        return recordUnreachable(current, { ...reply, error: `activate: unrecognised outcome ${outcome}` }, 'activate')
      }
      if (reply.status === 409 && error === 'already_activated') return completeActivation(current, 'already_activated', 'completed_over_fail')
      if (reply.status === 409 && (error === 'handoff_failed' || error === 'quarantined')) return completeFailure(current, `connect:${error}`, error)
      if (reply.status === 404) return completeFailure(current, 'connect:subject_not_mapped', 'subject_not_mapped')
      return recordUnreachable(current, { ...reply, error: `activate: connect returned ${reply.status} ${error}` }, 'activate')
    }
    return recordUnreachable(current, { status: 0, json: null, error: 'activate: still restaged after 3 attempts' }, 'activate')
  }

  async function activateExisting(row: HandoffRow): Promise<StepResult> {
    if (row.handoffClass === 'import') return { ok: false, handoff: row, outcome: 'refused', detail: { why: 'import_row' } }
    const reply = await transport.activateExisting({ handoffId: row.handoffId, sourceUserRef: refOf(row.localUserId ?? 0), handoffClass: row.handoffClass })
    if (isOperatorSuperseded(reply)) return superseded(row, 'activate-existing')
    if (isTransientReply(reply)) return recordUnreachable(row, reply, 'activate-existing')
    const error = replyError(reply)
    if (reply.status === 200) {
      const outcome = String(reply.json?.outcome ?? '')
      if (outcome === 'activated') return completeActivation(row, `existing:${String(reply.json?.via ?? row.handoffClass)}`, 'activated', reply.json?.credentialVersion)
      if (outcome === 'already_activated') return completeActivation(row, outcome, 'activation_replayed', reply.json?.credentialVersion)
      if (outcome === NO_CONNECT_CREDENTIAL_YET) {
        log({ kind: 'recover_refused', handoffId: row.handoffId, userId: row.localUserId, from: row.state, to: row.state, detail: { why: outcome } })
        return stepFail(row, NO_CONNECT_CREDENTIAL_YET)
      }
      return recordUnreachable(row, { ...reply, error: `activate-existing: unrecognised outcome ${outcome}` }, 'activate-existing')
    }
    if (reply.status === 409 && error === 'canonical_pending') {
      // The source RP's row is not yet activated (D10). A transient: the row stays fenced —
      // no new local session — nothing is released, the activation is retried on the next pass.
      const attempts = row.attempts + 1
      const next = new Date(now().getTime() + backoffMs(attempts))
      const updated = await patch(row, { nextAttemptAt: next.toISOString(), lastOutcome: 'canonical_pending', lastError: null })
      log({ kind: 'canonical_pending', handoffId: row.handoffId, userId: row.localUserId, from: 'fenced', to: 'fenced', detail: { attempts, nextAttemptAt: next.toISOString() } })
      return { ok: false, handoff: { ...updated, attempts }, outcome: 'canonical_pending', detail: { attempts } }
    }
    if (reply.status === 409 && error === 'already_activated') return completeActivation(row, 'already_activated', 'completed_over_fail')
    if (reply.status === 409 && (error === 'handoff_failed' || error === 'staged_verifier_present' || error === 'quarantined')) return completeFailure(row, `connect:${error}`, error)
    if (reply.status === 404) return completeFailure(row, 'connect:subject_not_mapped', 'subject_not_mapped')
    return recordUnreachable(row, { ...reply, error: `activate-existing: connect returned ${reply.status} ${error}` }, 'activate-existing')
  }

  /** Re-assert the fence, then the variant the class calls for. Requires `fenced`. */
  async function activateRow(row: HandoffRow): Promise<StepResult> {
    if (row.state === 'activated') return { ok: true, handoff: row, outcome: 'already_activated' }
    if (row.state !== 'fenced') return { ok: false, handoff: row, outcome: 'refused', detail: { why: `state_${row.state}` } }
    const landed = await flipLanded(row)
    if (landed) return landed
    const f = await fenceRow(row)
    if (!f.ok || f.outcome === 'failed') return f
    const current = f.handoff ?? row
    return current.handoffClass === 'import' ? activateImport(current) : activateExisting(current)
  }

  /** A `connect` user with an open row: the flip landed and the row's transition did not. Complete it, ask nothing. */
  async function flipLanded(row: HandoffRow): Promise<StepResult | null> {
    if (row.localUserId == null) return null
    const auth = await adapter.readAuthority(row.localUserId)
    if (auth.authority !== 'connect') return null
    return completeRow(row, 'flip_already_landed', 'flip_completed')
  }

  // ---------------------------------------------------------------------------
  // The public face — every entry resolves the user's open handoff itself and maps the lease
  // ---------------------------------------------------------------------------

  async function guarded<T>(fn: () => Promise<T>, onExpired: (e: OperatorLeaseExpiredError) => T, onInFlight: () => T): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (isOperatorLeaseExpired(err)) {
        log({ kind: 'op_expired', detail: { opId: err.opId } })
        return onExpired(err)
      }
      if (isLockNotAvailable(err)) return onInFlight()
      throw err
    }
  }

  const driver: HandoffDriver = {
    prepare: (userId, o = {}) =>
      guarded(
        () => prepareInner(userId, o),
        () => ({ ok: false, handoff: null, outcome: 'op_expired' }),
        () => ({ ok: false, handoff: null, outcome: 'in_flight' }),
      ),

    fence: (userId) =>
      guarded(
        async () => {
          const row = await table.readOpenHandoffForUser(userId)
          if (!row) return { ok: false, handoff: null, outcome: 'no_handoff' }
          return fenceRow(row)
        },
        () => ({ ok: false, handoff: null, outcome: 'op_expired' }),
        () => ({ ok: false, handoff: null, outcome: 'in_flight' }),
      ),

    activate: (userId) =>
      guarded(
        async () => {
          const row = await table.readOpenHandoffForUser(userId)
          if (!row) return { ok: false, handoff: null, outcome: 'no_handoff' }
          return activateRow(row)
        },
        () => ({ ok: false, handoff: null, outcome: 'op_expired' }),
        () => ({ ok: false, handoff: null, outcome: 'in_flight' }),
      ),

    release: (userId, reason = RELEASED_BY_OPERATOR) =>
      guarded(
        async () => {
          const row = await table.readOpenHandoffForUser(userId)
          if (!row) return { outcome: 'no_handoff', handoff: null }
          const landed = await flipLanded(row)
          if (landed) return { outcome: 'already_activated', handoff: landed.handoff }
          const r = await stepFail(row, reason)
          if (r.outcome === 'failed' || r.outcome === 'already_failed') {
            log({ kind: 'released', handoffId: row.handoffId, userId, from: row.state, to: 'failed', detail: { reason } })
            return { outcome: 'released', handoff: r.handoff }
          }
          if (r.outcome === 'completed_over_fail' || r.outcome === 'activation_replayed') return { outcome: 'already_activated', handoff: r.handoff }
          if (r.outcome === 'op_expired') return { outcome: 'op_expired', handoff: r.handoff }
          if (r.outcome === 'in_flight') return { outcome: 'in_flight', handoff: r.handoff }
          return { outcome: 'connect_unreachable', handoff: r.handoff }
        },
        () => ({ outcome: 'op_expired', handoff: null }),
        () => ({ outcome: 'in_flight', handoff: null }),
      ),

    run: async (userId, o = {}) => {
      const prepare = await driver.prepare(userId, o)
      // D22: a row already `connect` answers `already_activated` at the estate level, asking Connect nothing.
      if (!prepare.ok) return { prepare, fence: null, activate: null, handoff: prepare.handoff, outcome: prepare.outcome === 'already_connect' ? 'already_activated' : prepare.outcome }
      if (!prepare.remote.ok || prepare.remote.outcome === 'failed') {
        const handoff = prepare.remote.handoff ?? prepare.handoff
        return { prepare, fence: null, activate: null, handoff, outcome: prepare.remote.outcome === 'failed' ? 'failed' : prepare.remote.outcome }
      }
      if (prepare.remote.outcome === 'completed_over_fail' || prepare.remote.outcome === 'activation_replayed') {
        return { prepare, fence: null, activate: null, handoff: prepare.remote.handoff, outcome: 'connect' }
      }
      const fence = await driver.fence(userId)
      // A fence that FAILED the handoff (adopt drift, a verifier under a recover row) is a finished run.
      if (!fence.ok || fence.outcome === 'failed') return { prepare, fence, activate: null, handoff: fence.handoff, outcome: fence.outcome === 'failed' ? 'failed' : fence.outcome }
      const activate = await driver.activate(userId)
      const outcome =
        activate.ok && activate.outcome !== 'failed' && activate.outcome !== 'already_failed'
          ? 'connect'
          : activate.outcome === 'failed'
            ? 'failed'
            : activate.outcome
      return { prepare, fence, activate, handoff: activate.handoff, outcome }
    },

    resume: (row) =>
      guarded(
        async () => {
          if (row.state !== 'prepared' && row.state !== 'fenced') return { ok: false, handoff: row, outcome: 'refused', detail: { why: `state_${row.state}` } }
          const landed = await flipLanded(row)
          if (landed) return landed
          if (row.failRequestedAt || row.failRequestedReason) return stepFail(row, row.failRequestedReason ?? RELEASED_BY_OPERATOR)
          let current = row
          if (current.state === 'prepared') {
            // Re-post (3) while unacked; an `import` row also re-stages from the source now
            // (local writes were open under `prepared`, and the re-post is idempotent).
            if (!current.prepareAckedAt || current.handoffClass === 'import') {
              const lc = current.localUserId == null ? null : await adapter.readLocalCredential(current.localUserId)
              const posted = await postPrepare(current, lc)
              if (!posted.ok || posted.outcome === 'failed' || posted.outcome === 'completed_over_fail') return posted
              current = posted.handoff ?? current
            }
            const f = await fenceRow(current)
            if (!f.ok || f.outcome === 'failed') return f
            current = f.handoff ?? current
          }
          return activateRow(current)
        },
        () => ({ ok: false, handoff: row, outcome: 'op_expired' }),
        () => ({ ok: false, handoff: row, outcome: 'in_flight' }),
      ),
  }

  return driver
}

/**
 * p77 STORY-005 — `classify()`: the manifest's prediction of what Connect
 * will answer at `handoff/classify` for every (RP, person) row.
 *
 * ONE DECISION TABLE (P77-20, resolved in yobo-auth by STORY-014; aligned
 * here by the p77 follow-up FIX-connect-followups). Connect decides a class
 * with `decideHandoffClass` (yobo-auth `src/server/lib/handoff-class-rule.ts`)
 * over four facts, in this order:
 *
 *   (1) verifier AND (a staged row OR an activated established_canonical
 *       receipt exists for the user that is NOT this row's own)  → retire
 *   (2) else Connect's users.password IS NOT NULL                 → adopt
 *   (3) else verifier                                            → import
 *   (4) else                                                     → recover
 *
 * `decideHandoffClass` below is a line-for-line port of that function (this
 * SDK cannot import yobo-auth). The manifest carries NO class rule of its
 * own: `classifyPerson` REPLAYS the sequential driver per person — driven
 * rows in plan order (then row id), each asking `decideHandoffClass` with the
 * facts as they will be when the driver reaches it; a predicted `import`
 * advances the facts exactly as its activation will (password present, the
 * row's own established receipt, staging consumed). `canonicalSource` is the
 * system of the row predicted `import` (null when none) — an OUTPUT of the
 * rule, never a separate election.
 *
 * The earlier D10 prose this file used to carry disagreed with Connect in two
 * places, both fixed by the replay: a verifier row next to a Connect password
 * with NO receipt is `adopt` (rule 2), never `retire`; a verifier-less crm
 * row whose source is the LATER yobo row is `recover` (rule 4 when the driver
 * reaches crm), never `adopt`. `retire` and `adopt` are operationally
 * identical after prepare (nothing staged, `activate-existing`). The driver
 * asserts this prediction as `expectedClass`; a stale manifest surfaces as
 * `409 class_mismatch` and the row is skipped, never driven (D10).
 *
 * Rows that are never driven are decided first and never enter the replay:
 * a bound row already `connect` → `linked`; `quarantine` (no email,
 * duplicate lower(email) in one RP, no org, an email another Connect user
 * holds, inactive); a pilot RP → `linked`; a D18 deactivate-allowlist row →
 * `linked` (the driver deactivates it, never fences it).
 *
 * Ported-From: cadra-auth@4bf4f62:src/server/lib/migration-manifest.ts (the
 * classification half); the class rule from yobo-auth
 * src/server/lib/handoff-class-rule.ts (p77 STORY-008 / STORY-014).
 */

import { isSourceSystemKey, type HandoffClass, type RpSystem } from '../adapter/index.js'

/**
 * p77 STORY-041 — WHICH RPs the driver hands off and in what order is the
 * IdP's registry (`connect_source_systems.cutover_order`, read with
 * `fetchSourceSystems`), never a list in this SDK and never insertion order.
 *   order   the RPs that hold verifiers, in the election / driver order (D10, §6.3)
 *   pilots  RPs read for the person map and never fenced (they hold no verifier)
 */
export interface CutoverPlan {
  order: readonly RpSystem[]
  pilots: readonly RpSystem[]
}

export class CutoverPlanError extends Error {
  constructor(message: string) {
    super(`cutover plan: ${message}`)
    this.name = 'CutoverPlanError'
  }
}

/** Validate a plan (keys well-formed, no system twice). Returns it. */
export function assertCutoverPlan(plan: CutoverPlan | null | undefined): CutoverPlan {
  if (!plan || !Array.isArray(plan.order) || !Array.isArray(plan.pilots)) throw new CutoverPlanError('missing — take it from the IdP (fetchSourceSystems) or the arguments')
  const all = [...plan.order, ...plan.pilots]
  for (const s of all) if (!isSourceSystemKey(s)) throw new CutoverPlanError(`'${String(s)}' is not a source-system key`)
  if (new Set(all).size !== all.length) throw new CutoverPlanError('a system appears twice')
  return plan
}

export type ManifestClass = HandoffClass | 'linked' | 'quarantine'

export type QuarantineReason = 'no_org' | 'connect_email_taken' | 'no_email' | 'duplicate_email' | 'inactive' | 'unbound'

/** What the builder knows of one RP row. Digest, never a hash. */
export interface PersonRpRow {
  system: RpSystem
  sourceUserRef: string
  email: string | null
  /** The RP reports a bcrypt verifier (`passwordDigest` non-null and bcrypt-shaped on the RP side). */
  hasVerifier: boolean
  passwordDigest: string | null
  passwordRevision: string | null
  isActive: boolean
  credentialAuthority: 'local' | 'prepared' | 'fenced' | 'connect'
  connectSub: string | null
  orgMemberships: number
  /** `lower(email)` is shared with another row of the SAME RP. */
  duplicateEmail?: boolean
  /** A D18 deactivate-allowlist entry exists for this row: never driven, so never in the replay. */
  deactivate?: boolean
}

/** What the builder knows of the person at Connect. */
export interface PersonConnectFacts {
  /** Connect's user id for this email / binding, or null when unknown to Connect. */
  connectUserId: number | null
  /** `users.password IS NOT NULL` at Connect. */
  passwordPresent: boolean
  /** An `established_canonical` receipt exists (an earlier `import` activated). */
  establishedReceipt: boolean
  /** A staged row exists at Connect (an `import` prepared, not yet activated). */
  stagedRow?: boolean
  /** The email is held by a DIFFERENT Connect user than the one the rows bind to. */
  emailHeldByOther?: boolean
  /**
   * WHOSE the activated established_canonical receipts are. A row's own
   * receipt never counts as "elsewhere" (yobo-auth STORY-004/f). Omitted or
   * empty while `establishedReceipt` is true = owner unknown, which counts as
   * elsewhere for every row.
   */
  establishedBy?: readonly RpRowRef[]
  /** WHOSE the staged row is. Omitted while `stagedRow` is true = owner unknown (elsewhere for every row). */
  stagedBy?: RpRowRef | null
}

/** One RP row, as Connect keys staging and receipts. */
export interface RpRowRef {
  system: RpSystem
  sourceUserRef: string
}

/** The four facts Connect's ordered rule decides on (yobo-auth `HandoffClassFacts`). */
export interface HandoffClassFacts {
  /** The RP reports a bcrypt verifier for its row. */
  hasVerifier: boolean
  /** `users.password IS NOT NULL` at Connect. */
  passwordPresent: boolean
  /** A `staged_verifiers` row exists for the user that is NOT the caller's. */
  stagedElsewhere: boolean
  /** An activated `established_canonical` receipt exists for the user that is NOT the caller's. */
  establishedElsewhere: boolean
}

/**
 * Connect's ordered first-come rule — a port of yobo-auth's
 * `decideHandoffClass` (P77-20). Pure. The ONLY place this SDK decides a class.
 */
export function decideHandoffClass(facts: HandoffClassFacts): HandoffClass {
  if (facts.hasVerifier && (facts.stagedElsewhere || facts.establishedElsewhere)) return 'retire'
  if (facts.passwordPresent) return 'adopt'
  if (facts.hasVerifier) return 'import'
  return 'recover'
}

export interface ClassifiedRow {
  system: RpSystem
  sourceUserRef: string
  email: string | null
  class: ManifestClass
  reasons: string[]
  /** The row's digest (never the hash) and revision, for the report. */
  passwordDigest: string | null
  passwordRevision: string | null
}

export interface ClassifiedPerson {
  email: string
  canonicalSource: RpSystem | null
  rows: ClassifiedRow[]
}

function quarantineReasons(row: PersonRpRow, connect: PersonConnectFacts): QuarantineReason[] {
  const reasons: QuarantineReason[] = []
  if (!row.email) reasons.push('no_email')
  if (row.duplicateEmail) reasons.push('duplicate_email')
  if (row.orgMemberships === 0) reasons.push('no_org')
  if (connect.emailHeldByOther) reasons.push('connect_email_taken')
  if (!row.isActive) reasons.push('inactive')
  return reasons
}

type Base = Omit<ClassifiedRow, 'class' | 'reasons'>
const baseOf = (row: PersonRpRow): Base => ({ system: row.system, sourceUserRef: row.sourceUserRef, email: row.email, passwordDigest: row.passwordDigest, passwordRevision: row.passwordRevision })

/** The rows the driver never hands off, decided before any replay; null = a driven row. */
function undrivenRow(row: PersonRpRow, connect: PersonConnectFacts, plan: CutoverPlan): ClassifiedRow | null {
  const base = baseOf(row)
  if (row.credentialAuthority === 'connect') return { ...base, class: 'linked', reasons: ['already_connect'] }
  const q = quarantineReasons(row, connect)
  if (q.length > 0) return { ...base, class: 'quarantine', reasons: q }
  if (plan.pilots.includes(row.system)) return { ...base, class: 'linked', reasons: ['pilot_no_verifier'] }
  if (row.deactivate) return { ...base, class: 'linked', reasons: ['deactivate_allowlist'] }
  return null
}

/** `unknown` = a receipt / staged row whose owner the caller did not say: elsewhere for every row. */
type Owner = RpRowRef | 'unknown'
const isMine = (o: Owner, row: PersonRpRow): boolean => o !== 'unknown' && o.system === row.system && o.sourceUserRef === row.sourceUserRef

/** The Connect-side facts the replay advances. */
interface ReplayState {
  passwordPresent: boolean
  staged: Owner | null
  established: Owner[]
}

function initialState(connect: PersonConnectFacts): ReplayState {
  const established: Owner[] = connect.establishedBy && connect.establishedBy.length > 0 ? [...connect.establishedBy] : connect.establishedReceipt ? ['unknown'] : []
  const staged: Owner | null = connect.stagedBy ?? (connect.stagedRow ? 'unknown' : null)
  return { passwordPresent: connect.passwordPresent, staged, established }
}

function factReasons(f: HandoffClassFacts, cls: HandoffClass): string {
  switch (cls) {
    case 'retire':
      return f.establishedElsewhere ? 'receipt_exists' : 'staged_elsewhere'
    case 'adopt':
      return 'connect_password_present'
    case 'import':
      return 'canonical_source'
    case 'recover':
      return 'connect_password_null'
  }
}

function decideDriven(row: PersonRpRow, state: ReplayState): { row: ClassifiedRow; facts: HandoffClassFacts } {
  const facts: HandoffClassFacts = {
    hasVerifier: row.hasVerifier,
    passwordPresent: state.passwordPresent,
    stagedElsewhere: state.staged !== null && !isMine(state.staged, row),
    establishedElsewhere: state.established.some((o) => !isMine(o, row)),
  }
  const cls = decideHandoffClass(facts)
  return { facts, row: { ...baseOf(row), class: cls, reasons: [row.hasVerifier ? 'verifier_present' : 'no_verifier', factReasons(facts, cls)] } }
}

/**
 * One row's class, given the Connect facts AT THE MOMENT the driver reaches
 * it (no replay — `classifyPerson` advances the facts between rows).
 */
export function classifyRow(row: PersonRpRow, connect: PersonConnectFacts, plan: CutoverPlan): ClassifiedRow {
  return undrivenRow(row, connect, plan) ?? decideDriven(row, initialState(connect)).row
}

/** Classify one person's rows across every RP (the manifest's unit): the sequential replay. */
export function classifyPerson(email: string, rows: readonly PersonRpRow[], connect: PersonConnectFacts, plan: CutoverPlan): ClassifiedPerson {
  const ordered = [...rows].sort((a, b) => rank(plan, a.system) - rank(plan, b.system) || compareRefs(a.sourceUserRef, b.sourceUserRef))
  const state = initialState(connect)
  let canonicalSource: RpSystem | null = null
  const out: ClassifiedRow[] = []
  for (const row of ordered) {
    const fixed = undrivenRow(row, connect, plan)
    if (fixed) {
      out.push(fixed)
      continue
    }
    const decided = decideDriven(row, state).row
    if (decided.class === 'import') {
      // What this row's activation leaves behind for the next RP.
      canonicalSource = row.system
      state.passwordPresent = true
      state.staged = null
      state.established.push({ system: row.system, sourceUserRef: row.sourceUserRef })
    }
    out.push(decided)
  }
  return { email: email.toLowerCase(), canonicalSource, rows: out }
}

/** The row the replay predicts `import`, or null — an output of the rule, not a second rule. */
export function electCanonicalSource(rows: readonly PersonRpRow[], connect: PersonConnectFacts, plan: CutoverPlan): RpSystem | null {
  return classifyPerson('', rows, connect, plan).canonicalSource
}

function compareRefs(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

/** Driver order first, then the pilots; a system in neither sorts last. */
export function rank(plan: CutoverPlan, system: RpSystem): number {
  const i = plan.order.indexOf(system)
  if (i !== -1) return i
  const p = plan.pilots.indexOf(system)
  return plan.order.length + (p === -1 ? plan.pilots.length : p)
}

export const isHandoffManifestClass = (c: ManifestClass): c is HandoffClass => c === 'import' || c === 'retire' || c === 'adopt' || c === 'recover'

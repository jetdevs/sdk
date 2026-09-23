/**
 * p77 STORY-005 — `classify()`: the manifest's prediction of what Connect
 * will answer at `handoff/classify` for every (RP, person) row — D10 as
 * amended in round 5 (feedback P77-20), the same ORDERED rule Connect
 * applies, evaluated on the facts the manifest builder has.
 *
 * THE ELECTION. Per person, `canonicalSource` = the first RP in
 * `['crm', 'yobo']` holding a bcrypt verifier — for a person who has NO
 * `established_canonical` receipt at Connect and whose Connect password is
 * NULL. Otherwise null: Connect already holds a password (set by the person,
 * or established by an earlier run), so no RP hash becomes canonical.
 *
 * PER ROW, the same order Connect uses (receipt/staged row → password →
 * verifier → nothing), with the manifest's knowledge of the sequential run
 * standing in for "at the moment the driver reaches this RP":
 *
 *   verifier  ∧ this RP is the elected source                 → import
 *   verifier  ∧ (a source is elected elsewhere ∨ a receipt exists
 *               ∨ Connect holds a password)                   → retire
 *   no verifier ∧ (a source is elected ∨ Connect holds a password
 *               ∨ a receipt exists)                            → adopt
 *   no verifier ∧ nothing                                      → recover
 *
 * `retire` and `adopt` are operationally identical after prepare (nothing
 * staged, `activate-existing`); the distinction records provenance. Connect
 * decides the class at execution time and the driver asserts this prediction
 * as `expectedClass`; a stale manifest surfaces as `409 class_mismatch` and
 * the row is skipped, never driven (D10).
 *
 * `quarantine` (never driven) and `linked` (bound, no credential decision)
 * come before any of that: no org membership → `no_org`; an email another
 * Connect user holds → `connect_email_taken`; no email → `no_email`;
 * `lower(email)` shared by two rows of ONE RP → `duplicate_email` (§3.5
 * repairs it first); a bound row already `connect` → `linked`.
 *
 * Ported-From: cadra-auth@4bf4f62:src/server/lib/migration-manifest.ts (the
 * classification half, re-derived for D10's four classes over four RPs)
 */

import type { HandoffClass, RpSystem } from '../adapter/index.js'

/** The RPs that hold verifiers, in the election order (D10, §6.3). */
export const CUTOVER_RP_ORDER: readonly RpSystem[] = ['crm', 'yobo']
/** RPs read for the person map and never fenced (they hold no verifier). */
export const PILOT_RPS: readonly RpSystem[] = ['commerce', 'superhost']

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

/** The elected source, or null (D10). */
export function electCanonicalSource(rows: readonly PersonRpRow[], connect: PersonConnectFacts): RpSystem | null {
  if (connect.passwordPresent || connect.establishedReceipt || connect.stagedRow) return null
  for (const system of CUTOVER_RP_ORDER) {
    const row = rows.find((r) => r.system === system)
    if (row && row.hasVerifier && row.credentialAuthority === 'local' && row.isActive) return system
  }
  return null
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

/** One row's class given the election. Exported so STORY-014's decision-table test imports the very function. */
export function classifyRow(row: PersonRpRow, connect: PersonConnectFacts, canonicalSource: RpSystem | null): ClassifiedRow {
  const base = { system: row.system, sourceUserRef: row.sourceUserRef, email: row.email, passwordDigest: row.passwordDigest, passwordRevision: row.passwordRevision }
  if (row.credentialAuthority === 'connect') return { ...base, class: 'linked', reasons: ['already_connect'] }
  const q = quarantineReasons(row, connect)
  if (q.length > 0) return { ...base, class: 'quarantine', reasons: q }
  if (PILOT_RPS.includes(row.system)) return { ...base, class: 'linked', reasons: ['pilot_no_verifier'] }
  const receipt = connect.establishedReceipt || Boolean(connect.stagedRow)
  if (row.hasVerifier) {
    if (canonicalSource === row.system) return { ...base, class: 'import', reasons: ['verifier_present', 'canonical_source'] }
    const why = receipt ? 'receipt_exists' : connect.passwordPresent ? 'connect_password_present' : `source_${canonicalSource}`
    return { ...base, class: 'retire', reasons: ['verifier_present', why] }
  }
  if (canonicalSource !== null || connect.passwordPresent || receipt) {
    const why = receipt ? 'receipt_exists' : connect.passwordPresent ? 'connect_password_present' : `source_${canonicalSource}`
    return { ...base, class: 'adopt', reasons: ['no_verifier', why] }
  }
  return { ...base, class: 'recover', reasons: ['no_verifier', 'connect_password_null'] }
}

/** Classify one person's rows across every RP (the manifest's unit). */
export function classifyPerson(email: string, rows: readonly PersonRpRow[], connect: PersonConnectFacts): ClassifiedPerson {
  const canonicalSource = electCanonicalSource(rows, connect)
  const ordered = [...rows].sort((a, b) => rank(a.system) - rank(b.system))
  return { email: email.toLowerCase(), canonicalSource, rows: ordered.map((r) => classifyRow(r, connect, canonicalSource)) }
}

function rank(system: RpSystem): number {
  const i = CUTOVER_RP_ORDER.indexOf(system)
  return i === -1 ? CUTOVER_RP_ORDER.length + PILOT_RPS.indexOf(system) : i
}

export const isHandoffManifestClass = (c: ManifestClass): c is HandoffClass => c === 'import' || c === 'retire' || c === 'adopt' || c === 'recover'

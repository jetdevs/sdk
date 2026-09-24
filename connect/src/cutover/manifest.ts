/**
 * p77 STORY-005 — the ESTATE MANIFEST: build, validate, digest, approve
 * (specs.md §5.3, §6.3, D10; the §7.3 gate of p79 carried over).
 *
 * THREE PROGRAMS, DELIBERATELY. (1) `buildEstateManifest` classifies the
 * inventories (digests only) into an UNAPPROVED manifest; (2) a named
 * person approves it (`approve.ts`) — the approval is a DIGEST over the rows,
 * so editing one row afterwards invalidates it; (3) `EstateCutover --execute`
 * refuses a manifest whose approval no longer fits its rows. A boolean
 * approves the act of running; a digest approves the rows that were read.
 *
 * NEVER A VERIFIER. Rows carry the RP's digest and revision (the fence's
 * compare-and-set anchor) and nothing else about the password. The RP posts
 * its own hash to Connect inside `prepare`; no verifier crosses the driver.
 *
 * Ported-From: cadra-auth@4bf4f62:src/server/lib/migration-manifest.ts
 *   (the manifest / digest / approval half; rows re-keyed per RP)
 */

import { createHash } from 'node:crypto'

import type { RpSystem } from '../adapter/index.js'
import type { ConnectEnv } from '../next-auth/internal-routes.js'
import type { InventoryRowAnswer } from '../next-auth/internal-routes.js'
import { assertCutoverPlan, classifyPerson, CutoverPlanError, type ClassifiedRow, type CutoverPlan, type ManifestClass, type PersonConnectFacts, type PersonRpRow } from './classify.js'

export interface ManifestApproval {
  approved: true
  approvedBy: string
  approvedAt: string
  manifestDigest: string
  note?: string
}

export interface EstateManifestRow extends ClassifiedRow {
  /** The person this row belongs to (`lower(email)`), the manifest's grouping key. */
  person: string
  canonicalSource: RpSystem | null
  /** An allowlist `deactivate` entry exists for this env + row (D18): the driver deactivates it first and never fences it. */
  deactivate: boolean
  /** A system identity (§7): listed, never moved. */
  systemIdentity: boolean
}

export interface EstateManifest {
  version: 2
  generatedAt: string
  env: ConnectEnv
  connectIssuer: string
  /** The RPs the inventory came from, in the election order. */
  rps: RpSystem[]
  /**
   * p77 STORY-041 — the driver order + pilots the manifest was built with (the
   * IdP registry's `cutover_order`). SIGNED with the rows: the approval covers
   * the order the driver will run, and `EstateCutover` reads it from here.
   */
  plan: CutoverPlan
  counts: Record<ManifestClass, number> & { system: number; deactivate: number }
  persons: Array<{ email: string; canonicalSource: RpSystem | null; rows: number }>
  rows: EstateManifestRow[]
  approval: ManifestApproval | null
}

export interface BuildEstateManifestInput {
  env: ConnectEnv
  connectIssuer: string
  /** The IdP registry's driver order + pilots (`fetchSourceSystems().plan`). An inventory of a system in neither is refused. */
  plan: CutoverPlan
  /** Every RP's inventory (the `inventory` op, all pages). */
  inventories: Partial<Record<RpSystem, readonly InventoryRowAnswer[]>>
  /** What Connect knows per `lower(email)` — from Connect's own `users` and receipts (the driver runs in yobo-auth). */
  connectFacts: (email: string, subs: string[]) => PersonConnectFacts
  /** Emails to narrow to (`--only`), lowercased. Empty = everyone. */
  only?: readonly string[]
  generatedAt?: string
}

/** Deterministic JSON: object keys sorted at every depth. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

/** The digest an approval signs: everything but `approval` itself. */
export function computeManifestDigest(manifest: EstateManifest): string {
  const { approval: _a, ...signed } = manifest
  return createHash('sha256').update(canonicalJson(signed), 'utf8').digest('hex')
}

const BCRYPT_RE = /^\$2[aby]\$\d\d\$/

export function buildEstateManifest(input: BuildEstateManifestInput): EstateManifest {
  const onlySet = new Set((input.only ?? []).map((e) => e.toLowerCase()))
  const byPerson = new Map<string, PersonRpRow[]>()
  const systemRows: EstateManifestRow[] = []
  const plan = assertCutoverPlan(input.plan)
  for (const s of Object.keys(input.inventories)) {
    if (!plan.order.includes(s) && !plan.pilots.includes(s)) throw new CutoverPlanError(`inventory for '${s}', which the plan neither drives nor reads as a pilot`)
  }
  const rps: RpSystem[] = [...plan.order, ...plan.pilots].filter((s) => input.inventories[s] !== undefined)

  for (const system of rps) {
    const rows = input.inventories[system] ?? []
    // Duplicate lower(email) inside ONE RP is a §3.5 repair, not a handoff.
    const emailCounts = new Map<string, number>()
    for (const r of rows) if (r.email) emailCounts.set(r.email, (emailCounts.get(r.email) ?? 0) + 1)
    for (const r of rows) {
      if (r.passwordDigest && BCRYPT_RE.test(r.passwordDigest)) throw new Error(`${system} inventory carried a verifier for user ${r.id}; refusing to build a manifest from it`)
      const email = r.email?.toLowerCase() ?? null
      if (onlySet.size > 0 && (!email || !onlySet.has(email))) continue
      const row: PersonRpRow = {
        system,
        sourceUserRef: String(r.id),
        email,
        hasVerifier: r.passwordDigest !== null,
        passwordDigest: r.passwordDigest,
        passwordRevision: r.passwordRevision,
        isActive: r.isActive,
        credentialAuthority: r.credentialAuthority,
        connectSub: r.connectSub,
        orgMemberships: r.orgMemberships.length,
        duplicateEmail: email ? (emailCounts.get(email) ?? 0) > 1 : false,
        deactivate: r.deactivate,
      }
      if (r.system) {
        systemRows.push({ ...row, class: 'linked', reasons: ['system_identity'], person: email ?? `#${system}:${r.id}`, canonicalSource: null, deactivate: r.deactivate, systemIdentity: true })
        continue
      }
      if (!email) {
        // Phone-only (yobo, D17) or an email-less row: classify alone, never counted.
        const key = `#${system}:${r.id}`
        byPerson.set(key, [row])
        continue
      }
      const bucket = byPerson.get(email)
      if (bucket) bucket.push(row)
      else byPerson.set(email, [row])
    }
  }

  const persons: EstateManifest['persons'] = []
  const out: EstateManifestRow[] = []
  const deactivated = new Set(
    rps.flatMap((s) => (input.inventories[s] ?? []).filter((r) => r.deactivate).map((r) => `${s}:${r.id}`)),
  )
  for (const [email, rows] of [...byPerson.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const subs = [...new Set(rows.map((r) => r.connectSub).filter((s): s is string => !!s))]
    const facts = email.startsWith('#') ? { connectUserId: null, passwordPresent: false, establishedReceipt: false } : input.connectFacts(email, subs)
    const person = classifyPerson(email, rows, facts, plan)
    persons.push({ email, canonicalSource: person.canonicalSource, rows: person.rows.length })
    for (const r of person.rows) {
      out.push({ ...r, person: email, canonicalSource: person.canonicalSource, deactivate: deactivated.has(`${r.system}:${r.sourceUserRef}`), systemIdentity: false })
    }
  }
  out.push(...systemRows)

  const counts: EstateManifest['counts'] = { import: 0, retire: 0, adopt: 0, recover: 0, linked: 0, quarantine: 0, system: 0, deactivate: 0 }
  for (const r of out) {
    counts[r.class] += 1
    if (r.systemIdentity) counts.system += 1
    if (r.deactivate) counts.deactivate += 1
  }
  return { version: 2, generatedAt: input.generatedAt ?? new Date().toISOString(), env: input.env, connectIssuer: input.connectIssuer.replace(/\/+$/, ''), rps, plan: { order: [...plan.order], pilots: [...plan.pilots] }, counts, persons, rows: out, approval: null }
}

// ---------------------------------------------------------------------------
// Validation and the approval gate
// ---------------------------------------------------------------------------

export class ManifestInvalidError extends Error {
  constructor(public readonly detail: string) {
    super(`not an estate manifest: ${detail}`)
    this.name = 'ManifestInvalidError'
  }
}

export class ManifestNotApprovedError extends Error {
  constructor(public readonly detail: string) {
    super(`refusing to write: ${detail} (specs.md §6.3 — approve the manifest by name first)`)
    this.name = 'ManifestNotApprovedError'
  }
}

/** Structural validation of a manifest read from disk. Throws `ManifestInvalidError`. */
export function validateManifest(value: unknown): EstateManifest {
  const m = value as EstateManifest
  if (!m || typeof m !== 'object') throw new ManifestInvalidError('not an object')
  if (m.version !== 2) throw new ManifestInvalidError(`version ${String((m as { version?: unknown }).version)} (expected 2)`)
  if (!Array.isArray(m.rows)) throw new ManifestInvalidError('no rows')
  if (typeof m.connectIssuer !== 'string' || !m.connectIssuer) throw new ManifestInvalidError('no connectIssuer')
  if (!['local', 'dev', 'prod'].includes(m.env)) throw new ManifestInvalidError(`env ${String(m.env)}`)
  try {
    assertCutoverPlan(m.plan)
  } catch (err) {
    throw new ManifestInvalidError((err as Error).message)
  }
  for (const r of m.rows) {
    if (typeof r.sourceUserRef !== 'string' || typeof r.system !== 'string') throw new ManifestInvalidError('a row lacks system/sourceUserRef')
    if (r.passwordDigest && BCRYPT_RE.test(r.passwordDigest)) throw new ManifestInvalidError(`row ${r.system}:${r.sourceUserRef} carries a verifier`)
  }
  return m
}

export function isApproved(m: EstateManifest): boolean {
  return m.approval?.approved === true && typeof m.approval.manifestDigest === 'string' && m.approval.manifestDigest.length > 0
}

/** Attach an approval — a signature on the rows as they stand. */
export function approveManifest(manifest: EstateManifest, input: { approvedBy: string; approvedAt?: string; note?: string }): EstateManifest {
  if (!input.approvedBy || !input.approvedBy.trim()) throw new Error('an approval must name who approved it')
  const unsigned: EstateManifest = { ...manifest, approval: null }
  return {
    ...unsigned,
    approval: { approved: true, approvedBy: input.approvedBy.trim(), approvedAt: input.approvedAt ?? new Date().toISOString(), manifestDigest: computeManifestDigest(unsigned), ...(input.note ? { note: input.note } : {}) },
  }
}

/** Throws unless approved AND the approval still fits the rows. Returns the digest. */
export function assertManifestApproved(manifest: EstateManifest): string {
  const a = manifest.approval
  if (!a) throw new ManifestNotApprovedError('the manifest carries no approval')
  if (a.approved !== true) throw new ManifestNotApprovedError('the approval is not affirmative')
  if (!a.approvedBy?.trim()) throw new ManifestNotApprovedError('the approval names nobody')
  const actual = computeManifestDigest(manifest)
  if (actual !== a.manifestDigest) {
    throw new ManifestNotApprovedError(`the manifest changed after approval — approved ${a.manifestDigest.slice(0, 12)}…, now ${actual.slice(0, 12)}…. Re-review and re-approve`)
  }
  return actual
}

/** The rows the driver acts on for one RP, in manifest order: handoff classes only, never system/quarantine/linked. */
export function actionableRows(manifest: EstateManifest, system: RpSystem): EstateManifestRow[] {
  return manifest.rows.filter((r) => r.system === system && !r.systemIdentity && !r.deactivate && (r.class === 'import' || r.class === 'retire' || r.class === 'adopt' || r.class === 'recover'))
}

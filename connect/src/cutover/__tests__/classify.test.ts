/**
 * p77 STORY-005 — `classify()` (D10 as amended, AC3), the manifest's digest
 * and approval gate, and the argument guards. Pure.
 */
import { describe, expect, it } from 'vitest'

import { assertEstateGuards, CutoverRefusedError, CutoverUsageError, parseEstateArgs } from '../args.js'
import { classifyPerson, classifyRow, electCanonicalSource, type CutoverPlan, type PersonConnectFacts, type PersonRpRow } from '../classify.js'

// p77 STORY-041: the plan the IdP registry answers (0025 seeds crm=1, yobo=2).
const PLAN: CutoverPlan = { order: ['crm', 'yobo'], pilots: ['commerce', 'superhost'] }
import { actionableRows, approveManifest, assertManifestApproved, buildEstateManifest, computeManifestDigest, ManifestNotApprovedError, validateManifest } from '../manifest.js'
import { approveWithReview } from '../approve.js'
import type { InventoryRowAnswer } from '../../next-auth/internal-routes.js'

const row = (system: PersonRpRow['system'], id: number, over: Partial<PersonRpRow> = {}): PersonRpRow => ({
  system,
  sourceUserRef: String(id),
  email: 'sean@example.test',
  hasVerifier: false,
  passwordDigest: null,
  passwordRevision: '2026-09-23T00:00:00.000Z',
  isActive: true,
  credentialAuthority: 'local',
  connectSub: '101',
  orgMemberships: 1,
  ...over,
})
const hashed = (system: PersonRpRow['system'], id: number, digest: string, over: Partial<PersonRpRow> = {}) => row(system, id, { hasVerifier: true, passwordDigest: digest, ...over })
const facts = (over: Partial<PersonConnectFacts> = {}): PersonConnectFacts => ({ connectUserId: 101, passwordPresent: false, establishedReceipt: false, ...over })

describe('classify — D10 as amended (AC3)', () => {
  it('AC3: hashes in crm and yobo, Connect NULL, no receipt → canonicalSource crm; crm import, yobo retire', () => {
    const p = classifyPerson('sean@example.test', [hashed('yobo', 7, 'b'.repeat(64)), hashed('crm', 1, 'a'.repeat(64))], facts(), PLAN)
    expect(p.canonicalSource).toBe('crm')
    expect(p.rows.map((r) => [r.system, r.class])).toEqual([
      ['crm', 'import'],
      ['yobo', 'retire'],
    ])
    expect(p.rows[1]!.reasons).toEqual(['verifier_present', 'source_crm'])
  })

  it('AC3: Connect holds a password and no receipt → canonicalSource null, both adopt (with or without verifiers)', () => {
    const p = classifyPerson('sean@example.test', [hashed('crm', 1, 'a'.repeat(64)), row('yobo', 7)], facts({ passwordPresent: true }), PLAN)
    expect(p.canonicalSource).toBeNull()
    // A verifier next to a Connect-set password is retired without staging (rule 2 at Connect: `adopt`... the manifest calls the
    // verifier-carrying row `retire` by provenance; both are activate-existing and stage nothing).
    expect(p.rows.map((r) => [r.system, r.class])).toEqual([
      ['crm', 'retire'],
      ['yobo', 'adopt'],
    ])
    const both = classifyPerson('sean@example.test', [row('crm', 1), row('yobo', 7)], facts({ passwordPresent: true }), PLAN)
    expect(both.rows.map((r) => r.class)).toEqual(['adopt', 'adopt'])
  })

  it('AC3: crm already established (a receipt at Connect) → canonicalSource null; a yobo verifier row is retire, a yobo verifier-less row is adopt', () => {
    const withHash = classifyPerson('sean@example.test', [row('crm', 1, { credentialAuthority: 'connect' }), hashed('yobo', 7, 'b'.repeat(64))], facts({ establishedReceipt: true, passwordPresent: true }), PLAN)
    expect(withHash.canonicalSource).toBeNull()
    expect(withHash.rows.map((r) => [r.system, r.class])).toEqual([
      ['crm', 'linked'],
      ['yobo', 'retire'],
    ])
    expect(withHash.rows[1]!.reasons).toContain('receipt_exists')
    const noHash = classifyPerson('sean@example.test', [row('yobo', 7)], facts({ establishedReceipt: true, passwordPresent: true }), PLAN)
    expect(noHash.rows[0]!.class).toBe('adopt')
  })

  it('AC3: no hash anywhere and Connect NULL → recover; a verifier-less earlier crm row next to a hash-holding yobo sibling → crm adopt, yobo import (source yobo)', () => {
    expect(classifyPerson('sean@example.test', [row('crm', 1), row('yobo', 7)], facts(), PLAN).rows.map((r) => r.class)).toEqual(['recover', 'recover'])
    const p = classifyPerson('sean@example.test', [row('crm', 1), hashed('yobo', 7, 'b'.repeat(64))], facts(), PLAN)
    expect(p.canonicalSource).toBe('yobo')
    expect(p.rows.map((r) => [r.system, r.class])).toEqual([
      ['crm', 'adopt'],
      ['yobo', 'import'],
    ])
  })

  it('quarantine and linked come first: email held by another Connect user → connect_email_taken; no org → no_org; a duplicate lower(email) in one RP; an inactive row; a connect row is linked; a pilot row is linked and never elected', () => {
    expect(classifyRow(hashed('crm', 1, 'a'.repeat(64)), facts({ emailHeldByOther: true }), 'crm', PLAN)).toMatchObject({ class: 'quarantine', reasons: ['connect_email_taken'] })
    expect(classifyRow(row('crm', 1, { orgMemberships: 0 }), facts(), null, PLAN)).toMatchObject({ class: 'quarantine', reasons: ['no_org'] })
    expect(classifyRow(row('crm', 1, { duplicateEmail: true }), facts(), null, PLAN)).toMatchObject({ class: 'quarantine', reasons: ['duplicate_email'] })
    expect(classifyRow(row('crm', 1, { isActive: false }), facts(), null, PLAN).reasons).toContain('inactive')
    expect(classifyRow(row('crm', 1, { credentialAuthority: 'connect' }), facts(), null, PLAN)).toMatchObject({ class: 'linked' })
    expect(classifyRow(hashed('superhost', 3, 'c'.repeat(64)), facts(), null, PLAN)).toMatchObject({ class: 'linked', reasons: ['pilot_no_verifier'] })
    expect(electCanonicalSource([hashed('superhost', 3, 'c'.repeat(64)), hashed('yobo', 7, 'b'.repeat(64))], facts(), PLAN)).toBe('yobo')
    expect(electCanonicalSource([hashed('crm', 1, 'a'.repeat(64))], facts({ stagedRow: true }), PLAN)).toBeNull()
    expect(electCanonicalSource([hashed('crm', 1, 'a'.repeat(64), { isActive: false })], facts(), PLAN)).toBeNull()
  })
})

describe('manifest — build, digest, approval', () => {
  const inv = (id: number, over: Partial<InventoryRowAnswer> = {}): InventoryRowAnswer => ({
    id,
    uuid: null,
    email: `u${id}@example.test`,
    passwordDigest: null,
    passwordRevision: '2026-09-23T00:00:00.000Z',
    isActive: true,
    credentialAuthority: 'local',
    credentialVersion: 1,
    connectIssuer: 'https://idp.test',
    connectSub: String(100 + id),
    connectMappedAt: null,
    googleLinks: [],
    orgMemberships: [{ orgId: 1, orgUuid: null, role: 'member' }],
    system: false,
    deactivate: false,
    ...over,
  })

  it('groups rows per person across RPs, elects per person, lists system and deactivate rows, refuses a verifier in an inventory; the digest signs the rows and an edit after approval is refused', () => {
    const m = buildEstateManifest({
      env: 'local',
      connectIssuer: 'https://idp.test/',
      plan: PLAN,
      inventories: {
        crm: [inv(1, { passwordDigest: 'a'.repeat(64) }), inv(9, { email: 'p77-probe@probe.invalid', system: true }), inv(3, { email: 'fb@example.test', deactivate: true })],
        yobo: [inv(1, { email: 'u1@example.test', passwordDigest: 'b'.repeat(64) }), inv(2, { email: null })],
      },
      connectFacts: () => ({ connectUserId: 1, passwordPresent: false, establishedReceipt: false }),
      generatedAt: '2026-09-23T10:00:00.000Z',
    })
    expect(m.connectIssuer).toBe('https://idp.test')
    expect(m.rps).toEqual(['crm', 'yobo'])
    expect(m.persons.find((p) => p.email === 'u1@example.test')).toEqual({ email: 'u1@example.test', canonicalSource: 'crm', rows: 2 })
    expect(m.rows.filter((r) => r.person === 'u1@example.test').map((r) => [r.system, r.class])).toEqual([
      ['crm', 'import'],
      ['yobo', 'retire'],
    ])
    expect(m.rows.find((r) => r.systemIdentity)).toMatchObject({ system: 'crm', sourceUserRef: '9', class: 'linked' })
    expect(m.rows.find((r) => r.deactivate)).toMatchObject({ system: 'crm', sourceUserRef: '3' })
    expect(m.counts).toMatchObject({ import: 1, retire: 1, recover: 1, quarantine: 1, system: 1, deactivate: 1 })
    expect(m.rows.find((r) => r.system === 'yobo' && r.sourceUserRef === '2')).toMatchObject({ class: 'quarantine', reasons: ['no_email'] })
    expect(actionableRows(m, 'crm').map((r) => r.sourceUserRef)).toEqual(['1'])
    expect(JSON.stringify(m)).not.toMatch(/\$2[aby]\$/)
    expect(() => buildEstateManifest({ env: 'local', connectIssuer: 'x', plan: PLAN, inventories: { crm: [inv(1, { passwordDigest: '$2b$10$abc' })] }, connectFacts: () => ({ connectUserId: null, passwordPresent: false, establishedReceipt: false }) })).toThrow(/verifier/)

    expect(() => assertManifestApproved(m)).toThrow(ManifestNotApprovedError)
    const { manifest: approved, lines } = approveWithReview(m, { approvedBy: 'Sean Liao', approvedAt: '2026-09-23T11:00:00.000Z' })
    expect(lines.some((l) => l.includes('ELECTED canonical sources'))).toBe(true)
    expect(assertManifestApproved(approved)).toBe(computeManifestDigest(approved))
    const edited = { ...approved, rows: approved.rows.map((r) => (r.sourceUserRef === '1' && r.system === 'yobo' ? { ...r, class: 'import' as const } : r)) }
    expect(() => assertManifestApproved(edited)).toThrow(/changed after approval/)
    expect(() => approveManifest(m, { approvedBy: ' ' })).toThrow()
    expect(validateManifest(JSON.parse(JSON.stringify(approved))).rows.length).toBe(m.rows.length)
    expect(() => validateManifest({ version: 1 })).toThrow(/version/)
  })
})

describe('args and guards', () => {
  it('parses the estate commands; --env local refuses non-loopback hosts; dev/prod --execute needs CUTOVER_CONFIRM and refuses loopback', () => {
    const a = parseEstateArgs(['--env', 'local', '--rp', 'crm=http://127.0.0.1:3001', '--rp', 'yobo=http://localhost:3002', '--execute', '--only', 'A@x.test,b@x.test', '--manifest', 'm.json'])
    expect(a).toMatchObject({ env: 'local', execute: true, rps: { crm: 'http://127.0.0.1:3001', yobo: 'http://localhost:3002' }, only: ['a@x.test', 'b@x.test'], manifestPath: 'm.json' })
    expect(parseEstateArgs(['off', '--env', 'dev', '--abort'])).toMatchObject({ command: 'off', abort: true })
    expect(() => parseEstateArgs(['--rp', 'slides=http://x'])).toThrow(CutoverUsageError)
    expect(() => parseEstateArgs(['--env', 'local', '--execute', '--dry-run'])).toThrow(CutoverUsageError)
    expect(() => parseEstateArgs(['--execute'])).toThrow(/--env is required/)
    assertEstateGuards(a, { OIDC_ISSUER: 'http://127.0.0.1:3997' })
    expect(() => assertEstateGuards(a, { OIDC_ISSUER: 'https://auth-dev.yobolabs.ai' })).toThrow(CutoverRefusedError)
    const dev = parseEstateArgs(['--env', 'dev', '--rp', 'crm=https://crm-dev.yobolabs.ai', '--execute'])
    expect(() => assertEstateGuards(dev, { OIDC_ISSUER: 'https://auth-dev.yobolabs.ai' })).toThrow(/CUTOVER_CONFIRM=dev/)
    assertEstateGuards(dev, { OIDC_ISSUER: 'https://auth-dev.yobolabs.ai', CUTOVER_CONFIRM: 'dev' })
    expect(() => assertEstateGuards(dev, { OIDC_ISSUER: 'http://localhost:3997', CUTOVER_CONFIRM: 'dev' })).toThrow(/loopback/)
  })
})

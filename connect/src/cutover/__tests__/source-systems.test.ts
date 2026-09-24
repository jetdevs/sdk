/**
 * p77 STORY-041 — the SDK never hard-codes the list of source systems or the
 * D10 driver order: a system is a runtime-validated string, and the order is
 * the IdP registry's (`fetchSourceSystems`) or the caller's argument.
 *
 * The HTTP half runs against a REAL loopback server answering the IdP route's
 * exact shape (yobo-auth `GET /api/internal/connect/source-systems`, proven
 * against the real route in yobo-auth p77-source-system-registry.test.ts).
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isRpSystem, isSourceSystemKey, type KnownRpSystem, type KnownSourceSystem, type RpSystem } from '../../adapter/index.js'
import type { SourceSystem } from '../../server/provisioning.js'
import { parseEstateArgs } from '../args.js'
import { classifyPerson, CutoverPlanError, electCanonicalSource, type CutoverPlan, type PersonRpRow } from '../classify.js'
import { approveManifest, buildEstateManifest, computeManifestDigest, validateManifest, ManifestInvalidError } from '../manifest.js'
import { fetchSourceSystems, parseSourceSystemsAnswer, SOURCE_SYSTEMS_ROUTE_PATH, SourceSystemsFetchError } from '../source-systems.js'

describe('source systems are runtime-validated strings', () => {
  it('isSourceSystemKey is the registry key syntax; isRpSystem is its deprecated alias (no list)', () => {
    for (const k of ['crm', 'yobo', 'acme', 'acme-co', 'a1_b']) expect(isSourceSystemKey(k), k).toBe(true)
    for (const k of ['', 'a', 'Acme', '1acme', 'acme!', 'x'.repeat(33), null, 3, undefined]) expect(isSourceSystemKey(k), String(k)).toBe(false)
    expect(isRpSystem('acme')).toBe(true)
    expect(isRpSystem('Nope')).toBe(false)
  })

  it('the deprecated literal unions still type-check where an RP annotated with them (KnownSourceSystem alias holds)', () => {
    const legacy: KnownRpSystem = 'crm'
    const legacySource: KnownSourceSystem = 'slides'
    const widened: RpSystem = legacy
    const source: SourceSystem = legacySource
    const acme: SourceSystem = 'acme'
    expect([widened, source, acme]).toEqual(['crm', 'slides', 'acme'])
  })

  it('--rp accepts any source-system key (acme joins with no SDK release) and refuses a malformed one', () => {
    const a = parseEstateArgs(['--env', 'local', '--rp', 'acme=http://127.0.0.1:4700', '--manifest', 'm.json'])
    expect(a.rps).toEqual({ acme: 'http://127.0.0.1:4700' })
    expect(() => parseEstateArgs(['--env', 'local', '--rp', 'Acme!=http://x', '--manifest', 'm.json'])).toThrow(/source-system key/)
  })
})

const row = (system: string, id: number, over: Partial<PersonRpRow> = {}): PersonRpRow => ({
  system,
  sourceUserRef: String(id),
  email: 'p@example.test',
  hasVerifier: true,
  passwordDigest: 'd'.repeat(64),
  passwordRevision: 'r1',
  isActive: true,
  credentialAuthority: 'local',
  orgMemberships: 1,
  duplicateEmail: false,
  connectSub: null,
  ...over,
})
const facts = { connectUserId: 1, passwordPresent: false, establishedReceipt: false }

describe('the driver order is the plan, never a built-in list', () => {
  it('the election follows plan.order: the same rows elect crm under one plan and acme under another', () => {
    const rows = [row('crm', 1), row('acme', 2)]
    expect(electCanonicalSource(rows, facts, { order: ['crm', 'acme'], pilots: [] })).toBe('crm')
    expect(electCanonicalSource(rows, facts, { order: ['acme', 'crm'], pilots: [] })).toBe('acme')
    const p = classifyPerson('p@example.test', rows, facts, { order: ['acme', 'crm'], pilots: [] })
    expect(p.rows.map((r) => [r.system, r.class])).toEqual([
      ['acme', 'import'],
      ['crm', 'retire'],
    ])
    // A pilot is read, never fenced — whatever its name.
    expect(classifyPerson('p@example.test', rows, facts, { order: ['crm'], pilots: ['acme'] }).rows.find((r) => r.system === 'acme')).toMatchObject({
      class: 'linked',
      reasons: ['pilot_no_verifier'],
    })
  })

  const inv = (id: number, over: Record<string, unknown> = {}) =>
    ({
      id,
      email: `u${id}@example.test`,
      passwordDigest: null,
      passwordRevision: null,
      isActive: true,
      credentialAuthority: 'local',
      connectIssuer: null,
      connectSub: null,
      connectMappedAt: null,
      googleLinks: [],
      orgMemberships: [{ orgId: 1, orgUuid: null, role: 'member' }],
      system: false,
      deactivate: false,
      ...over,
    }) as any

  it('the manifest records the plan and SIGNS it; an inventory outside the plan is refused; a manifest without a plan is invalid', () => {
    const plan: CutoverPlan = { order: ['acme'], pilots: ['crm'] }
    const m = buildEstateManifest({ env: 'local', connectIssuer: 'https://idp.test', plan, inventories: { acme: [inv(1)], crm: [inv(2)] }, connectFacts: () => facts, generatedAt: '2026-09-24T00:00:00.000Z' })
    expect(m.plan).toEqual({ order: ['acme'], pilots: ['crm'] })
    expect(m.rps).toEqual(['acme', 'crm'])
    const approved = approveManifest(m, { approvedBy: 'Sean Liao', approvedAt: '2026-09-24T00:01:00.000Z' })
    expect(computeManifestDigest({ ...approved, plan: { order: ['crm'], pilots: ['acme'] } })).not.toBe(approved.approval!.manifestDigest)
    expect(() => buildEstateManifest({ env: 'local', connectIssuer: 'x', plan, inventories: { ghost: [inv(3)] }, connectFacts: () => facts })).toThrow(CutoverPlanError)
    const { plan: _p, ...noPlan } = m
    expect(() => validateManifest(noPlan)).toThrow(ManifestInvalidError)
    expect(() => buildEstateManifest({ env: 'local', connectIssuer: 'x', plan: { order: ['crm'], pilots: ['crm'] }, inventories: {}, connectFacts: () => facts })).toThrow(/twice/)
  })
})

describe('fetchSourceSystems — the IdP answers the list and the order', () => {
  const ANSWER = {
    systems: [
      { key: 'acme', displayName: 'Acme Co', kind: 'password_rp', enabled: true, cutoverOrder: null },
      { key: 'crm', displayName: 'Yobo CRM', kind: 'password_rp', enabled: true, cutoverOrder: 1 },
      { key: 'yobo', displayName: 'Yobo Merchant', kind: 'password_rp', enabled: true, cutoverOrder: 2 },
      { key: 'slides', displayName: 'Yobo Slides', kind: 'identity_only', enabled: true, cutoverOrder: null },
      { key: 'old', displayName: 'Old', kind: 'password_rp', enabled: false, cutoverOrder: null },
    ],
    plan: { order: ['crm', 'yobo'], pilots: ['acme'] },
  }
  let server: http.Server
  let issuer = ''
  const seen: Array<{ url: string; key: string | undefined; method: string }> = []
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ url: req.url ?? '', key: req.headers['x-internal-api-key'] as string | undefined, method: req.method ?? '' })
      const ok = req.headers['x-internal-api-key'] === 'cron-key'
      res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' })
      res.end(JSON.stringify(ok ? ANSWER : { error: 'unauthorized' }))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('GETs the route with the key and returns systems + plan', async () => {
    const a = await fetchSourceSystems({ issuer, key: 'cron-key' })
    expect(seen.at(-1)).toEqual({ url: SOURCE_SYSTEMS_ROUTE_PATH, key: 'cron-key', method: 'GET' })
    expect(a.plan).toEqual({ order: ['crm', 'yobo'], pilots: ['acme'] })
    expect(a.systems.map((s) => s.key)).toEqual(['acme', 'crm', 'yobo', 'slides', 'old'])
  })

  it('a refused key is an error, never a fallback list', async () => {
    await expect(fetchSourceSystems({ issuer, key: 'rp-key' })).rejects.toMatchObject({ name: 'SourceSystemsFetchError', status: 401 })
  })

  it('refuses a malformed answer: a bad key, or a plan naming a disabled / identity-only system', () => {
    expect(() => parseSourceSystemsAnswer({ ...ANSWER, systems: [{ ...ANSWER.systems[0], key: 'Bad Key' }] })).toThrow(SourceSystemsFetchError)
    expect(() => parseSourceSystemsAnswer({ ...ANSWER, plan: { order: ['crm'], pilots: ['old'] } })).toThrow(/not an enabled password_rp/)
    expect(() => parseSourceSystemsAnswer({ ...ANSWER, plan: { order: ['slides'], pilots: [] } })).toThrow(/not an enabled password_rp/)
    expect(() => parseSourceSystemsAnswer({ systems: ANSWER.systems })).toThrow(SourceSystemsFetchError)
  })
})

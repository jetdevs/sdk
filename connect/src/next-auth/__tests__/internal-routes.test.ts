/**
 * p77 STORY-005 — the REAL route handlers of `createConnectInternalRoutes`,
 * mounted on a loopback `node:http` server and driven with real requests,
 * over a REAL local Postgres adapter (`PgRpAdapter`: real transactions, real
 * row locks, the real M4 lease table) and ONE loopback IdP (JWKS + the D26
 * maintenance route from a mutable switch row + the handoff plane + the D24
 * lookup). Operator tokens are real RS256 JWTs. No `vi.mock` of http or db.
 *
 * ACs: AC1 (key), AC5 (inventory), AC6 (the operator contract matrix),
 * AC7 (session-freshness), AC9 (the route half: a paused op vs `drain`),
 * AC11 (a prepare paused INSIDE its leased transaction, the CLI dead,
 * `off --abort` through `EstateMaintenance.lift`).
 */
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RpSqlClient } from '../../adapter/index.js'
import { bcryptLike } from '../../server/handoff/__tests__/support/fake-adapter.js'
import { createHandoffTransport } from '../../server/handoff/transport.js'
import { digestVerifier } from '../../server/handoff/driver.js'
import { __resetFreshnessCachesForTests } from '../../server/revocation/freshness.js'
import { __resetRevocationCacheForTests } from '../../server/revocation/ledger.js'
import { __resetJwksCacheForTests } from '../../server/revocation/logout-token.js'
import { __resetMaintenanceCacheForTests } from '../../server/revocation/maintenance.js'
import { makeRsaKey } from '../../server/revocation/__tests__/support/fake-idp.js'
import { EstateMaintenance } from '../../cutover/maintenance.js'
import { createRpOpsClient } from '../../cutover/rp-client.js'
import { createConnectInternalRoutes, type ConnectInternalRouteDeps, type ConnectInternalRoutes, type HandoffOp } from '../internal-routes.js'
import { startFakeEstateIdp, type FakeEstateIdp } from './support/estate-idp.js'
import { handoffRows, leaseRows, openPgTestDb, PgRpAdapter, readUser, seedUser, type PgTestDb } from './support/pg-adapter.js'
import { startRpServer, type RpServer } from './support/rp-server.js'

const A = bcryptLike('crm-hash-A')
const RP_KEY = 'crm-internal-key-0123456789'
const HANDOFF = '/api/v1/internal/connect/credential-handoff'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function settledWithin<T>(p: Promise<T>, ms: number): Promise<boolean> {
  const marker = Symbol('pending')
  const r = await Promise.race([p.then(() => true, () => true), sleep(ms).then(() => marker)])
  return r !== marker
}

interface Harness {
  idp: FakeEstateIdp
  db: PgTestDb
  routeSql: RpSqlClient
  rp: RpServer
  routes: ConnectInternalRoutes
  environment: Record<string, string | undefined>
  flag: { on: boolean }
  clock: { now: () => Date; t: number }
  adapterCalls: { n: number }
  adapters: PgRpAdapter[]
  driverHooks: NonNullable<ConnectInternalRouteDeps['hooks']>
  logger: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; log: ReturnType<typeof vi.fn> }
  call(body: Record<string, unknown>, opts?: { token?: string | null; key?: string | null; path?: string }): Promise<{ status: number; json: any; text: string }>
  token(ops: HandoffOp[], over?: Parameters<FakeEstateIdp['mint']>[0]): Promise<string>
}

let h: Harness
let dbDown = false

async function makeHarness(): Promise<Harness | null> {
  const db = await openPgTestDb('p77_route')
  if (!db) return null
  const idp = await startFakeEstateIdp()
  const environment: Record<string, string | undefined> = { CONNECT_INTERNAL_KEY: RP_KEY, CADRA_API_INTERNAL_KEY: 'shared-cadra-key-000000000000' }
  const flag = { on: false }
  const clock = { t: Date.now(), now: () => new Date(clock.t) }
  const adapterCalls = { n: 0 }
  const adapters: PgRpAdapter[] = []
  const driverHooks: NonNullable<ConnectInternalRouteDeps['hooks']> = {}
  const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() }
  const routeSql = db.session(4).sql
  const routes = createConnectInternalRoutes({
    system: 'crm',
    env: 'local',
    keyEnvName: 'CONNECT_INTERNAL_KEY',
    environment,
    sql: routeSql,
    adapter: (sqlc) => {
      adapterCalls.n += 1
      const a = new PgRpAdapter('crm', idp.issuer, sqlc)
      a.transportForSweep = createHandoffTransport({ issuer: idp.issuer, rpKey: idp.rpKey, system: 'crm' })
      adapters.push(a)
      return a
    },
    connect: { issuer: idp.issuer, rpKey: idp.rpKey, timeoutMs: 2_000 },
    connectEnabled: () => flag.on,
    deactivateAllowlist: [{ env: 'local', system: 'crm', sourceUserRef: '9', reason: 'prod fb test account' }],
    membership: async ({ sub }) => (sub === '101' ? { found: true, active: true, orgs: [{ sourceOrgRef: '1', orgName: 'Org', status: 'active' }] } : { found: false, active: false, orgs: [] }),
    emailReserved: async (email) => email === 'reserved@example.test',
    now: clock.now,
    logger,
    hooks: driverHooks,
  })
  const rp = await startRpServer({
    [HANDOFF]: routes.credentialHandoff,
    '/api/v1/internal/connect/membership-check': routes.membershipCheck,
    '/api/v1/internal/connect/email-reserved': routes.emailReserved,
    '/api/v1/internal/connect/session-freshness': routes.sessionFreshness,
  })
  const call: Harness['call'] = async (body, opts = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (opts.key !== null) headers['X-Internal-API-Key'] = opts.key ?? RP_KEY
    if (opts.token) headers['X-Cutover-Operator'] = opts.token
    const res = await fetch(`${rp.origin}${opts.path ?? HANDOFF}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, json, text }
  }
  return { idp, db, routeSql, rp, routes, environment, flag, clock, adapterCalls, adapters, driverHooks, logger, call, token: (ops, over = { ops: [] }) => idp.mint({ ...over, ops }) }
}

const CUTOVER_OPS: HandoffOp[] = ['prepare', 'fence', 'activate', 'release', 'deactivate', 'reconcile']
const REPAIR_OPS: HandoffOp[] = ['stamp-issuer', 'quarantine-binding']

/** The standard estate: Connect user 101 bound to crm user 1 (hash A) and crm user 2 (no hash). */
async function seedEstate(): Promise<void> {
  h.idp.connect.addUser({ id: 101 })
  h.idp.connect.addUser({ id: 102 })
  h.idp.connect.bind('crm', '1', 101)
  h.idp.connect.bind('crm', '2', 102)
  await seedUser(h.db.sql, { id: 1, email: 'one@example.test', password: A, connectSub: '101', issuer: h.idp.issuer })
  await seedUser(h.db.sql, { id: 2, email: 'two@example.test', password: null, connectSub: '102', issuer: h.idp.issuer })
}

beforeEach(async () => {
  __resetMaintenanceCacheForTests()
  __resetFreshnessCachesForTests()
  __resetRevocationCacheForTests()
  __resetJwksCacheForTests()
  const made = await makeHarness()
  if (!made) {
    dbDown = true
    return
  }
  h = made
})
afterEach(async () => {
  if (dbDown || !h) return
  await h.rp.close()
  await h.idp.stop()
  await h.db.close()
})
const skip = () => dbDown

// =============================================================================
// AC1 — the key
// =============================================================================

describe('withConnectInternalAuth (AC1)', () => {
  it('AC1: CONNECT_INTERNAL_KEY unset → 503 and ONE log line across many calls; set equal to the shared CADRA key → 503; a wrong key → 401; the right key → through', async () => {
    if (skip()) return
    h.environment.CONNECT_INTERNAL_KEY = undefined
    expect((await h.call({ op: 'state' })).status).toBe(503)
    expect((await h.call({ op: 'state' })).status).toBe(503)
    expect((await h.call({ op: 'state' }, { path: '/api/v1/internal/connect/session-freshness' })).status).toBe(503)
    expect(h.logger.error).toHaveBeenCalledTimes(1)
    expect(String(h.logger.error.mock.calls[0]![0])).toContain('CONNECT_INTERNAL_KEY not configured')

    h.routes.__resetAuthLogForTests()
    h.environment.CONNECT_INTERNAL_KEY = 'shared-cadra-key-000000000000'
    const shared = await h.call({ op: 'state' }, { key: 'shared-cadra-key-000000000000' })
    expect(shared.status).toBe(503)
    expect(shared.json).toEqual({ error: 'not_configured' })
    expect(h.logger.error).toHaveBeenCalledTimes(2)
    expect(String(h.logger.error.mock.calls[1]![0])).toContain('equals CADRA_API_INTERNAL_KEY')

    h.environment.CONNECT_INTERNAL_KEY = RP_KEY
    expect((await h.call({ op: 'state' }, { key: 'nope' })).status).toBe(401)
    expect((await h.call({ op: 'state' }, { key: null })).status).toBe(401)
    expect((await h.call({ op: 'state' })).status).toBe(200)
  })

  it('membership-check and email-reserved answer the D7 / D19 shapes under the same key', async () => {
    if (skip()) return
    const m = await h.call({ issuer: h.idp.issuer, sub: '101' }, { path: '/api/v1/internal/connect/membership-check' })
    expect(m.status).toBe(200)
    expect(m.json).toEqual({ found: true, active: true, orgs: [{ sourceOrgRef: '1', orgName: 'Org', status: 'active' }] })
    expect((await h.call({ issuer: h.idp.issuer, sub: '999' }, { path: '/api/v1/internal/connect/membership-check' })).json).toEqual({ found: false, active: false, orgs: [] })
    expect((await h.call({ sub: '' }, { path: '/api/v1/internal/connect/membership-check' })).status).toBe(400)
    const e = await h.call({ email: 'Reserved@Example.test' }, { path: '/api/v1/internal/connect/email-reserved' })
    expect(e.json).toEqual({ reserved: true })
    expect((await h.call({ email: 'free@example.test' }, { path: '/api/v1/internal/connect/email-reserved' })).json).toEqual({ reserved: false })
    expect((await h.call({}, { path: '/api/v1/internal/connect/email-reserved' })).status).toBe(400)
  })
})

// =============================================================================
// AC5 — inventory
// =============================================================================

describe('inventory (AC5)', () => {
  it('AC5: paged with a cursor, digests only — no bcrypt hash appears in any response body; the allowlist and system flags are applied', async () => {
    if (skip()) return
    for (let i = 1; i <= 5; i += 1) await seedUser(h.db.sql, { id: i, email: i === 9 ? null : `u${i}@example.test`, password: bcryptLike(`hash-${i}`) })
    await seedUser(h.db.sql, { id: 9, email: 'fb-test@example.test', password: bcryptLike('hash-9') })
    await seedUser(h.db.sql, { id: 10, email: 'p77-probe@probe.invalid', password: null })
    const pages: any[] = []
    let cursor = 0
    for (;;) {
      const r = await h.call({ op: 'inventory', env: 'local', cursor, limit: 3 })
      expect(r.status).toBe(200)
      expect(r.text).not.toMatch(/\$2[aby]\$/)
      pages.push(r.json)
      if (r.json.nextCursor == null) break
      cursor = r.json.nextCursor
    }
    expect(pages.map((p) => p.rows.length)).toEqual([3, 3, 1])
    const rows = pages.flatMap((p) => p.rows)
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 9, 10])
    expect(rows[0].passwordDigest).toBe(digestVerifier(bcryptLike('hash-1')))
    expect(rows.find((r) => r.id === 9)).toMatchObject({ deactivate: true, system: false })
    expect(rows.find((r) => r.id === 10)).toMatchObject({ deactivate: false, system: true, passwordDigest: null })
    // A token, if sent, is ignored; the wrong env is refused.
    expect((await h.call({ op: 'inventory', env: 'prod' })).status).toBe(403)
    expect((await h.call({ op: 'inventory' }, { token: 'garbage' })).status).toBe(200)
  })
})

// =============================================================================
// AC6 — the operator contract
// =============================================================================

describe('credential-handoff — the operator contract (AC6)', () => {
  for (const flagOn of [false, true]) {
    it(`AC6 (YOBO_CONNECT_ENABLED=${flagOn}): a valid token + the switch active with the same jti → the handoff opens; no header → 401 operator_token_required and the driver is never called`, async () => {
      if (skip()) return
      h.flag.on = flagOn
      await seedEstate()
      await h.idp.arm('J1')

      const none = await h.call({ op: 'prepare', sourceUserRef: '1', expectedClass: 'import' })
      expect(none.status).toBe(401)
      expect(none.json).toMatchObject({ error: 'operator_token_required' })
      expect(h.adapterCalls.n).toBe(0)
      expect(await handoffRows(h.db.sql)).toEqual([])
      expect(h.idp.connect.hits['handoff/classify'] ?? 0).toBe(0)
      expect(await leaseRows(h.db.sql)).toEqual([])

      const ok = await h.call({ op: 'prepare', sourceUserRef: '1', expectedClass: 'import' }, { token: await h.token(CUTOVER_OPS) })
      expect(ok.status).toBe(200)
      expect(ok.json).toMatchObject({ op: 'prepare', outcome: 'prepared', handoffClass: 'import', remote: { ok: true, outcome: 'acked' } })
      const rows = await handoffRows(h.db.sql, 1)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ state: 'prepared', handoffClass: 'import' })
      expect(rows[0]!.prepareAckedAt).not.toBeNull()
      expect((await readUser(h.db.sql, 1))!.authority).toBe('prepared')
      expect(h.idp.connect.receipt('crm', '1')).toMatchObject({ state: 'prepared', handoffClass: 'import' })
      // The operator token travelled to Connect on every handoff call (D23).
      expect(h.idp.connect.requests.filter((r) => r.route.startsWith('handoff/')).every((r) => r.operator && r.operator.split('.').length === 3)).toBe(true)
      // The lease was opened before the live check and finished on exit.
      const leases = await leaseRows(h.db.sql)
      expect(leases).toEqual([{ op: 'prepare', outcome: 'prepare:acked', finished: true, expired: false }])
    })
  }

  it('AC6: a forged token (another key under the same kid) → 403 operator_invalid; env dev at a local RP → 403 operator_env_mismatch; a cutover token on stamp-issuer and a repair token on fence → 403 op_not_permitted; a JWKS outage → 503 operator_unverifiable', async () => {
    if (skip()) return
    await seedEstate()
    await h.idp.arm('J1')
    const forged = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token: await h.token(CUTOVER_OPS, { ops: [], key: makeRsaKey('k1') }) })
    expect(forged.status).toBe(403)
    expect(forged.json).toMatchObject({ error: 'operator_invalid' })
    const env = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token: await h.token(CUTOVER_OPS, { ops: [], env: 'dev' }) })
    expect(env.status).toBe(403)
    expect(env.json).toMatchObject({ error: 'operator_env_mismatch' })
    const cut = await h.call({ op: 'stamp-issuer', userIds: [1], issuer: h.idp.issuer }, { token: await h.token(CUTOVER_OPS) })
    expect(cut.status).toBe(403)
    expect(cut.json).toMatchObject({ error: 'op_not_permitted' })
    const rep = await h.call({ op: 'fence', sourceUserRef: '1' }, { token: await h.token(REPAIR_OPS) })
    expect(rep.status).toBe(403)
    expect(rep.json).toMatchObject({ error: 'op_not_permitted' })
    expect(await handoffRows(h.db.sql)).toEqual([])
    expect(await leaseRows(h.db.sql)).toEqual([]) // an offline refusal opens no lease
    h.idp.jwksDown = true
    __resetJwksCacheForTests()
    const down = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token: await h.token(CUTOVER_OPS) })
    expect(down.status).toBe(503)
    expect(down.json).toMatchObject({ error: 'operator_unverifiable' })
    expect(h.adapterCalls.n).toBe(0)
  })

  it('AC6: the fake reports inactive → 403 maintenance_off before any write; a different jti → 403 operator_superseded; the route unreachable → 503 maintenance_unverifiable — the adapter is never called, and the lease is finished on every refusal', async () => {
    if (skip()) return
    await seedEstate()
    const tokenJ1 = await h.token(CUTOVER_OPS, { ops: [], jti: 'J1' })

    const off = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token: tokenJ1 })
    expect(off.status).toBe(403)
    expect(off.json).toMatchObject({ error: 'maintenance_off' })

    await h.idp.arm('J2')
    const superseded = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token: tokenJ1 })
    expect(superseded.status).toBe(403)
    expect(superseded.json).toMatchObject({ error: 'operator_superseded' })

    __resetMaintenanceCacheForTests()
    h.idp.maintenanceStatusOverride = 500
    const unverifiable = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token: await h.token(CUTOVER_OPS) })
    expect(unverifiable.status).toBe(503)
    expect(unverifiable.json).toMatchObject({ error: 'maintenance_unverifiable' })
    h.idp.maintenanceStatusOverride = null

    expect(h.adapterCalls.n).toBe(0)
    expect(await handoffRows(h.db.sql)).toEqual([])
    expect(h.idp.connect.hits['handoff/classify'] ?? 0).toBe(0)
    expect((await readUser(h.db.sql, 1))!.authority).toBe('local')
    expect(await leaseRows(h.db.sql)).toEqual([
      { op: 'prepare', outcome: 'maintenance_off', finished: true, expired: false },
      { op: 'prepare', outcome: 'operator_superseded', finished: true, expired: false },
      { op: 'prepare', outcome: 'maintenance_unverifiable', finished: true, expired: false },
    ])
  })

  it('AC6: fence with a handoffId of another user, or of a closed handoff, with the right sourceUserRef → 403 handoff_mismatch and nothing written; fence with no handoffId resolves the open one; release for a user with no open handoff → 200 no_handoff', async () => {
    if (skip()) return
    await seedEstate()
    await h.idp.arm('J1')
    const token = await h.token(CUTOVER_OPS)
    expect((await h.call({ op: 'prepare', sourceUserRef: '1', expectedClass: 'import' }, { token })).status).toBe(200)
    expect((await h.call({ op: 'prepare', sourceUserRef: '2', expectedClass: 'recover' }, { token })).status).toBe(200)
    const [row1] = await handoffRows(h.db.sql, 1)
    const [row2] = await handoffRows(h.db.sql, 2)
    const before = { rows: await handoffRows(h.db.sql), u1: await readUser(h.db.sql, 1), u2: await readUser(h.db.sql, 2) }

    const other = await h.call({ op: 'fence', sourceUserRef: '1', handoffId: row2!.handoffId }, { token })
    expect(other.status).toBe(403)
    expect(other.json).toMatchObject({ error: 'handoff_mismatch' })
    const closed = await h.call({ op: 'fence', sourceUserRef: '1', handoffId: randomUUID() }, { token })
    expect(closed.status).toBe(403)
    expect(closed.json).toMatchObject({ error: 'handoff_mismatch' })
    expect({ rows: await handoffRows(h.db.sql), u1: await readUser(h.db.sql, 1), u2: await readUser(h.db.sql, 2) }).toEqual(before)
    expect((await leaseRows(h.db.sql)).slice(-2).every((l) => l.finished && l.outcome === 'handoff_mismatch')).toBe(true)

    const fenced = await h.call({ op: 'fence', sourceUserRef: '1' }, { token })
    expect(fenced.status).toBe(200)
    expect(fenced.json).toMatchObject({ ok: true, outcome: 'fenced', handoff: { handoffId: row1!.handoffId, state: 'fenced' } })
    expect((await readUser(h.db.sql, 1))!.authority).toBe('fenced')
    const byId = await h.call({ op: 'fence', sourceUserRef: '1', handoffId: row1!.handoffId }, { token })
    expect(byId.json).toMatchObject({ ok: true, outcome: 'fence_reasserted' })

    await seedUser(h.db.sql, { id: 3, email: 'three@example.test', connectSub: '103', issuer: h.idp.issuer })
    const none = await h.call({ op: 'release', sourceUserRef: '3' }, { token })
    expect(none.status).toBe(200)
    expect(none.json).toMatchObject({ op: 'release', outcome: 'no_handoff' })
  })

  it('AC6: deactivate for a user not in the allowlist → 403 not_allowlisted; an allowlisted one is deactivated; sweep-mappings runs under the RP key alone and with a token alike (the token is ignored)', async () => {
    if (skip()) return
    await seedEstate()
    await seedUser(h.db.sql, { id: 9, email: 'fb-test@example.test', password: null })
    await h.idp.arm('J1')
    const token = await h.token(CUTOVER_OPS)
    const no = await h.call({ op: 'deactivate', sourceUserRef: '1', reason: 'x' }, { token })
    expect(no.status).toBe(403)
    expect(no.json).toMatchObject({ error: 'not_allowlisted', env: 'local' })
    expect((await readUser(h.db.sql, 1))!.active).toBe(true)
    const yes = await h.call({ op: 'deactivate', sourceUserRef: '9' }, { token })
    expect(yes.status).toBe(200)
    expect(yes.json).toMatchObject({ outcome: 'deactivated' })
    expect((await readUser(h.db.sql, 9))!.active).toBe(false)

    // Two unmapped bindings: the sweep registers them through identity/register with the RP key only.
    const keyOnly = await h.call({ op: 'sweep-mappings' })
    expect(keyOnly.status).toBe(200)
    expect(keyOnly.json.report).toMatchObject({ registered: 2, conflicts: 0 })
    expect(h.idp.connect.requests.filter((r) => r.route === 'identity/register').every((r) => r.operator === null)).toBe(true)
    expect((await readUser(h.db.sql, 1))!.mappedAt).not.toBeNull()
    const withToken = await h.call({ op: 'sweep-mappings' }, { token })
    expect(withToken.status).toBe(200)
    expect(withToken.json.report).toMatchObject({ registered: 0 })
    // No lease is ever opened for an RP-key-only op.
    expect((await leaseRows(h.db.sql)).map((l) => l.op)).toEqual(['deactivate', 'deactivate'])
  })

  it('state answers the counts, inFlightOps from the lease table and the open handoffs’ user refs; reconcile over 25 due rows is one lease over 10 and answers remaining 15', async () => {
    if (skip()) return
    for (let i = 1; i <= 25; i += 1) {
      h.idp.connect.addUser({ id: 200 + i, googleLinked: true })
      h.idp.connect.bind('crm', String(i), 200 + i)
      await seedUser(h.db.sql, { id: i, email: `r${i}@example.test`, connectSub: String(200 + i), issuer: h.idp.issuer, authority: 'prepared' })
      await h.db.sql.execute(
        `INSERT INTO credential_handoff (connect_issuer, connect_sub, local_user_id, state, handoff_class, prepared_at, next_attempt_at)
         VALUES ($1, $2, $3, 'prepared', 'recover', clock_timestamp() - make_interval(secs => $4), clock_timestamp() - interval '1 second')`,
        [h.idp.issuer, String(200 + i), i, 100 - i],
      )
    }
    await seedUser(h.db.sql, { id: 50, email: 'local@example.test', password: A })
    await seedUser(h.db.sql, { id: 51, email: 'sys@probe.invalid' })
    await seedUser(h.db.sql, { id: 52, email: null })
    await h.idp.arm('J1')
    const s0 = await h.call({ op: 'state' })
    expect(s0.status).toBe(200)
    expect(s0.json.state).toMatchObject({ system: 'crm', flagEnabled: false, counts: { eligibleLocal: 1, prepared: 25, fenced: 0, connect: 0, inFlightOps: 0 }, openHandoffs: 25 })
    expect(s0.json.state.openHandoffRefs).toHaveLength(25)

    const token = await h.token(CUTOVER_OPS)
    const r1 = await h.call({ op: 'reconcile' }, { token })
    expect(r1.status).toBe(200)
    expect(r1.json.remaining).toBe(15)
    expect(r1.json.report).toMatchObject({ examined: 10, opExpired: false })
    const leases = await leaseRows(h.db.sql)
    expect(leases).toHaveLength(1)
    expect(leases[0]).toMatchObject({ op: 'reconcile', finished: true })
    const s1 = await h.call({ op: 'state' })
    expect(s1.json.state.counts).toMatchObject({ prepared: 15, connect: 10, inFlightOps: 0 })
    expect(s1.json.state.openHandoffRefs).toHaveLength(15)
    // The loop the driver runs: two more passes reach zero.
    expect((await h.call({ op: 'reconcile' }, { token })).json.remaining).toBe(5)
    expect((await h.call({ op: 'reconcile' }, { token })).json.remaining).toBe(0)
    expect((await h.call({ op: 'state' })).json.state.counts).toMatchObject({ prepared: 0, connect: 25 })
  })
})

// =============================================================================
// AC7 — session-freshness
// =============================================================================

describe('session-freshness (AC7)', () => {
  const FRESHNESS = '/api/v1/internal/connect/session-freshness'
  const lineage = (over: Record<string, unknown> = {}) => ({ parentUserId: 5, issuer: '', sub: '505', sid: 'S1', cv: 1, aeid: 'E1', grantId: 'G1', kind: 'oidc', authTime: 1_700_000_000, maxAgeMs: 25_000, ...over })

  it('AC7: with maxAgeMs 25000 and the cached version 40 s old the parent re-reads the canonical version before answering, and the answer carries version/active/epoch/grant/revokedAfter — not only a boolean; no access token in the request, no session of its own', async () => {
    if (skip()) return
    await seedUser(h.db.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: h.idp.issuer, authority: 'connect' })
    h.idp.accountVersion.set('505|5', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
    const t0 = h.clock.t
    const first = await h.call(lineage({ issuer: h.idp.issuer }), { path: FRESHNESS })
    expect(first.status).toBe(200)
    expect(first.json).toEqual({ fresh: true, version: 1, active: true, epoch: 'fresh', grant: 'live', revokedAfter: null, checkedAt: t0 })
    expect(h.idp.accountVersionHits).toBe(1)
    expect(h.idp.accountVersionBodies[0]).toEqual({ sub: '505', sourceUserRef: '5', aeid: 'E1', grantId: 'G1' })
    h.clock.t = t0 + 10_000
    await h.call(lineage({ issuer: h.idp.issuer }), { path: FRESHNESS })
    expect(h.idp.accountVersionHits).toBe(1) // 10 s old: served from the version cache
    h.clock.t = t0 + 40_000
    const again = await h.call(lineage({ issuer: h.idp.issuer }), { path: FRESHNESS })
    expect(h.idp.accountVersionHits).toBe(2) // 40 s old > maxAgeMs 25 s: re-read
    expect(again.json).toMatchObject({ fresh: true, version: 1, checkedAt: t0 + 40_000 })
    expect(again.json).not.toHaveProperty('reason')
  })

  it('AC7: a grantId Connect reports gone with cv unchanged and epoch fresh → fresh false, reason grant_gone, the facts returned; grant unknown on an oidc lineage → fresh false; a ledger row after authTime → revoked with revokedAfter', async () => {
    if (skip()) return
    await seedUser(h.db.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: h.idp.issuer, authority: 'connect' })
    h.idp.accountVersion.set('505|5', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'gone' })
    const gone = await h.call(lineage({ issuer: h.idp.issuer }), { path: FRESHNESS })
    expect(gone.json).toEqual({ fresh: false, reason: 'grant_gone', version: 1, active: true, epoch: 'fresh', grant: 'gone', revokedAfter: null, checkedAt: h.clock.t })
    h.idp.accountVersion.set('505|5', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'unknown' })
    const unknown = await h.call(lineage({ issuer: h.idp.issuer, grantId: 'G2' }), { path: FRESHNESS })
    expect(unknown.json).toMatchObject({ fresh: false, reason: 'grant_unknown', grant: 'unknown' })
    // An app_local lineage carries no grant and is admitted.
    const local = await h.call(lineage({ issuer: h.idp.issuer, kind: 'app_local', aeid: undefined, grantId: undefined }), { path: FRESHNESS })
    expect(local.json).toMatchObject({ fresh: true, version: 1 })
    // A subject-wide revocation after authTime refuses with the newest revoked_at.
    await h.db.sql.execute(`INSERT INTO connect_session_revocations (connect_issuer, connect_sub, connect_sid, local_user_id, jti, revoked_at) VALUES ($1, '505', NULL, 5, 'r1', to_timestamp(1700000100))`, [h.idp.issuer])
    __resetFreshnessCachesForTests()
    __resetRevocationCacheForTests() // the ledger's "any revocations?" gate is a 60 s process cache (STORY-003)
    const revoked = await h.call(lineage({ issuer: h.idp.issuer, grantId: 'G1' }), { path: FRESHNESS })
    expect(revoked.json).toMatchObject({ fresh: false, reason: 'revoked', revokedAfter: 1_700_000_100 })
    expect((await h.call(lineage({ issuer: h.idp.issuer, cv: 'x' }), { path: FRESHNESS })).status).toBe(400)
  })

  // p77 FIX-issuer-isolation (STORY-033 AC3, F2): the route used to pass the
  // body's issuer through as the lineage's while the lookup always asked the
  // CONFIGURED issuer — so a lineage naming Cadra Connect with a colliding sub
  // was answered fresh:true by crm, yobo and superhost.
  const CADRA_ISSUER = 'https://cadra-connect-mini.cafesean.com'

  it('F2: a lineage naming a foreign (Cadra) issuer → fresh false, reason foreign_issuer, no facts, Connect never asked, nothing cached; the matching lineage (any trailing-slash / case spelling of the configured issuer) is answered exactly as before', async () => {
    if (skip()) return
    await seedUser(h.db.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: h.idp.issuer, authority: 'connect' })
    h.idp.accountVersion.set('505|5', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
    const t0 = h.clock.t
    const foreign = await h.call(lineage({ issuer: CADRA_ISSUER }), { path: FRESHNESS })
    expect(foreign.status).toBe(200)
    expect(foreign.json).toEqual({ fresh: false, reason: 'foreign_issuer', version: null, active: null, epoch: null, grant: null, revokedAfter: null, checkedAt: t0 })
    expect(h.idp.accountVersionHits).toBe(0)
    // Same host, other scheme / port / path → still foreign.
    for (const other of [h.idp.issuer.replace('http:', 'https:'), `${h.idp.issuer}0`, `${h.idp.issuer}/cadra`]) {
      expect((await h.call(lineage({ issuer: other }), { path: FRESHNESS })).json).toMatchObject({ fresh: false, reason: 'foreign_issuer' })
    }
    expect(h.idp.accountVersionHits).toBe(0)
    // The matching lineage: unchanged answer, one lookup.
    const ok = await h.call(lineage({ issuer: h.idp.issuer }), { path: FRESHNESS })
    expect(ok.json).toEqual({ fresh: true, version: 1, active: true, epoch: 'fresh', grant: 'live', revokedAfter: null, checkedAt: t0 })
    expect(h.idp.accountVersionHits).toBe(1)
    // Normalized spellings of the configured issuer are the configured issuer.
    const spelled = await h.call(lineage({ issuer: ` ${h.idp.issuer.replace('http://', 'HTTP://')}// ` }), { path: FRESHNESS })
    expect(spelled.json).toMatchObject({ fresh: true, version: 1 })
    // The foreign answer was never cached: asked again after the admission, still refused, still no lookup.
    const again = await h.call(lineage({ issuer: CADRA_ISSUER }), { path: FRESHNESS })
    expect(again.json).toMatchObject({ fresh: false, reason: 'foreign_issuer', version: null })
    expect(h.idp.accountVersionHits).toBe(1)
    // An app_local lineage from the foreign issuer is refused the same way.
    const local = await h.call(lineage({ issuer: CADRA_ISSUER, kind: 'app_local', aeid: undefined, grantId: undefined }), { path: FRESHNESS })
    expect(local.json).toMatchObject({ fresh: false, reason: 'foreign_issuer' })
    expect(h.idp.accountVersionHits).toBe(1)
  })

  it('F2: the parent row must be bound to exactly (iss, sub) before any lookup — another sub, an unbound row or a missing row → binding_mismatch; a half-bound legacy row (NULL issuer, sub) counts as the configured issuer (D9 trust rule)', async () => {
    if (skip()) return
    await seedUser(h.db.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: h.idp.issuer, authority: 'connect' })
    await seedUser(h.db.sql, { id: 6, email: 'u@example.test', connectSub: null, issuer: null })
    await seedUser(h.db.sql, { id: 7, email: 'h@example.test', connectSub: '707', issuer: null })
    h.idp.accountVersion.set('505|5', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
    h.idp.accountVersion.set('606|5', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
    h.idp.accountVersion.set('707|7', { found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
    const spliced = await h.call(lineage({ issuer: h.idp.issuer, sub: '606' }), { path: FRESHNESS })
    expect(spliced.json).toEqual({ fresh: false, reason: 'binding_mismatch', version: null, active: null, epoch: null, grant: null, revokedAfter: null, checkedAt: h.clock.t })
    expect((await h.call(lineage({ issuer: h.idp.issuer, parentUserId: 6 }), { path: FRESHNESS })).json).toMatchObject({ fresh: false, reason: 'binding_mismatch' })
    expect((await h.call(lineage({ issuer: h.idp.issuer, parentUserId: 99 }), { path: FRESHNESS })).json).toMatchObject({ fresh: false, reason: 'binding_mismatch' })
    expect(h.idp.accountVersionHits).toBe(0)
    const halfBound = await h.call(lineage({ issuer: h.idp.issuer, parentUserId: 7, sub: '707' }), { path: FRESHNESS })
    expect(halfBound.json).toMatchObject({ fresh: true, version: 1 })
    expect(h.idp.accountVersionHits).toBe(1)
  })

  it('F2 (membership-check, same rule): a foreign issuer is answered not-found without consulting the app, even for a sub the app knows', async () => {
    if (skip()) return
    expect((await h.call({ issuer: CADRA_ISSUER, sub: '101' }, { path: '/api/v1/internal/connect/membership-check' })).json).toEqual({ found: false, active: false, orgs: [] })
    expect((await h.call({ issuer: `${h.idp.issuer}/`, sub: '101' }, { path: '/api/v1/internal/connect/membership-check' })).json).toMatchObject({ found: true, active: true })
  })

  it('AC7: the parent process restarted between two requests (the route module re-imported) answers identically — nothing was held in memory', async () => {
    if (skip()) return
    await seedUser(h.db.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: h.idp.issuer, authority: 'connect' })
    h.idp.accountVersion.set('505|5', { found: true, cv: 2, active: true, epoch: 'fresh', grant: 'live' })
    const before = await h.call(lineage({ issuer: h.idp.issuer, cv: 1 }), { path: FRESHNESS })
    expect(before.json).toMatchObject({ fresh: false, reason: 'stale', version: 2 })
    vi.resetModules()
    // A re-import is no longer a restart: the SDK's caches live in ONE process-wide registry on
    // globalThis (internal/process-state.ts), which survives module re-evaluation by design. A new
    // process starts with that registry empty — the resets below are that.
    const freshRevocation = (await import('../../server/revocation/index.js')) as typeof import('../../server/revocation/index.js')
    freshRevocation.__resetFreshnessCachesForTests()
    freshRevocation.__resetRevocationCacheForTests()
    freshRevocation.__resetMaintenanceCacheForTests()
    freshRevocation.__resetJwksCacheForTests()
    const fresh = (await import('../internal-routes.js')) as typeof import('../internal-routes.js')
    const routes2 = fresh.createConnectInternalRoutes({
      system: 'crm',
      env: 'local',
      keyEnvName: 'CONNECT_INTERNAL_KEY',
      environment: h.environment,
      sql: h.routeSql,
      adapter: (sqlc) => new PgRpAdapter('crm', h.idp.issuer, sqlc),
      connect: { issuer: h.idp.issuer, rpKey: h.idp.rpKey },
      connectEnabled: () => false,
      now: h.clock.now,
    })
    const res = await routes2.sessionFreshness(new Request(`${h.rp.origin}${FRESHNESS}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Internal-API-Key': RP_KEY }, body: JSON.stringify(lineage({ issuer: h.idp.issuer, cv: 1 })) }))
    expect(await res.json()).toEqual(before.json)
    expect(h.idp.accountVersionHits).toBe(2) // a fresh process re-read; the answer did not change
  })
})

// =============================================================================
// AC9 (route half) and AC11 — the orphaned request vs the lift, through the real route
// =============================================================================

describe('§6.5 orphan — a paused op, the drain and the lift, through the REAL route (AC9, AC11)', () => {
  it('AC9: a prepare paused (hook) after its live check and after classify, before the local INSERT, while `drain` runs on this RP through the route → its first write rolls back op_expired, the adapter saw no write, drain answered expired 1, state showed inFlightOps 1 while paused and 0 after', async () => {
    if (skip()) return
    await seedEstate()
    await h.idp.arm('J1')
    const token = await h.token(CUTOVER_OPS)
    let releasePause!: () => void
    const paused = new Promise<void>((r) => {
      releasePause = r
    })
    let entered!: () => void
    const enteredP = new Promise<void>((r) => {
      entered = r
    })
    h.driverHooks.driver = {
      afterClassify: async () => {
        entered()
        await paused
      },
    }
    const request = h.call({ op: 'prepare', sourceUserRef: '1', expectedClass: 'import' }, { token })
    await enteredP
    expect((await h.call({ op: 'state' })).json.state.counts.inFlightOps).toBe(1)

    // The lift rotates the jti, then drains — through the real route, with a token from the rotated jti.
    await h.idp.store.write({ ...h.idp.switchRow!, jti: 'J2', liftingSince: new Date().toISOString() })
    const drain = await h.call({ op: 'drain' }, { token: await h.token(['drain']) })
    expect(drain.status).toBe(200)
    expect(drain.json).toEqual({ op: 'drain', expired: 1 })
    expect((await h.call({ op: 'state' })).json.state.counts.inFlightOps).toBe(0)

    releasePause()
    const r = await request
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ error: 'op_expired' })
    expect(await handoffRows(h.db.sql)).toEqual([])
    expect((await readUser(h.db.sql, 1))!.authority).toBe('local')
    expect(h.idp.connect.hits['handoff/prepare'] ?? 0).toBe(0)
    expect(h.idp.connect.receipt('crm', '1')).toBeUndefined()
    expect(await leaseRows(h.db.sql)).toEqual([{ op: 'prepare', outcome: 'drained', finished: true, expired: true }])
    // A token minted before the rotation is refused by the RP route and by Connect afterwards.
    const old = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token })
    expect(old.status).toBe(403)
    expect(old.json).toMatchObject({ error: 'operator_superseded' })
  })

  it('AC11: a prepare through the real route paused INSIDE its leased transaction (after the claim, after the INSERT, the row lock held), the CLI dead, `off --abort` rotates the jti and drains every RP → drain returns only after the paused transaction ends; the abort’s release sees the committed row and returns it to local; the late handoff/prepare is operator_superseded; nothing prepared or staged lands after the abort completes', async () => {
    if (skip()) return
    await seedEstate()
    await h.idp.arm('J1')
    const token = await h.token(CUTOVER_OPS)
    let releasePause!: () => void
    const paused = new Promise<void>((r) => {
      releasePause = r
    })
    let entered!: () => void
    const enteredP = new Promise<void>((r) => {
      entered = r
    })
    let pauseEndedAt = 0
    // The hook lives in the adapter the route builds for THIS request — inside `insert`'s transaction.
    const origFactory = h.adapters
    h.adapters.length = 0
    const hookInstall = setInterval(() => {
      for (const a of origFactory) a.hooks.insideInsert = async () => {
        entered()
        await paused
        pauseEndedAt = Date.now()
      }
    }, 1)

    const request = h.call({ op: 'prepare', sourceUserRef: '1', expectedClass: 'import' }, { token })
    await enteredP
    clearInterval(hookInstall)
    // The lease is claimed and the row lock is held: the INSERT is invisible to another session.
    expect((await h.db.sql.execute(`SELECT count(*)::int AS n FROM credential_handoff`))[0]!.n).toBe(0)
    expect((await h.call({ op: 'state' })).json.state.counts).toMatchObject({ inFlightOps: 1, prepared: 0 })

    // The CLI is dead (no lock held). `off --abort`: rotate, gate (a), drain every RP, release, count, lift.
    const lifter = new EstateMaintenance({
      env: 'local',
      issuer: h.idp.issuer,
      store: h.idp.store,
      sign: h.idp.sign,
      plan: { order: ['crm', 'yobo'], pilots: ['commerce', 'superhost'] },
      rps: { crm: createRpOpsClient({ system: 'crm', origin: h.rp.origin, rpKey: RP_KEY }) },
      audience: ['crm', 'yobo', 'commerce', 'superhost'],
      lock: { isHeld: async () => false },
      log: () => {},
    })
    const liftStartedAt = Date.now()
    const lift = lifter.lift({ abort: true })
    await sleep(150)
    // Rotated FIRST: the row already carries the new jti and lifting_since while the drain waits on the paused transaction.
    expect(h.idp.switchRow).toMatchObject({ active: true, liftingSince: expect.any(String) })
    expect(h.idp.switchRow!.jti).not.toBe('J1')
    expect(await settledWithin(lift, 400)).toBe(false)
    // Still nothing committed while the drain waits.
    expect((await h.db.sql.execute(`SELECT count(*)::int AS n FROM credential_handoff`))[0]!.n).toBe(0)

    releasePause()
    const result = await lift
    const liftReturnedAt = Date.now()
    expect(pauseEndedAt).toBeGreaterThan(liftStartedAt)
    expect(liftReturnedAt).toBeGreaterThanOrEqual(pauseEndedAt)
    expect(result).toMatchObject({ lifted: true, drained: { crm: 1 }, released: [{ system: 'crm', sourceUserRef: '1', outcome: 'released' }] })
    expect(h.idp.switchRow).toMatchObject({ active: false, jti: null, liftingSince: null, liftedAt: expect.any(String) })

    // The paused request ran on: its committed row was released by the abort; its late handoff/prepare was refused at Connect.
    const r = await request
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ op: 'prepare', remote: { ok: false, outcome: 'operator_superseded' } })
    const late = h.idp.connect.requests.filter((x) => x.route === 'handoff/prepare')
    expect(late).toHaveLength(1)
    expect(late[0]).toMatchObject({ status: 403 })
    expect(h.idp.connect.receipt('crm', '1')).toBeUndefined()
    expect(h.idp.connect.staged.size).toBe(0)
    const rows = await handoffRows(h.db.sql, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'failed', prepareAckedAt: null })
    expect((await readUser(h.db.sql, 1))!.authority).toBe('local')
    const leases = await leaseRows(h.db.sql)
    expect(leases.find((l) => l.op === 'prepare')).toMatchObject({ outcome: 'drained', finished: true })
    // Nothing the dead operator's request could still do lands after the lift: a new op under its token is refused.
    const after = await h.call({ op: 'prepare', sourceUserRef: '1' }, { token })
    expect(after.status).toBe(403)
    expect(after.json).toMatchObject({ error: 'maintenance_off' })
    expect((await h.call({ op: 'state' })).json.state.counts).toMatchObject({ prepared: 0, fenced: 0, inFlightOps: 0 })
  }, 20_000)
})

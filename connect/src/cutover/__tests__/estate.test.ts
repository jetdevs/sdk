/**
 * p77 STORY-005 — `EstateCutover` against a real local estate: the loopback
 * IdP + two RPs (crm, yobo) over REAL Postgres behind the REAL routes, a REAL
 * advisory lock. ACs: AC4 (a yobo fence failure fails that row only; a
 * class_mismatch row is skipped with nothing written), AC8 (the switch off →
 * maintenance_required; a second driver → driver_running; killed after crm's
 * pass and rerun → already_activated + yobo moves, no row touched twice).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bcryptLike } from '../../server/handoff/__tests__/support/fake-adapter.js'
import { handoffRows, readUser, seedUser } from '../../next-auth/__tests__/support/pg-adapter.js'
import { EstateCutover, type EstateCutoverDeps } from '../estate.js'
import { approveManifest, buildEstateManifest, type EstateManifest } from '../manifest.js'
import { createRemintingTokenProvider } from '../switch.js'
import { startEstate, type Estate } from './support/estate-harness.js'

const A = bcryptLike('crm-hash-A')
const B = bcryptLike('yobo-hash-B')
const D = bcryptLike('yobo-new-D')

let e: Estate
let dbDown = false

beforeEach(async () => {
  const made = await startEstate({ systems: ['crm', 'yobo'] })
  if (!made) {
    dbDown = true
    return
  }
  e = made
  e.idp.connect.addUser({ id: 101 })
  e.idp.connect.bind('crm', '1', 101)
  e.idp.connect.bind('yobo', '7', 101)
  await seedUser(e.rps.crm!.db.sql, { id: 1, email: 'sean@example.test', password: A, connectSub: '101', issuer: e.idp.issuer })
  await seedUser(e.rps.yobo!.db.sql, { id: 7, email: 'sean@example.test', password: B, connectSub: '101', issuer: e.idp.issuer })
})
afterEach(async () => {
  if (!dbDown && e) await e.close()
})
const skip = () => dbDown

async function manifest(over: { yoboClass?: 'import' | 'retire' | 'adopt' | 'recover' } = {}): Promise<EstateManifest> {
  const inventories = {
    crm: await e.rps.crm!.client.inventoryAll('local'),
    yobo: await e.rps.yobo!.client.inventoryAll('local'),
  }
  const built = buildEstateManifest({
    env: 'local',
    connectIssuer: e.idp.issuer,
    // p77 STORY-041: the IdP registry's plan (0025 seeds crm=1, yobo=2).
    plan: { order: ['crm', 'yobo'], pilots: ['commerce', 'superhost'] },
    inventories,
    connectFacts: () => ({ connectUserId: 101, passwordPresent: e.idp.connect.users.get(101)!.password != null, establishedReceipt: [...e.idp.connect.receipts.values()].some((r) => r.userId === 101 && r.established) }),
    generatedAt: '2026-09-23T10:00:00.000Z',
  })
  const rows = over.yoboClass ? built.rows.map((r) => (r.system === 'yobo' ? { ...r, class: over.yoboClass! } : r)) : built.rows
  return approveManifest({ ...built, rows }, { approvedBy: 'Sean Liao', approvedAt: '2026-09-23T10:01:00.000Z' })
}

function driver(m: EstateManifest, over: Partial<EstateCutoverDeps> = {}): EstateCutover {
  const token = createRemintingTokenProvider({ store: e.idp.store, sign: e.idp.sign, issuer: e.idp.issuer, env: 'local', audience: ['crm', 'yobo'], ops: ['prepare', 'fence', 'activate', 'release', 'deactivate', 'reconcile'], now: e.clock.now })
  return new EstateCutover({
    env: 'local',
    issuer: e.idp.issuer,
    manifest: m,
    rps: e.clientsWith(() => token.current()),
    readSwitch: () => e.idp.store.read(),
    lock: e.lock,
    token,
    execute: true,
    now: e.clock.now,
    log: () => {},
    ...over,
  })
}

const handoffCalls = (system: string) => e.idp.connect.requests.filter((r) => r.route.startsWith('handoff/') && r.system === system)

describe('EstateCutover — §6.3 (AC4, AC8)', () => {
  it('AC8: with the switch off, --execute refuses maintenance_required before touching any RP; a dry run needs no switch and writes nothing', async () => {
    if (skip()) return
    const m = await manifest()
    const dry = await driver(m, { execute: false }).run()
    expect(dry.exitCode).toBe(0)
    expect(dry.report.rows.map((r) => [r.system, r.class, r.outcome])).toEqual([
      ['crm', 'import', 'would_run'],
      ['yobo', 'retire', 'would_run'],
    ])
    const r = await driver(m).run()
    expect(r.exitCode).toBe(2)
    expect(r.report.refusal).toMatch(/maintenance_required/)
    expect(e.rps.crm!.ops.filter((o) => o !== 'inventory' && o !== 'state')).toEqual([])
    expect(e.rps.yobo!.ops.filter((o) => o !== 'inventory' && o !== 'state')).toEqual([])
    expect(handoffCalls('crm')).toEqual([])
    expect((await readUser(e.rps.crm!.db.sql, 1))!.authority).toBe('local')
    // An unapproved manifest is refused too, and a lift in progress.
    await e.idp.arm('J1')
    const unapproved = await driver({ ...m, approval: null }).run()
    expect(unapproved.exitCode).toBe(2)
    expect(unapproved.report.refusal).toMatch(/no approval/)
    await e.idp.store.write({ ...e.idp.switchRow!, liftingSince: new Date().toISOString() })
    expect((await driver(m).run()).report.refusal).toMatch(/lifting/)
  })

  it('AC8: two drivers for one environment → the second is refused driver_running (a real pg_try_advisory_lock)', async () => {
    if (skip()) return
    await e.idp.arm('J1')
    const m = await manifest()
    // The first driver holds the lock (its session); the second instance uses another session.
    expect(await e.lock.tryAcquire('local')).toBe(true)
    const second = await driver(m, { lock: e.lockFor() }).run()
    expect(second.exitCode).toBe(2)
    expect(second.report.refusal).toMatch(/driver_running/)
    expect(handoffCalls('crm')).toEqual([])
    await e.lock.release('local')
    const first = await driver(m, { lock: e.lockFor() }).run()
    expect(first.exitCode).toBe(0)
  })

  it('runs crm’s rows to completion BEFORE yobo’s first classify; each row prepare → fence → activate; ends with reconcile + state + the flag lines; exit 0; a rerun answers already_activated for both with no Connect call', async () => {
    if (skip()) return
    await e.idp.arm('J1')
    const m = await manifest()
    const r = await driver(m).run()
    expect(r.exitCode).toBe(0)
    expect(r.report.rows.map((x) => [x.system, x.class, x.outcome, x.after])).toEqual([
      ['crm', 'import', 'connect', 'connect'],
      ['yobo', 'retire', 'connect', 'connect'],
    ])
    // Order at Connect: every crm handoff call precedes the first yobo one; the RP ops are prepare → fence → activate then reconcile.
    const calls = e.idp.connect.requests.filter((x) => x.route.startsWith('handoff/'))
    const firstYobo = calls.findIndex((x) => x.system === 'yobo')
    expect(calls.slice(0, firstYobo).every((x) => x.system === 'crm')).toBe(true)
    expect(calls.slice(0, firstYobo).map((x) => x.route)).toEqual(['handoff/classify', 'handoff/prepare', 'handoff/activate'])
    expect(e.rps.crm!.ops.filter((o) => o !== 'inventory')).toEqual(['prepare', 'fence', 'activate', 'reconcile', 'state'])
    expect(e.rps.yobo!.ops.filter((o) => o !== 'inventory')).toEqual(['prepare', 'fence', 'activate', 'reconcile', 'state'])
    expect(e.idp.connect.users.get(101)!.password).toBe(A)
    expect(e.idp.connect.stagedHistory).toEqual([A])
    expect([...e.idp.connect.receipts.values()].filter((x) => x.established)).toHaveLength(1)
    expect((await readUser(e.rps.crm!.db.sql, 1))).toMatchObject({ authority: 'connect', password: null })
    expect((await readUser(e.rps.yobo!.db.sql, 7))).toMatchObject({ authority: 'connect', password: null })
    expect(r.flagLines).toEqual(['set YOBO_CONNECT_ENABLED=true for crm', 'set YOBO_CONNECT_ENABLED=true for yobo'])
    expect(r.lines.slice(-2)).toEqual(r.flagLines) // the last lines
    expect(r.report.reconcile.crm).toMatchObject({ remaining: 0 })
    expect(e.idp.switchRow!.firstActivationAt).not.toBeNull()
    // Every RP call carried the operator token; every Connect handoff call carried it too (D23).
    expect(calls.every((x) => x.operator && x.operator.split('.').length === 3)).toBe(true)

    const before = e.idp.connect.requests.length
    const again = await driver(m).run()
    expect(again.exitCode).toBe(0)
    expect(again.report.rows.map((x) => x.outcome)).toEqual(['already_activated', 'already_activated'])
    expect(e.idp.connect.requests.length).toBe(before)
  })

  it('AC4: yobo’s fence fails (adopt_source_changed) after crm’s row is connect → that row alone fails and is released on Connect’s word (fail_requested_at persisted first), crm untouched, the pass continues, exit 1 lists the row, no yobo flag line', async () => {
    if (skip()) return
    await e.idp.arm('J1')
    e.rps.yobo!.hooks.driver = {
      afterPrepareAck: async () => {
        // A concurrent local password change under `prepared` — the adopt/retire pin no longer matches.
        await e.rps.yobo!.db.sql.execute(`UPDATE users SET password = $1, updated_at = clock_timestamp() + interval '1 second' WHERE id = 7`, [D])
      },
    }
    const m = await manifest()
    const r = await driver(m).run()
    expect(r.exitCode).toBe(1)
    expect(r.report.rows.map((x) => [x.system, x.outcome, x.after])).toEqual([
      ['crm', 'connect', 'connect'],
      ['yobo', 'failed', 'local'],
    ])
    expect(r.report.rows[1]!.reason).toContain('adopt_source_changed')
    const [row] = await handoffRows(e.rps.yobo!.db.sql, 7)
    expect(row).toMatchObject({ state: 'failed', failedReason: 'adopt_source_changed' })
    expect(row!.failRequestedAt).not.toBeNull()
    expect(e.idp.connect.requests.filter((x) => x.route === 'handoff/fail' && x.system === 'yobo')).toHaveLength(1)
    expect((await readUser(e.rps.yobo!.db.sql, 7))).toMatchObject({ authority: 'local', password: D })
    expect((await readUser(e.rps.crm!.db.sql, 1))).toMatchObject({ authority: 'connect', password: null })
    expect(e.idp.connect.users.get(101)!.password).toBe(A)
    expect(r.flagLines).toEqual(['set YOBO_CONNECT_ENABLED=true for crm'])
    expect(r.report.states.yobo).toMatchObject({ counts: { eligibleLocal: 1, prepared: 0, fenced: 0 } })
  })

  it('AC4: a row whose classify answer differs from the manifest’s class → skipped class_mismatch, nothing written for it', async () => {
    if (skip()) return
    await e.idp.arm('J1')
    const m = await manifest({ yoboClass: 'import' }) // stale: Connect will answer retire once crm has established
    const r = await driver(m).run()
    expect(r.exitCode).toBe(1)
    expect(r.report.rows[1]).toMatchObject({ system: 'yobo', class: 'import', outcome: 'class_mismatch', after: 'local' })
    expect(r.report.rows[1]!.reason).toContain('retire')
    expect(await handoffRows(e.rps.yobo!.db.sql)).toEqual([])
    expect((await readUser(e.rps.yobo!.db.sql, 7))).toMatchObject({ authority: 'local', password: B })
    expect(e.idp.connect.requests.filter((x) => x.system === 'yobo' && x.route.startsWith('handoff/')).map((x) => x.route)).toEqual(['handoff/classify'])
    expect(e.idp.connect.receipt('yobo', '7')).toBeUndefined()
  })

  it('AC8: the driver killed after crm’s pass (first run with only crm given → yobo rp_not_ready), rerun with both → crm already_activated, yobo moves, no row touched twice', async () => {
    if (skip()) return
    await e.idp.arm('J1')
    const m = await manifest()
    const token = createRemintingTokenProvider({ store: e.idp.store, sign: e.idp.sign, issuer: e.idp.issuer, env: 'local', audience: ['crm', 'yobo'], ops: ['prepare', 'fence', 'activate', 'release', 'deactivate', 'reconcile'], now: e.clock.now })
    const crmOnly = await new EstateCutover({ env: 'local', issuer: e.idp.issuer, manifest: m, rps: { crm: e.rps.crm!.client.withOperatorToken(() => token.current()) }, readSwitch: () => e.idp.store.read(), lock: e.lock, token, execute: true, now: e.clock.now, log: () => {} }).run()
    expect(crmOnly.exitCode).toBe(1)
    expect(crmOnly.report.rows.map((x) => [x.system, x.outcome])).toEqual([
      ['crm', 'connect'],
      ['yobo', 'rp_not_ready'],
    ])
    expect((await readUser(e.rps.crm!.db.sql, 1))!.authority).toBe('connect')
    expect((await readUser(e.rps.yobo!.db.sql, 7))!.authority).toBe('local')
    const crmCallsBefore = handoffCalls('crm').length
    const crmRowsBefore = await handoffRows(e.rps.crm!.db.sql)

    const rerun = await driver(m).run()
    expect(rerun.exitCode).toBe(0)
    expect(rerun.report.rows.map((x) => [x.system, x.outcome])).toEqual([
      ['crm', 'already_activated'],
      ['yobo', 'connect'],
    ])
    expect(handoffCalls('crm').length).toBe(crmCallsBefore) // crm asked Connect nothing on the rerun
    expect(await handoffRows(e.rps.crm!.db.sql)).toEqual(crmRowsBefore) // no row touched twice
    expect(await handoffRows(e.rps.yobo!.db.sql)).toHaveLength(1)
    expect((await readUser(e.rps.yobo!.db.sql, 7))).toMatchObject({ authority: 'connect', password: null })
    expect(rerun.flagLines).toHaveLength(2)
  })

  it('deactivate allowlist entries run first; the 45-minute warning is printed once past 45 min from `since`', async () => {
    if (skip()) return
    await seedUser(e.rps.crm!.db.sql, { id: 9, email: 'fb-test@example.test', password: null })
    await e.close()
    const made = await startEstate({ systems: ['crm', 'yobo'], allowlist: [{ env: 'local', system: 'crm', sourceUserRef: '9', reason: 'prod fb test account' }] })
    if (!made) return
    e = made
    e.idp.connect.addUser({ id: 101 })
    e.idp.connect.bind('crm', '1', 101)
    await seedUser(e.rps.crm!.db.sql, { id: 1, email: 'sean@example.test', password: A, connectSub: '101', issuer: e.idp.issuer })
    await seedUser(e.rps.crm!.db.sql, { id: 9, email: 'fb-test@example.test', password: null })
    await e.idp.arm('J1')
    e.idp.switchRow = { ...e.idp.switchRow!, since: new Date(e.clock.t - 46 * 60_000).toISOString() }
    const m = await manifest()
    const r = await driver(m, { allowlist: [{ env: 'local', system: 'crm', sourceUserRef: '9', reason: 'prod fb test account' }] }).run()
    expect(r.report.deactivations).toEqual([{ system: 'crm', sourceUserRef: '9', outcome: 'deactivated' }])
    expect(e.rps.crm!.ops.filter((o) => o !== 'inventory')[0]).toBe('deactivate')
    expect((await readUser(e.rps.crm!.db.sql, 9))!.active).toBe(false)
    expect(r.report.warnings.filter((w) => w.includes('budget 60'))).toHaveLength(1)
    expect(r.exitCode).toBe(0)
  })
})

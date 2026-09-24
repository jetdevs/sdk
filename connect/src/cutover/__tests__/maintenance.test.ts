/**
 * p77 STORY-005 — `EstateMaintenance` (arm / lift / extend / status / mint),
 * `IssuerBackfill` and `EmailReconcile` against the real local estate
 * (loopback IdP + RPs over REAL Postgres behind the REAL routes).
 * ACs: AC9 (the lift: rotate first, drain every RP before any release or
 * count, the pre- and post-activation contracts), AC10 (arm: every failed
 * probe named, `armed` only on the exact paused shape, the positive
 * control), AC8's IssuerBackfill half (maintenance_required).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RpSystem } from '../../adapter/index.js'
import { bcryptLike } from '../../server/handoff/__tests__/support/fake-adapter.js'
import { decodeJwtPayload } from '../../next-auth/__tests__/support/estate-idp.js'
import { handoffRows, leaseRows, readUser, seedUser } from '../../next-auth/__tests__/support/pg-adapter.js'
import { EmailReconcile, auditEmailDuplicates, validateDecisions } from '../email-duplicates.js'
import { IssuerBackfill, type ConnectDirectory } from '../issuer-backfill.js'
import { classifyProbe, EstateMaintenance, type EstateMaintenanceDeps, type ProbeObservation, type ProbeSurface } from '../maintenance.js'
import { createRemintingTokenProvider, MintRefusedError, type MaintenanceSwitchRow, type MaintenanceSwitchStore } from '../switch.js'
import { startEstate, type Estate } from './support/estate-harness.js'

// p77 STORY-041: the driver order is the IdP registry's (0025 seeds crm=1, yobo=2).
const PLAN = { order: ['crm', 'yobo'], pilots: ['commerce', 'superhost'] } as const

const A = bcryptLike('crm-hash-A')

// =============================================================================
// AC10 — arm: the probes (pure classification + the command over fake surfaces)
// =============================================================================

describe('classifyProbe — the one judgement (AC10)', () => {
  const paused = (kind: ProbeSurface['kind'], obs: ProbeObservation) => classifyProbe(kind, 'paused', obs, { issuerLoginPaths: ['/login', '/oauth/authorize'] })
  it('names every failure with its reason and accepts only the exact paused shape', () => {
    expect(paused('silent-authorize', { status: 302, location: '/maintenance' })).toMatchObject({ ok: true })
    expect(paused('silent-authorize', { status: 404 })).toMatchObject({ ok: false, reason: 'not_found' })
    expect(paused('silent-authorize', { status: 302, location: 'http://idp/login?callbackUrl=x' })).toMatchObject({ ok: false, reason: 'redirect_to_idp_login' })
    expect(paused('silent-authorize', { status: 403 })).toMatchObject({ ok: false, reason: 'csrf_4xx' })
    expect(paused('silent-authorize', { status: 302, location: '/dashboard', setCookie: ['next-auth.session-token=abc; Path=/; HttpOnly'] })).toMatchObject({ ok: false, reason: 'session_issued' })
    expect(paused('silent-authorize', { status: 302, location: '/maintenance', setCookie: ['__Secure-next-auth.session-token=abc; Path=/'] })).toMatchObject({ ok: false, reason: 'session_issued' })
    expect(paused('silent-authorize', { status: 200 })).toMatchObject({ ok: false, reason: 'unexpected_200' })
    expect(paused('credentials', { status: 302, location: '/api/auth/error?error=maintenance' })).toMatchObject({ ok: true })
    expect(paused('credentials', { status: 302, location: '/login?error=CredentialsSignin' })).toMatchObject({ ok: false, reason: 'credentials_signin' })
    expect(paused('credentials', { status: 400 })).toMatchObject({ ok: false, reason: 'csrf_4xx' })
    expect(paused('credentials', { status: 404 })).toMatchObject({ ok: false, reason: 'not_found' })
    expect(paused('bridge', { status: 503 })).toMatchObject({ ok: true })
    expect(paused('bridge', { status: 200 })).toMatchObject({ ok: false, reason: 'mint_admitted' })
    expect(paused('page', { status: 200, bodyText: 'Sign-in is paused' })).toMatchObject({ ok: true })
    expect(paused('page', { status: 404 })).toMatchObject({ ok: false, reason: 'not_found' })
    expect(paused('page', { status: 0, transportError: 'ECONNREFUSED' })).toMatchObject({ ok: false, reason: 'unreachable' })
    // The positive control: a session must be issued; a wrong password must answer CredentialsSignin.
    expect(classifyProbe('silent-authorize', 'positive', { status: 302, location: '/', setCookie: ['next-auth.session-token=abc'] })).toMatchObject({ ok: true })
    expect(classifyProbe('silent-authorize', 'positive', { status: 302, location: '/' })).toMatchObject({ ok: false, reason: 'no_session_issued' })
    expect(classifyProbe('silent-authorize', 'positive', { status: 302, location: 'http://idp/login' })).toMatchObject({ ok: false, reason: 'redirect_to_idp_login' })
    expect(classifyProbe('credentials', 'positive', { status: 302, location: '/login?error=CredentialsSignin' })).toMatchObject({ ok: true })
    expect(classifyProbe('credentials', 'positive', { status: 302, location: '/login?error=maintenance' })).toMatchObject({ ok: false, reason: 'error_maintenance' })
  })
})

describe('EstateMaintenance.arm (AC10)', () => {
  function store(): MaintenanceSwitchStore & { row: MaintenanceSwitchRow | null; writes: number } {
    const s = {
      row: null as MaintenanceSwitchRow | null,
      writes: 0,
      read: async () => s.row,
      write: async (row: MaintenanceSwitchRow) => {
        s.row = row
        s.writes += 1
      },
    }
    return s
  }
  const OK: Record<string, ProbeObservation> = {
    'crm silent-authorize': { status: 302, location: '/maintenance' },
    'yobo silent-authorize': { status: 302, location: '/maintenance' },
    'commerce silent-authorize': { status: 302, location: '/maintenance' },
    'superhost silent-authorize': { status: 302, location: '/maintenance' },
    'yobo credentials': { status: 302, location: '/api/auth/error?error=maintenance' },
    'crm credentials': { status: 302, location: '/api/auth/error?error=maintenance' },
    'idp credentials': { status: 302, location: '/api/auth/error?error=maintenance' },
    'yobo bridge': { status: 503 },
    'crm bridge': { status: 503 },
    'superhost bridge': { status: 503 },
    'crm /maintenance': { status: 200, bodyText: 'Sign-in is paused for a few minutes' },
    'idp /maintenance': { status: 200, bodyText: 'Sign-in is paused for a few minutes' },
  }
  const POSITIVE: Record<string, ProbeObservation> = {
    'crm silent-authorize': { status: 302, location: '/', setCookie: ['next-auth.session-token=s1; Path=/'] },
    'yobo silent-authorize': { status: 302, location: '/', setCookie: ['next-auth.session-token=s2; Path=/'] },
    'commerce silent-authorize': { status: 302, location: '/', setCookie: ['next-auth.session-token=s3; Path=/'] },
    'superhost silent-authorize': { status: 302, location: '/', setCookie: ['next-auth.session-token=s4; Path=/'] },
    'yobo credentials': { status: 302, location: '/login?error=CredentialsSignin' },
    'crm credentials': { status: 302, location: '/login?error=CredentialsSignin' },
    'idp credentials': { status: 302, location: '/login?error=CredentialsSignin' },
  }
  const kindOf = (name: string): ProbeSurface['kind'] => (name.endsWith('silent-authorize') ? 'silent-authorize' : name.endsWith('credentials') ? 'credentials' : name.endsWith('bridge') ? 'bridge' : 'page')
  function surfaces(pausedOver: Record<string, ProbeObservation> = {}, positiveOver: Record<string, ProbeObservation> = {}): ProbeSurface[] {
    return Object.keys(OK).map((name) => ({ name, kind: kindOf(name), run: async (phase) => (phase === 'positive' ? { ...POSITIVE[name]!, ...positiveOver[name] } : { ...OK[name]!, ...pausedOver[name] }) }))
  }
  function maintenance(s: MaintenanceSwitchStore, probes: ProbeSurface[], log: string[] = []): EstateMaintenance {
    return new EstateMaintenance({ env: 'local', issuer: 'http://127.0.0.1:1', store: s, sign: async () => 'tok', rps: {}, audience: ['crm', 'yobo'], plan: PLAN, lock: { isHeld: async () => false }, probes, probeContext: { pausedText: 'Sign-in is paused' }, settleMs: 45_000, sleep: async (ms) => void log.push(`sleep ${ms}`), log: (l) => log.push(l) })
  }

  const failing: Array<[string, string, ProbeObservation, string]> = [
    ['a 404', 'crm /maintenance', { status: 404 }, 'not_found'],
    ['CredentialsSignin', 'yobo credentials', { status: 302, location: '/login?error=CredentialsSignin' }, 'credentials_signin'],
    ['a CSRF 4xx', 'crm credentials', { status: 403 }, 'csrf_4xx'],
    ['a redirect to the IdP login', 'superhost silent-authorize', { status: 302, location: 'http://idp/login?next=x' }, 'redirect_to_idp_login'],
    ['a 200 with a session cookie', 'yobo silent-authorize', { status: 200, setCookie: ['next-auth.session-token=leak; Path=/'] }, 'session_issued'],
    ['a bridge mint admitted', 'crm bridge', { status: 200 }, 'mint_admitted'],
  ]
  for (const [label, name, over, reason] of failing) {
    it(`AC10: a probed surface answers ${label} → exit 1 naming the surface and the reason, never prints armed, the switch stays on`, async () => {
      const s = store()
      const log: string[] = []
      const r = await maintenance(s, surfaces({ [name]: over }), log).arm({ reason: 'p77 cutover', operator: 'sean' })
      expect(r.armed).toBe(false)
      if (r.armed) return
      expect(r.error).toBe('probe_failed')
      expect(r.failures).toEqual([expect.objectContaining({ surface: name, reason })])
      expect(log).not.toContain('armed')
      expect(log.some((l) => l.startsWith('NOT armed') && l.includes(name) && l.includes(reason))).toBe(true)
      expect(s.row).toMatchObject({ active: true, jti: r.jti })
      expect(log).toContain('sleep 45000')
    })
  }

  it('AC10: every silent authorize → /maintenance with no cookie, every credentials POST → error=maintenance, every bridge 503, every page 200 after the 45 s settle → prints armed; the row was written BEFORE the settle and the paused probes', async () => {
    const s = store()
    const log: string[] = []
    const r = await maintenance(s, surfaces(), log).arm({ reason: 'p77 cutover', operator: 'sean' })
    expect(r.armed).toBe(true)
    expect(log.at(-1)).toBe('armed')
    expect(s.row).toMatchObject({ active: true, reason: 'p77 cutover', operator: 'sean', extensions: [], firstActivationAt: null, liftingSince: null })
    const rowAt = log.findIndex((l) => l.startsWith('row written'))
    const sleepAt = log.indexOf('sleep 45000')
    const firstPaused = log.findIndex((l) => l.startsWith('probe paused'))
    const lastPositive = log.map((l, i) => (l.startsWith('probe positive') ? i : -1)).filter((i) => i >= 0).pop()!
    expect(lastPositive).toBeLessThan(rowAt)
    expect(rowAt).toBeLessThan(sleepAt)
    expect(sleepAt).toBeLessThan(firstPaused)
    expect((await maintenance(s, surfaces(), log).arm({ reason: 'again', operator: 'sean' }))).toMatchObject({ armed: false, error: 'already_armed' })
  })

  it('AC10: the positive control fails (no session issued by a silent authorize; a wrong password not answered CredentialsSignin) → refuses to arm, no row written', async () => {
    const s = store()
    const r1 = await maintenance(s, surfaces({}, { 'yobo silent-authorize': { status: 302, location: '/', setCookie: [] } })).arm({ reason: 'x', operator: 'sean' })
    expect(r1).toMatchObject({ armed: false, error: 'positive_control_failed', failures: [expect.objectContaining({ surface: 'yobo silent-authorize', reason: 'no_session_issued', phase: 'positive' })] })
    const r2 = await maintenance(s, surfaces({}, { 'idp credentials': { status: 302, location: '/login?error=maintenance' } })).arm({ reason: 'x', operator: 'sean' })
    expect(r2).toMatchObject({ armed: false, error: 'positive_control_failed' })
    expect(s.row).toBeNull()
    expect(s.writes).toBe(0)
    expect((await maintenance(s, surfaces()).arm({ reason: 'x', operator: 'sean', probeIdentityPresent: false }))).toMatchObject({ armed: false, error: 'probe_identity_missing' })
  })
})

// =============================================================================
// AC9 — the lift, against the real estate
// =============================================================================

let e: Estate
let dbDown = false

beforeEach(async () => {
  const made = await startEstate({ systems: ['crm', 'yobo'] })
  if (!made) {
    dbDown = true
    return
  }
  e = made
})
afterEach(async () => {
  if (!dbDown && e) await e.close()
})
const skip = () => dbDown

function lifter(over: Partial<EstateMaintenanceDeps> = {}, log: string[] = []): EstateMaintenance {
  return new EstateMaintenance({
    env: 'local',
    issuer: e.idp.issuer,
    store: e.idp.store,
    sign: e.idp.sign,
    plan: PLAN,
    rps: e.clientsWith(() => null),
    audience: ['crm', 'yobo'],
    lock: { isHeld: async () => false },
    now: e.clock.now,
    log: (l) => log.push(l),
    ...over,
  })
}

const cutoverToken = () => createRemintingTokenProvider({ store: e.idp.store, sign: e.idp.sign, issuer: e.idp.issuer, env: 'local', audience: ['crm', 'yobo'], ops: ['prepare', 'fence', 'activate', 'release', 'deactivate', 'reconcile'], now: e.clock.now })

async function seedPerson(): Promise<void> {
  e.idp.connect.addUser({ id: 101 })
  e.idp.connect.bind('crm', '1', 101)
  await seedUser(e.rps.crm!.db.sql, { id: 1, email: 'sean@example.test', password: A, connectSub: '101', issuer: e.idp.issuer })
}

describe('EstateMaintenance.lift (AC9, P77-13 / P77-23)', () => {
  it('AC9: rotates the jti BEFORE anything else, calls drain on every RP before any release or count; a token minted before the lift is refused operator_superseded by the RP route and by Connect afterwards', async () => {
    if (skip()) return
    await seedPerson()
    for (let i = 2; i <= 7; i += 1) await seedUser(e.rps.crm!.db.sql, { id: i, email: `u${i}@example.test`, password: bcryptLike(`h${i}`) })
    await e.idp.arm('J1')
    const old = cutoverToken()
    const oldToken = await old.refresh()
    expect(decodeJwtPayload(oldToken)!.jti).toBe('J1')
    const log: string[] = []
    const r = await lifter({}, log).lift()
    expect(r).toMatchObject({ lifted: true, drained: { crm: 0, yobo: 0 } })
    // (i) rotate was the FIRST row write, with lifting_since; (iii) drain preceded every state/release on every RP.
    expect(e.idp.switchWrites[1]).toMatchObject({ active: true, liftingSince: expect.any(String) })
    expect(e.idp.switchWrites[1]!.jti).not.toBe('J1')
    expect(e.idp.switchWrites.at(-1)).toMatchObject({ active: false, jti: null, liftingSince: null, liftedAt: expect.any(String) })
    for (const rp of [e.rps.crm!, e.rps.yobo!]) {
      expect(rp.ops[0]).toBe('drain')
      expect(rp.ops.indexOf('drain')).toBeLessThan(rp.ops.indexOf('state'))
    }
    // The pre-activation contract lifted with eligibleLocal 7 and the flags off.
    expect(log.some((l) => l.startsWith('lifted at'))).toBe(true)
    // The old token is dead at the RP (the switch is off now → maintenance_off; re-armed with a new jti → superseded) and at Connect.
    const off = await e.rps.crm!.client.withOperatorToken(() => oldToken).prepare('1', 'import')
    expect(off).toMatchObject({ status: 403, json: { error: 'maintenance_off' } })
    await e.idp.arm('J3')
    const superseded = await e.rps.crm!.client.withOperatorToken(() => oldToken).prepare('1', 'import')
    expect(superseded).toMatchObject({ status: 403, json: { error: 'operator_superseded' } })
    const atConnect = await fetch(`${e.idp.issuer}/api/internal/connect/handoff/state`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Internal-API-Key': e.idp.rpKey, 'X-Service-Name': 'crm', 'X-Cutover-Operator': oldToken }, body: JSON.stringify({ sourceUserRef: '1' }) })
    expect(atConnect.status).toBe(403)
    expect(await atConnect.json()).toEqual({ error: 'operator_superseded' })
  })

  it('AC9: pre-activation — an open handoff and no --abort → 409 lift_refused open_handoffs (lifting_since cleared, the rotated jti kept); --abort releases every open handoff then lifts; mint is refused while lifting unless for the lifter', async () => {
    if (skip()) return
    await seedPerson()
    await e.idp.arm('J1')
    const token = cutoverToken()
    await token.refresh()
    const crm = e.rps.crm!.client.withOperatorToken(() => token.current())
    expect((await crm.prepare('1', 'import')).status).toBe(200)
    expect((await readUser(e.rps.crm!.db.sql, 1))!.authority).toBe('prepared')

    const refused = await lifter().lift()
    expect(refused).toMatchObject({ lifted: false, status: 409, error: 'lift_refused', gate: 'open_handoffs' })
    const rotated = (refused as { rotatedJti: string }).rotatedJti
    expect(e.idp.switchRow).toMatchObject({ active: true, jti: rotated, liftingSince: null })
    expect(rotated).not.toBe('J1')
    expect((await readUser(e.rps.crm!.db.sql, 1))!.authority).toBe('prepared') // nothing released without --abort
    // While a lift is in progress nobody but the lifter mints.
    await e.idp.store.write({ ...e.idp.switchRow!, liftingSince: new Date().toISOString() })
    await expect(cutoverToken().refresh()).rejects.toBeInstanceOf(MintRefusedError)
    expect(await lifter().mintOperatorToken(['drain'], { forLifter: true })).toMatch(/^eyJ/)
    await e.idp.store.write({ ...e.idp.switchRow!, liftingSince: null })

    const aborted = await lifter().lift({ abort: true })
    expect(aborted).toMatchObject({ lifted: true, released: [{ system: 'crm', sourceUserRef: '1', outcome: 'released' }] })
    expect((await readUser(e.rps.crm!.db.sql, 1))).toMatchObject({ authority: 'local', password: A })
    expect((await handoffRows(e.rps.crm!.db.sql, 1))[0]).toMatchObject({ state: 'failed' })
    expect(e.idp.connect.receipt('crm', '1')).toMatchObject({ state: 'failed' })
    expect(e.idp.connect.staged.size).toBe(0)
    expect(e.idp.switchRow).toMatchObject({ active: false, jti: null, firstActivationAt: null })
    // The ops the abort ran on crm, in order: drain, state (the open handoffs), release, state (the count).
    expect(e.rps.crm!.ops.slice(-4)).toEqual(['drain', 'state', 'release', 'state'])
    expect((await leaseRows(e.rps.crm!.db.sql)).every((l) => l.finished)).toBe(true)
  })

  it('AC9: post-activation — --abort → 409 activated_roll_forward_only; off refuses counts, then flag, then g1, then g5 in order; every refusal leaves lifting_since NULL and the rotated jti; then lifts with everything green', async () => {
    if (skip()) return
    await seedPerson()
    await seedUser(e.rps.crm!.db.sql, { id: 2, email: 'other@example.test', password: bcryptLike('h2') })
    await e.idp.arm('J1')
    const token = cutoverToken()
    await token.refresh()
    const crm = e.rps.crm!.client.withOperatorToken(() => token.current())
    expect((await crm.prepare('1', 'import')).status).toBe(200)
    expect((await crm.fence('1')).json).toMatchObject({ ok: true })
    expect((await crm.activate('1')).json).toMatchObject({ ok: true, outcome: 'activated' })
    expect(e.idp.switchRow!.firstActivationAt).not.toBeNull()
    expect((await readUser(e.rps.crm!.db.sql, 1))).toMatchObject({ authority: 'connect', password: null })

    const abort = await lifter().lift({ abort: true })
    expect(abort).toMatchObject({ lifted: false, status: 409, error: 'activated_roll_forward_only' })
    const jtiAfterAbort = e.idp.switchRow!.jti!
    expect(e.idp.switchRow).toMatchObject({ active: true, liftingSince: null })
    expect(jtiAfterAbort).not.toBe('J1')

    const counts = await lifter().lift()
    expect(counts).toMatchObject({ lifted: false, error: 'lift_refused', gate: 'counts' })
    expect((counts as { detail: string }).detail).toContain('eligibleLocal 1')
    expect(e.idp.switchRow!.jti).not.toBe(jtiAfterAbort) // every lift rotates
    expect(e.idp.switchRow!.liftingSince).toBeNull()

    // The abort attempt rotated the jti: the driver's old token is dead at the RP (D23).
    expect(await crm.prepare('2', 'recover')).toMatchObject({ status: 403, json: { error: 'operator_superseded' } })
    // Move the remaining row (by hand, standing in for a fixed row + rerun), then the flags.
    await e.rps.crm!.db.sql.execute(`UPDATE users SET credential_authority = 'connect', password = NULL WHERE id = 2`)
    expect(await lifter().lift()).toMatchObject({ lifted: false, gate: 'flag' })
    e.rps.crm!.flag.on = true
    e.rps.yobo!.flag.on = true
    const g1 = await lifter({ gates: { g1: async () => ({ ok: false, reason: 'redirect_uri_mismatch' }) } }).lift()
    expect(g1).toMatchObject({ lifted: false, gate: 'g1', detail: 'redirect_uri_mismatch' })
    const g5 = await lifter({ gates: { g5: async (system) => (system === 'yobo' ? { ok: false, reason: '404 on /maintenance' } : { ok: true }) } }).lift()
    expect(g5).toMatchObject({ lifted: false, gate: 'g5' })
    expect((g5 as { detail: string }).detail).toContain('yobo')
    expect(e.idp.switchRow).toMatchObject({ active: true, liftingSince: null })

    const log: string[] = []
    const ok = await lifter({ gates: { g1: async () => ({ ok: true }), g5: async () => ({ ok: true }) } }, log).lift()
    expect(ok).toMatchObject({ lifted: true, extensions: [] })
    expect(e.idp.switchRow).toMatchObject({ active: false, jti: null, liftedAt: expect.any(String) })
    expect(log.at(-1)).toMatch(/^lifted at .* the window lasted \d+ min with 0 extension\(s\)$/)
  })

  it('AC9: gate (a) — a live driver holding the advisory lock → 409 lift_refused lock; an RP whose drain fails → lift_refused drain; not armed → 409 not_armed', async () => {
    if (skip()) return
    expect(await lifter().lift()).toEqual({ lifted: false, status: 409, error: 'not_armed' })
    await e.idp.arm('J1')
    expect(await e.lock.tryAcquire('local')).toBe(true)
    const held = await lifter({ lock: e.lockFor() }).lift()
    expect(held).toMatchObject({ lifted: false, gate: 'lock' })
    await e.lock.release('local')
    await e.rps.yobo!.server.close()
    const drain = await lifter().lift()
    expect(drain).toMatchObject({ lifted: false, gate: 'drain' })
    expect((drain as { detail: string }).detail).toContain('yobo drain')
    expect(e.idp.switchRow).toMatchObject({ active: true, liftingSince: null })
  })

  it('extend is recorded on the row and repeatable; status reports the row, the age, over-budget and per-RP state incl. inFlightOps', async () => {
    if (skip()) return
    await e.idp.arm('J1')
    e.idp.switchRow = { ...e.idp.switchRow!, since: new Date(e.clock.t - 61 * 60_000).toISOString() }
    const s0 = await lifter().status()
    expect(s0.overBudget).toBe(true)
    expect(s0.ageMs).toBeGreaterThan(60 * 60_000)
    expect(s0.rps.crm).toMatchObject({ counts: { inFlightOps: 0 } })
    const ext = await lifter().extend({ minutes: 15, reason: 'yobo rows remain' })
    expect(ext).toMatchObject({ ok: true, extensions: [{ minutes: 15, reason: 'yobo rows remain' }] })
    const ext2 = await lifter().extend({ minutes: 10, reason: 'still going' })
    expect(ext2.ok && ext2.extensions).toHaveLength(2)
    expect(Date.parse((ext2 as { extendedUntil: string }).extendedUntil) - Date.parse((ext as { extendedUntil: string }).extendedUntil)).toBe(10 * 60_000)
    expect((await lifter().status()).overBudget).toBe(false)
    expect(await lifter().extend({ minutes: 5, reason: 'x' }).then(() => lifter().lift()).then((r) => r.lifted)).toBe(true)
    expect(await lifter().extend({ minutes: 5, reason: 'x' })).toMatchObject({ ok: false, error: 'not_armed' })
  })
})

// =============================================================================
// §3.4 IssuerBackfill and §3.5 EmailReconcile
// =============================================================================

describe('IssuerBackfill (§3.4) and EmailReconcile (§3.5)', () => {
  function directory(): ConnectDirectory & { registered: string[] } {
    const d = {
      registered: [] as string[],
      lookupSubject: async (sub: string) => {
        const u = e.idp.connect.users.get(Number(sub))
        return u ? { id: u.id, email: `u${u.id}@example.test`, active: u.active } : null
      },
      registerMapping: async (system: RpSystem, ref: string, sub: string) => {
        d.registered.push(`${system}:${ref}→${sub}`)
        e.idp.connect.bind(system, ref, Number(sub))
        return 'registered' as const
      },
    }
    return d
  }
  const repairToken = () => createRemintingTokenProvider({ store: e.idp.store, sign: e.idp.sign, issuer: e.idp.issuer, env: 'local', audience: ['crm', 'yobo'], ops: ['stamp-issuer', 'quarantine-binding'], now: e.clock.now })

  it('refuses with the switch off; with it on: stamps known subjects (registering the mapping FIRST), quarantines unknown / inactive / mismatched ones, maps already-upgraded rows; a cutover token cannot do it', async () => {
    if (skip()) return
    e.idp.connect.addUser({ id: 201 })
    e.idp.connect.addUser({ id: 202, active: false })
    e.idp.connect.addUser({ id: 203 })
    await seedUser(e.rps.crm!.db.sql, { id: 1, email: 'u201@example.test', connectSub: '201' }) // half-bound, known → stamp
    await seedUser(e.rps.crm!.db.sql, { id: 2, email: 'u202@example.test', connectSub: '202' }) // inactive → quarantine
    await seedUser(e.rps.crm!.db.sql, { id: 3, email: 'other@example.test', connectSub: '203' }) // email mismatch → quarantine
    await seedUser(e.rps.crm!.db.sql, { id: 4, email: 'u999@example.test', connectSub: '999' }) // unknown → quarantine
    await seedUser(e.rps.crm!.db.sql, { id: 5, email: 'u5@example.test', connectSub: 'abc' }) // not numeric → quarantine
    await seedUser(e.rps.crm!.db.sql, { id: 6, email: 'u201@example.test', connectSub: '201', issuer: e.idp.issuer }) // D9-upgraded, unmapped → map only
    await seedUser(e.rps.crm!.db.sql, { id: 7, email: 'u7@example.test' }) // unbound → skip
    const dir = directory()
    const off = await new IssuerBackfill({ env: 'local', issuer: e.idp.issuer, rps: { crm: e.rps.crm!.client.withOperatorToken(() => null) }, directory: dir, readSwitch: () => e.idp.store.read(), token: repairToken(), execute: true }).run()
    expect(off.refusal).toMatch(/maintenance_required/)
    expect(e.rps.crm!.ops).toEqual([])

    await e.idp.arm('J1')
    const dry = await new IssuerBackfill({ env: 'local', issuer: e.idp.issuer, rps: { crm: e.rps.crm!.client }, directory: dir, readSwitch: () => e.idp.store.read(), token: repairToken(), execute: false }).run()
    expect(dry.rows.map((r) => [r.sourceUserRef, r.plan, r.reason])).toEqual([
      ['1', 'stamp', null],
      ['2', 'quarantine', 'subject_inactive'],
      ['3', 'quarantine', 'email_mismatch'],
      ['4', 'quarantine', 'subject_unknown'],
      ['5', 'quarantine', 'subject_not_numeric'],
      ['6', 'map_only', null],
      ['7', 'skip', 'unbound'],
    ])
    expect(dir.registered).toEqual([])
    expect((await readUser(e.rps.crm!.db.sql, 1))!.issuer).toBeNull()

    const token = repairToken()
    const run = await new IssuerBackfill({ env: 'local', issuer: e.idp.issuer, rps: { crm: e.rps.crm!.client.withOperatorToken(() => token.current()) }, directory: dir, readSwitch: () => e.idp.store.read(), token, execute: true }).run()
    expect(run.exitCode).toBe(0)
    expect(run.counts.crm).toEqual({ stamped: 1, mapped: 1, quarantined: 4, skipped: 1, refused: 0 })
    expect(dir.registered).toEqual(['crm:1→201', 'crm:6→201'])
    expect((await readUser(e.rps.crm!.db.sql, 1))).toMatchObject({ issuer: e.idp.issuer, sub: '201' })
    expect((await readUser(e.rps.crm!.db.sql, 1))!.mappedAt).not.toBeNull()
    expect((await readUser(e.rps.crm!.db.sql, 6))!.mappedAt).not.toBeNull()
    for (const id of [2, 3, 4, 5]) expect((await readUser(e.rps.crm!.db.sql, id))).toMatchObject({ issuer: null, sub: null })
    expect((await e.rps.crm!.db.sql.execute(`SELECT local_user_id, reason FROM connect_binding_quarantine ORDER BY local_user_id`)).map((r) => [Number(r.local_user_id), r.reason])).toEqual([[2, 'subject_inactive'], [3, 'email_mismatch'], [4, 'subject_unknown'], [5, 'subject_not_numeric']])
    // Register BEFORE stamp: every quarantine/stamp op on the RP came after the directory write for that row.
    expect(e.rps.crm!.ops.filter((o) => o !== 'inventory')).toEqual(['quarantine-binding', 'quarantine-binding', 'quarantine-binding', 'quarantine-binding', 'stamp-issuer'])
    // A cutover token (no stamp-issuer op) is refused op_not_permitted and the run reports it.
    const wrong = cutoverToken()
    const bad = await new IssuerBackfill({ env: 'local', issuer: e.idp.issuer, rps: { crm: e.rps.crm!.client.withOperatorToken(() => wrong.current()) }, directory: dir, readSwitch: () => e.idp.store.read(), token: wrong, execute: true }).run()
    expect(bad.exitCode).toBe(0) // nothing left to do: every row is mapped, quarantined or unbound
    await seedUser(e.rps.crm!.db.sql, { id: 8, email: 'u203@example.test', connectSub: '203' })
    const bad2 = await new IssuerBackfill({ env: 'local', issuer: e.idp.issuer, rps: { crm: e.rps.crm!.client.withOperatorToken(() => wrong.current()) }, directory: dir, readSwitch: () => e.idp.store.read(), token: wrong, execute: true }).run()
    expect(bad2.exitCode).toBe(1)
    expect(bad2.rows.find((r) => r.sourceUserRef === '8')!.outcome).toBe('op_not_permitted')
  })

  it('EmailAudit lists duplicate groups; EmailReconcile refuses merge, requires the switch, retires on the RP’s word, treats already_retired as done on a rerun, refuses a bad decision', async () => {
    if (skip()) return
    await seedUser(e.rps.crm!.db.sql, { id: 1, email: 'Dup@Example.test' })
    await seedUser(e.rps.crm!.db.sql, { id: 2, email: 'dup@example.test', active: false })
    await seedUser(e.rps.crm!.db.sql, { id: 3, email: 'solo@example.test' })
    const groups = await auditEmailDuplicates({ crm: e.rps.crm!.client }, 'local')
    expect(groups).toEqual([{ system: 'crm', email: 'dup@example.test', members: [expect.objectContaining({ id: 1, isActive: true }), expect.objectContaining({ id: 2, isActive: false })] }])
    expect(() => validateDecisions([{ email: 'dup@example.test', surviving: 1, retire: [1], reason: 'x' }])).toThrow(/survivor/)
    const token = createRemintingTokenProvider({ store: e.idp.store, sign: e.idp.sign, issuer: e.idp.issuer, env: 'local', audience: ['crm'], ops: ['retire-email'], now: e.clock.now })
    const deps = { env: 'local' as const, rps: { crm: e.rps.crm!.client.withOperatorToken(() => token.current()) }, readSwitch: () => e.idp.store.read(), token, execute: true }
    const merge = await new EmailReconcile({ ...deps, decisions: validateDecisions([{ email: 'dup@example.test', merge: true }]) }).run()
    expect(merge.refusal).toMatch(/merge_not_supported/)
    const decisions = validateDecisions([{ email: 'dup@example.test', surviving: 1, retire: [2], reason: 'inactive duplicate' }])
    expect((await new EmailReconcile({ ...deps, decisions }).run()).refusal).toMatch(/maintenance_required/)
    await e.idp.arm('J1')
    const dry = await new EmailReconcile({ ...deps, decisions, execute: false }).run()
    expect(dry.results).toEqual([{ system: 'crm', email: 'dup@example.test', userId: 2, survivingUserId: 1, outcome: 'would_retire' }])
    const survivorBefore = await readUser(e.rps.crm!.db.sql, 1)
    const run = await new EmailReconcile({ ...deps, decisions }).run()
    expect(run.exitCode).toBe(0)
    expect(run.results).toEqual([{ system: 'crm', email: 'dup@example.test', userId: 2, survivingUserId: 1, outcome: 'retired' }])
    expect((await readUser(e.rps.crm!.db.sql, 2))).toMatchObject({ email: 'retired+2@retired.invalid', active: false })
    expect(await readUser(e.rps.crm!.db.sql, 1)).toEqual(survivorBefore)
    expect((await e.rps.crm!.db.sql.execute(`SELECT count(*)::int AS n FROM connect_session_revocations WHERE local_user_id = 2`))[0]!.n).toBe(1)
    // The audit is clean now (a retired row is out of every group); a rerun of the decisions answers already_retired.
    expect(await auditEmailDuplicates({ crm: e.rps.crm!.client }, 'local')).toEqual([])
    const again = await new EmailReconcile({ ...deps, decisions }).run()
    expect(again.results).toEqual([{ system: 'crm', email: 'dup@example.test', userId: 2, survivingUserId: 1, outcome: 'satisfied' }])
    expect(again.exitCode).toBe(0)
    const direct = await e.rps.crm!.client.withOperatorToken(() => token.current()).retireEmail('2', 1, 'dup@example.test', 'inactive duplicate')
    expect(direct.json).toMatchObject({ outcome: 'already_retired' })
    const changed = await e.rps.crm!.client.withOperatorToken(() => token.current()).retireEmail('3', 1, 'dup@example.test', 'x')
    expect(changed).toMatchObject({ status: 409, json: { error: 'source_changed' } })
  })
})


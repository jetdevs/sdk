/**
 * p77 STORY-005 — the jwt-callback enforcement (AC2), the three maintenance
 * seams, the identifier-first login resolution, and the back-channel logout
 * route — against the REAL loopback IdP (JWKS, the maintenance route from a
 * switch row, the account-version lookup) and a REAL local Postgres ledger.
 * No module mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BACKCHANNEL_LOGOUT_EVENT } from '../../server/revocation/logout-token.js'
import { __resetRevocationCacheForTests } from '../../server/revocation/ledger.js'
import { __resetFreshnessCachesForTests } from '../../server/revocation/freshness.js'
import { __resetJwksCacheForTests } from '../../server/revocation/logout-token.js'
import { __resetMaintenanceCacheForTests } from '../../server/revocation/maintenance.js'
import { signJwt } from '../../server/revocation/__tests__/support/fake-idp.js'
import { createBackchannelLogoutRoute } from '../backchannel-route.js'
import { refusedToken, resolveEpochEnforcementMode, stampOnSignIn, withEpochEnforcement } from '../epoch-enforcement.js'
import { connectOwnerLoginResolution } from '../login-resolution.js'
import {
  MAINTENANCE_PAGE_TEXT,
  MaintenanceRefusedError,
  assertNotInMaintenance,
  createMaintenancePage,
  isMaintenanceRefused,
  maintenanceAuthorize,
  maintenanceErrorText,
  maintenanceGate,
  maintenancePageHtml,
  maintenanceResponseIfPaused,
} from '../maintenance.js'
import { startFakeEstateIdp, type FakeEstateIdp } from './support/estate-idp.js'
import { openPgTestDb, seedUser, type PgTestDb } from './support/pg-adapter.js'

let idp: FakeEstateIdp
let db: PgTestDb | null
let dbDown = false

beforeEach(async () => {
  __resetMaintenanceCacheForTests()
  __resetFreshnessCachesForTests()
  __resetRevocationCacheForTests()
  __resetJwksCacheForTests()
  idp = await startFakeEstateIdp()
  db = await openPgTestDb('p77_gates')
  if (!db) dbDown = true
})
afterEach(async () => {
  await idp.stop()
  await db?.close()
})

// =============================================================================
// AC2 — warn vs enforce in the jwt callback
// =============================================================================

describe('withEpochEnforcement (AC2, D20)', () => {
  const staleSession = (cv = 1): Record<string, unknown> & { userId?: number; authTime?: number } => ({ userId: 5, iat: 1_700_000_000, connectIssuer: idp.issuer, connectSub: '505', connectKind: 'app_local' as const, connectCv: cv, name: 'x' })

  it('AC2: warn — a stale-epoch session is admitted and ONE would_refuse line is logged; enforce — refused with the userId: 0 shape', async () => {
    if (dbDown) return
    await seedUser(db!.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: idp.issuer, authority: 'connect' })
    idp.accountVersion.set('505|5', { found: true, cv: 2, active: true, epoch: 'fresh', grant: 'live' })
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() }
    const deps = { execute: db!.sql.execute, lookup: { issuer: idp.issuer, rpKey: idp.rpKey }, logger }

    const warn = withEpochEnforcement('warn', deps)
    const admitted = await warn(staleSession())
    expect(admitted.userId).toBe(5)
    expect(admitted.authTime).toBe(1_700_000_000)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(String(logger.warn.mock.calls[0]![0])).toBe('[connect-epoch] would_refuse stale')

    const enforce = withEpochEnforcement('enforce', deps)
    const refused = await enforce(staleSession())
    expect(refused).toMatchObject({ userId: 0, sub: undefined, name: 'x' })
    expect(logger.warn).toHaveBeenCalledTimes(1) // no second would_refuse line in enforce

    // A session carrying the live version passes enforce (the mirror rose to 2 on the stale read and stays there).
    expect((await enforce(staleSession(2))).userId).toBe(5)
  })

  it('a legacy Connect session (no cv/aeid, no access token) is no_epoch: admitted in warn, refused in enforce (D15/D20); a local session with no binding reads the mirror', async () => {
    if (dbDown) return
    await seedUser(db!.sql, { id: 6, email: 'l@example.test', password: null })
    await seedUser(db!.sql, { id: 7, email: 'c@example.test', connectSub: '707', issuer: idp.issuer, authority: 'connect' })
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() }
    const deps = { execute: db!.sql.execute, lookup: { issuer: idp.issuer, rpKey: idp.rpKey }, logger }
    const legacy = () => ({ userId: 7, iat: 1_700_000_000, connectIssuer: idp.issuer, connectSub: '707' })
    expect((await withEpochEnforcement('warn', deps)(legacy())).userId).toBe(7)
    expect(String(logger.warn.mock.calls[0]![0])).toBe('[connect-epoch] would_refuse no_epoch')
    expect((await withEpochEnforcement('enforce', deps)(legacy())).userId).toBe(0)
    expect((await withEpochEnforcement('enforce', deps)({ userId: 6, iat: 1_700_000_000, localCv: 1 })).userId).toBe(6)
    expect(resolveEpochEnforcementMode('enforce')).toBe('enforce')
    expect(resolveEpochEnforcementMode('ENFORCE ')).toBe('enforce')
    expect(resolveEpochEnforcementMode(undefined)).toBe('warn')
    expect(resolveEpochEnforcementMode('strict')).toBe('warn')
    expect(refusedToken({ userId: 9, sub: 'x' })).toEqual({ userId: 0, sub: undefined })
  })

  it('stampOnSignIn: an app_local epoch stamps issuer/sub/cv/kind and no aeid; a derived epoch is inherited verbatim with the parent authTime; a plain local sign-in reads localCv from users', async () => {
    if (dbDown) return
    await seedUser(db!.sql, { id: 8, email: 'o@example.test' })
    await db!.sql.execute(`UPDATE users SET credential_version = 4 WHERE id = 8`)
    const deps = { execute: db!.sql.execute, nowMs: 1_800_000_000_000 }
    const otp: Record<string, unknown> = {}
    await stampOnSignIn(otp, { provider: 'credentials' }, { id: 8, epoch: { kind: 'app_local', issuer: idp.issuer, sub: '808', cv: 3 } }, deps)
    expect(otp).toEqual({ authTime: 1_800_000_000, connectIssuer: idp.issuer, connectSub: '808', connectCv: 3, connectKind: 'app_local' })
    const bridge: Record<string, unknown> = { connectAccessToken: 'stale' }
    await stampOnSignIn(bridge, { provider: 'token-exchange' }, { id: 8, epoch: { kind: 'derived', issuer: idp.issuer, sub: '808', cv: 3, aeid: 'E1', grantId: 'G1', sid: 'S1', authTime: 1_700_000_000 } }, deps)
    expect(bridge).toEqual({ authTime: 1_700_000_000, connectIssuer: idp.issuer, connectSub: '808', connectCv: 3, connectKind: 'oidc', connectAeid: 'E1', connectGrantId: 'G1', connectSid: 'S1' })
    const local: Record<string, unknown> = {}
    await stampOnSignIn(local, { provider: 'credentials' }, { id: 8 }, deps)
    expect(local).toEqual({ authTime: 1_800_000_000, localCv: 4 })
  })
})

// =============================================================================
// The three seams (D26)
// =============================================================================

describe('maintenanceGate / maintenanceAuthorize / assertNotInMaintenance', () => {
  const read = () => ({ issuer: idp.issuer, rpKey: idp.rpKey, maxAgeMs: 0 })

  it('while the switch is on: signIn returns /maintenance before the wrapped callback runs; authorize throws maintenance before the wrapped function runs (nothing consumed); the write gate throws core’s refusal shape; the mint answers 503 + Retry-After', async () => {
    await idp.arm('J1')
    const inner = vi.fn(async (..._args: unknown[]) => true)
    expect(await maintenanceGate(inner, { read: read() })({ user: { id: 1 } })).toBe('/maintenance')
    expect(inner).not.toHaveBeenCalled()
    const authorize = vi.fn(async (..._args: unknown[]) => ({ id: '1' }))
    await expect(maintenanceAuthorize(authorize, { read: read() })({ email: 'x' }, {})).rejects.toBeInstanceOf(MaintenanceRefusedError)
    expect(authorize).not.toHaveBeenCalled()
    let thrown: unknown
    try {
      await assertNotInMaintenance({ read: read() })({ operation: 'change-password', db: null })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toMatchObject({ kind: 'credential_write_refused', reason: 'maintenance', status: 503, retryAfterSeconds: 60, name: 'TRPCError', code: 'SERVICE_UNAVAILABLE' })
    expect(isMaintenanceRefused(new MaintenanceRefusedError())).toBe(true)
    const res = await maintenanceResponseIfPaused({ read: read() })
    expect(res?.status).toBe(503)
    expect(res?.headers.get('retry-after')).toBe('60')
    expect(await res?.json()).toEqual({ error: 'maintenance' })
  })

  it('with the switch off every seam admits; unreadable (500 with no good read) is treated as ACTIVE — fail closed', async () => {
    const inner = vi.fn(async (..._args: unknown[]) => true)
    expect(await maintenanceGate(inner, { read: read() })({})).toBe(true)
    expect(await maintenanceAuthorize(async () => 'ok', { read: read() })()).toBe('ok')
    await assertNotInMaintenance({ read: read() })({ operation: 'invite', db: null })
    expect(await maintenanceResponseIfPaused({ read: read() })).toBeNull()
    __resetMaintenanceCacheForTests()
    idp.maintenanceStatusOverride = 500
    const logger = { warn: vi.fn() }
    expect(await maintenanceGate(inner, { read: read(), logger })({})).toBe('/maintenance')
    expect(logger.warn).toHaveBeenCalled()
    idp.maintenanceStatusOverride = 404
    await expect(maintenanceAuthorize(async () => 'ok', { read: read() })()).rejects.toMatchObject({ code: 'maintenance' })
  })

  it('the page and the error mapping carry one text; the component is built from the app’s createElement', () => {
    expect(maintenanceErrorText('maintenance')).toBe(MAINTENANCE_PAGE_TEXT)
    expect(maintenanceErrorText('CredentialsSignin')).toBeNull()
    expect(maintenancePageHtml()).toContain(MAINTENANCE_PAGE_TEXT)
    const h = vi.fn((type: string, _props: unknown, ...children: unknown[]) => ({ type, children }))
    const Page = createMaintenancePage(h)
    const tree = Page() as { type: string; children: Array<{ type: string; children: string[] }> }
    expect(tree.type).toBe('main')
    expect(tree.children[1]!.children[0]).toBe(MAINTENANCE_PAGE_TEXT)
  })
})

// =============================================================================
// Identifier-first login resolution
// =============================================================================

describe('connectOwnerLoginResolution', () => {
  it('external owner → redirect with login_hint; local / none / frozen → password-field; unknown vs local take the same floor time', async () => {
    const resolver = vi.fn(async ({ user, email }: { user: unknown; email: string | null }) =>
      user ? (email === 'sean@example.test' ? { kind: 'external' as const, issuer: idp.issuer, providerId: 'yobo-connect', accountUrl: 'a', resetUrl: 'r' } : { kind: 'local' as const }) : { kind: 'none' as const },
    )
    const t = { now: 0 }
    const slept: number[] = []
    const resolve = connectOwnerLoginResolution(resolver, { minMs: 100, now: () => t.now, sleep: async (ms) => void slept.push(ms) })
    expect(await resolve('Sean@Example.test', { db: null, user: { id: 1 } })).toEqual({ kind: 'redirect', issuer: idp.issuer, providerId: 'yobo-connect', loginHint: 'sean@example.test' })
    t.now = 30
    expect(await resolve('local@example.test', { db: null, user: { id: 2 } })).toEqual({ kind: 'password-field' })
    expect(await resolve('nobody@example.test', { db: null, user: null })).toEqual({ kind: 'password-field' })
    expect(resolver).toHaveBeenCalledTimes(3)
    expect(resolver.mock.calls[2]![0]).toMatchObject({ operation: 'login-form', user: null, email: 'nobody@example.test' })
    // Every answer is padded to the floor whatever the resolver did (the clock did not move inside the call).
    expect(slept).toEqual([100, 100, 100])
    const throwing = connectOwnerLoginResolution(async () => { throw new Error('db down') }, { minMs: 0 })
    expect(await throwing('x@example.test', { db: null, user: null })).toEqual({ kind: 'password-field' })
  })
})

// =============================================================================
// The back-channel logout route
// =============================================================================

describe('createBackchannelLogoutRoute — 200 / 400 / 503', () => {
  const nowS = () => Math.floor(Date.now() / 1000)
  const logoutToken = (over: Record<string, unknown> = {}) =>
    signJwt(idp.key, { iss: idp.issuer, aud: 'crm', iat: nowS(), jti: `jti-${Math.random().toString(36).slice(2)}`, sub: '505', sid: 'S1', cv: 2, events: { [BACKCHANNEL_LOGOUT_EVENT]: {} }, ...over }, { typ: 'logout+jwt' })
  const post = (route: ReturnType<typeof createBackchannelLogoutRoute>, body: string, contentType = 'application/x-www-form-urlencoded') =>
    route.POST(new Request('http://rp.test/api/auth/connect/backchannel-logout', { method: 'POST', headers: { 'content-type': contentType }, body }))

  it('a good token → 200 and the ledger rows land (the local user resolved by the pair); the same jti again → 400 replay, nothing re-applied; invalidateLocalSessions ran once', async () => {
    if (dbDown) return
    await seedUser(db!.sql, { id: 5, email: 'p@example.test', connectSub: '505', issuer: idp.issuer, authority: 'connect' })
    const invalidated: number[] = []
    const logger = { warn: vi.fn(), error: vi.fn(), log: vi.fn() }
    const route = createBackchannelLogoutRoute({ db: db!.sql, verify: { issuer: idp.issuer, clientId: 'crm' }, adapter: { invalidateLocalSessions: async (id) => void invalidated.push(id) }, logger })
    const token = logoutToken()
    const ok = await post(route, `logout_token=${encodeURIComponent(token)}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect((await db!.sql.execute(`SELECT count(*)::int AS n FROM connect_session_revocations WHERE local_user_id = 5 AND connect_sid = 'S1'`))[0]!.n).toBe(1)
    expect((await db!.sql.execute(`SELECT credential_version FROM users WHERE id = 5`))[0]!.credential_version).toBe(2)
    expect(invalidated).toEqual([5])
    const replay = await post(route, `logout_token=${encodeURIComponent(token)}`)
    expect(replay.status).toBe(400)
    expect(await replay.json()).toEqual({ error: 'invalid_request' })
    expect((await db!.sql.execute(`SELECT count(*)::int AS n FROM connect_session_revocations`))[0]!.n).toBe(1)
    expect(invalidated).toEqual([5])
  })

  it('a bad signature / wrong content-type / no token → 400; JWKS unreachable → 503 (transient, nothing recorded); the store down → 503; GET → 405 Allow: POST', async () => {
    if (dbDown) return
    const route = createBackchannelLogoutRoute({ db: db!.sql, verify: { issuer: idp.issuer, clientId: 'crm' }, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } })
    expect((await post(route, `logout_token=${encodeURIComponent(logoutToken({ iss: 'https://evil.example' }))}`)).status).toBe(400)
    expect((await post(route, JSON.stringify({ logout_token: logoutToken() }), 'application/json')).status).toBe(400)
    expect((await post(route, 'nothing=here')).status).toBe(400)
    idp.jwksDown = true
    __resetJwksCacheForTests()
    const down = await post(route, `logout_token=${encodeURIComponent(logoutToken())}`)
    expect(down.status).toBe(503)
    expect(await down.json()).toEqual({ error: 'temporarily_unavailable' })
    expect((await db!.sql.execute(`SELECT count(*)::int AS n FROM connect_logout_tokens`))[0]!.n).toBe(0)
    idp.jwksDown = false
    __resetJwksCacheForTests()
    const noDb = createBackchannelLogoutRoute({ db: null, verify: { issuer: idp.issuer, clientId: 'crm' }, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } })
    expect((await post(noDb, `logout_token=${encodeURIComponent(logoutToken())}`)).status).toBe(503)
    const get = route.GET()
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
  })
})

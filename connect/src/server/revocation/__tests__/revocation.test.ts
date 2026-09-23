/**
 * p77 STORY-003 — the logout-token verify matrix, the operator-token matrix
 * and the estate-maintenance read matrix, against a REAL loopback IdP
 * (`node:http`, real RSA keys). No module mocks.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  BACKCHANNEL_LOGOUT_EVENT,
  __resetJwksCacheForTests,
  verifyLogoutToken,
} from '../logout-token.js'
import { verifyOperatorToken } from '../operator-token.js'
import { __resetMaintenanceCacheForTests, readEstateMaintenance } from '../maintenance.js'
import { closedPort, makeRsaKey, signJwt, startFakeIdp, type FakeIdp } from './support/fake-idp.js'

let idp: FakeIdp
const CLIENT_ID = 'crm'

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: CLIENT_ID, clientSecret: 'crm-secret', rpKey: 'rp-key' })
})
afterAll(async () => {
  await idp.close()
})

const nowS = () => Math.floor(Date.now() / 1000)

function logoutClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    iss: idp.issuer,
    aud: CLIENT_ID,
    iat: nowS(),
    jti: `jti-${Math.random().toString(36).slice(2)}`,
    sub: '42',
    events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
  }
  const out = { ...base, ...over }
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete out[k]
  return out
}

describe('verifyLogoutToken — BCL 1.0 §2.6 matrix', () => {
  beforeEach(() => {
    __resetJwksCacheForTests()
    idp.state.jwksDown = false
  })
  const deps = () => ({ issuer: idp.issuer, clientId: CLIENT_ID })

  it('a good token verifies and yields the claims the receiver acts on', async () => {
    const claims = logoutClaims({ sid: 'S1', cv: 7, events: { [BACKCHANNEL_LOGOUT_EVENT]: { reason: 'password_reset' } } })
    const r = await verifyLogoutToken(signJwt(idp.key, claims, { typ: 'logout+jwt' }), deps())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.token).toMatchObject({ issuer: idp.issuer, sub: '42', sid: 'S1', jti: claims.jti, cv: 7, reason: 'password_reset' })
    expect(r.token.replayGuardUntil).toBe(Math.floor(claims.iat as number) + 600 + 60)
  })

  it('bad signature (another key under the same kid) → bad_signature, permanent', async () => {
    const other = makeRsaKey('k1')
    const r = await verifyLogoutToken(signJwt(other, logoutClaims()), deps())
    expect(r).toEqual({ ok: false, reason: 'bad_signature', transient: false })
  })

  it('unknown kid after a forced refetch → unknown_key, permanent', async () => {
    const other = makeRsaKey('rotated-away')
    const r = await verifyLogoutToken(signJwt(other, logoutClaims()), deps())
    expect(r).toEqual({ ok: false, reason: 'unknown_key', transient: false })
  })

  it('wrong iss → issuer_mismatch; wrong aud → audience_mismatch; foreign azp → azp_mismatch', async () => {
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ iss: 'https://evil.example' })), deps())).toMatchObject({ ok: false, reason: 'issuer_mismatch', transient: false })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ aud: ['yobo'] })), deps())).toMatchObject({ ok: false, reason: 'audience_mismatch', transient: false })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ aud: ['crm', 'yobo'], azp: 'yobo' })), deps())).toMatchObject({ ok: false, reason: 'azp_mismatch' })
  })

  it('missing events / wrong event member → missing_events', async () => {
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ events: undefined })), deps())).toMatchObject({ ok: false, reason: 'missing_events', transient: false })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ events: { 'urn:other': {} } })), deps())).toMatchObject({ ok: false, reason: 'missing_events' })
  })

  it('nonce present (an id_token replayed as a logout token) → nonce_present', async () => {
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ nonce: 'n' })), deps())).toMatchObject({ ok: false, reason: 'nonce_present', transient: false })
  })

  it('sid-only is accepted with sub null; neither sub nor sid → missing_subject; no jti → missing_jti', async () => {
    const sidOnly = await verifyLogoutToken(signJwt(idp.key, logoutClaims({ sub: undefined, sid: 'S9' })), deps())
    expect(sidOnly.ok && sidOnly.token.sub === null && sidOnly.token.sid === 'S9').toBe(true)
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ sub: undefined })), deps())).toMatchObject({ ok: false, reason: 'missing_subject' })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ jti: undefined })), deps())).toMatchObject({ ok: false, reason: 'missing_jti' })
  })

  it('alg none / typ id_token / stale iat / future iat / expired → permanent refusals', async () => {
    const h = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    const p = Buffer.from(JSON.stringify(logoutClaims())).toString('base64url')
    expect(await verifyLogoutToken(`${h}.${p}.AA`, deps())).toMatchObject({ ok: false, reason: 'alg_not_allowed', transient: false })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims(), { typ: 'id+jwt' }), deps())).toMatchObject({ ok: false, reason: 'bad_typ' })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ iat: nowS() - 700 })), deps())).toMatchObject({ ok: false, reason: 'stale' })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ iat: nowS() + 120 })), deps())).toMatchObject({ ok: false, reason: 'not_yet_issued' })
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims({ exp: nowS() - 120 })), deps())).toMatchObject({ ok: false, reason: 'expired' })
    expect(await verifyLogoutToken('not.a.jwt.at.all', deps())).toMatchObject({ ok: false, reason: 'malformed' })
  })

  it('AC2: the JWKS fetch fails with nothing cached → jwks_unavailable, TRANSIENT, never permanent', async () => {
    idp.state.jwksDown = true
    const r = await verifyLogoutToken(signJwt(idp.key, logoutClaims()), deps())
    expect(r).toEqual({ ok: false, reason: 'jwks_unavailable', transient: true })
  })

  it('the JWKS fetch fails with a cached copy → the cached key still verifies (outage ≠ bad token)', async () => {
    expect((await verifyLogoutToken(signJwt(idp.key, logoutClaims()), deps())).ok).toBe(true)
    idp.state.jwksDown = true
    expect((await verifyLogoutToken(signJwt(idp.key, logoutClaims()), deps())).ok).toBe(true)
  })

  it('unconfigured → not_configured, transient', async () => {
    expect(await verifyLogoutToken(signJwt(idp.key, logoutClaims()), { issuer: '', clientId: CLIENT_ID })).toEqual({ ok: false, reason: 'not_configured', transient: true })
  })
})

describe('verifyOperatorToken — D23 matrix', () => {
  beforeEach(() => {
    __resetJwksCacheForTests()
    idp.state.jwksDown = false
  })
  const AUD = ['crm', 'yobo', 'commerce', 'superhost']
  const opClaims = (over: Record<string, unknown> = {}) => ({
    iss: idp.issuer,
    aud: AUD,
    jti: 'switch-jti-1',
    env: 'dev',
    ops: ['fence', 'activate'],
    iat: nowS(),
    exp: nowS() + 900,
    ...over,
  })
  const mint = (claims = opClaims(), key = idp.key, header: Record<string, unknown> = { typ: 'cutover_operator+jwt' }) =>
    signJwt(key, claims, header)

  it('AC7: env dev verified at an RP configured crm / prod → operator_env_mismatch', async () => {
    const r = await verifyOperatorToken(mint(), { issuer: idp.issuer, audience: 'crm', env: 'prod', op: 'fence' })
    expect(r).toMatchObject({ ok: false, reason: 'operator_env_mismatch' })
  })

  it('AC7: the wrong signing key → operator_invalid (permanent)', async () => {
    const r = await verifyOperatorToken(mint(opClaims(), makeRsaKey('k1')), { issuer: idp.issuer, audience: 'crm', env: 'dev', op: 'fence' })
    expect(r).toMatchObject({ ok: false, reason: 'operator_invalid', transient: false })
  })

  it('AC7: an op outside claims.ops → op_not_permitted', async () => {
    const r = await verifyOperatorToken(mint(), { issuer: idp.issuer, audience: 'crm', env: 'dev', op: 'drain' })
    expect(r).toMatchObject({ ok: false, reason: 'op_not_permitted' })
  })

  it('AC7: a good one returns jti, env and ops', async () => {
    const r = await verifyOperatorToken(mint(), { issuer: idp.issuer, audience: 'superhost', env: 'dev', op: 'activate' })
    expect(r).toEqual({ ok: true, jti: 'switch-jti-1', env: 'dev', ops: ['fence', 'activate'] })
  })

  it('wrong aud, expired, missing/other typ, wrong iss → operator_invalid', async () => {
    const at = { issuer: idp.issuer, env: 'dev', op: 'fence' }
    expect(await verifyOperatorToken(mint(), { ...at, audience: 'slides' })).toMatchObject({ ok: false, reason: 'operator_invalid' })
    expect(await verifyOperatorToken(mint(opClaims({ exp: nowS() - 120 })), { ...at, audience: 'crm' })).toMatchObject({ ok: false, reason: 'operator_invalid', detail: 'expired' })
    expect(await verifyOperatorToken(mint(opClaims(), idp.key, {}), { ...at, audience: 'crm' })).toMatchObject({ ok: false, reason: 'operator_invalid', detail: 'bad typ' })
    expect(await verifyOperatorToken(mint(opClaims(), idp.key, { typ: 'logout+jwt' }), { ...at, audience: 'crm' })).toMatchObject({ ok: false, reason: 'operator_invalid' })
    expect(await verifyOperatorToken(mint(opClaims({ iss: 'https://evil.example' })), { ...at, audience: 'crm' })).toMatchObject({ ok: false, reason: 'operator_invalid' })
  })

  it('JWKS unreadable with nothing cached → operator_invalid marked TRANSIENT (503, not 403)', async () => {
    idp.state.jwksDown = true
    const r = await verifyOperatorToken(mint(), { issuer: idp.issuer, audience: 'crm', env: 'dev', op: 'fence' })
    expect(r).toMatchObject({ ok: false, reason: 'operator_invalid', transient: true })
  })
})

describe('readEstateMaintenance — D26 matrix', () => {
  const ON = (jti: string) => ({ active: true, jti, since: '2026-09-23T00:00:00Z', reason: 'cutover', extendedUntil: null, firstActivationAt: null })
  const OFF = { active: false, jti: null, since: null, reason: null, extendedUntil: null, firstActivationAt: null }
  const cfg = (over: Record<string, unknown> = {}) => ({ issuer: idp.issuer, rpKey: 'rp-key', ...over })

  beforeEach(() => {
    __resetMaintenanceCacheForTests()
    idp.hits.maintenance = 0
    idp.state.maintenance = { status: 200, body: OFF }
  })

  it('AC9: maxAgeMs 0 asked twice within 100 ms with the jti rotated between → the second reaches the fake and reports the new jti', async () => {
    idp.state.maintenance = { status: 200, body: ON('J1') }
    const a = await readEstateMaintenance(cfg({ maxAgeMs: 0 }))
    idp.state.maintenance = { status: 200, body: ON('J2') }
    await new Promise((r) => setTimeout(r, 100))
    const b = await readEstateMaintenance(cfg({ maxAgeMs: 0 }))
    expect(a.ok && a.state.jti).toBe('J1')
    expect(b.ok && b.state.jti).toBe('J2')
    expect(b.ok && b.fromCache).toBe(false)
    expect(idp.hits.maintenance).toBe(2)
  })

  it('AC9: with maxAgeMs 15000 the second call is served from the cache (one hit)', async () => {
    idp.state.maintenance = { status: 200, body: ON('J1') }
    const a = await readEstateMaintenance(cfg({ maxAgeMs: 15000 }))
    idp.state.maintenance = { status: 200, body: ON('J2') }
    const b = await readEstateMaintenance(cfg({ maxAgeMs: 15000 }))
    expect(a.ok && a.state.jti).toBe('J1')
    expect(b.ok && b.state.jti).toBe('J1')
    expect(b.ok && b.fromCache).toBe(true)
    expect(idp.hits.maintenance).toBe(1)
  })

  it('AC9: 404 after a good active:true read 16 s old → unreadable, never active:false', async () => {
    const t0 = Date.now()
    idp.state.maintenance = { status: 200, body: ON('J1') }
    expect((await readEstateMaintenance(cfg({ nowMs: t0 }))).ok).toBe(true)
    idp.state.maintenance = { status: 404, body: { error: 'not_found' } }
    // 10 s old: the good read still covers the failure.
    const covered = await readEstateMaintenance(cfg({ nowMs: t0 + 10_000, maxAgeMs: 0 }))
    expect(covered).toMatchObject({ ok: true, fromCache: true, state: { active: true, jti: 'J1' } })
    // 16 s old: nothing covers it.
    const r = await readEstateMaintenance(cfg({ nowMs: t0 + 16_000 }))
    expect(r).toEqual({ ok: false, reason: 'unreadable', detail: 'HTTP 404' })
  })

  it('AC9: 404 with no good read ever in this process → unreadable (a fresh RP fails closed)', async () => {
    idp.state.maintenance = { status: 404, body: { error: 'not_found' } }
    expect(await readEstateMaintenance(cfg())).toEqual({ ok: false, reason: 'unreadable', detail: 'HTTP 404' })
  })

  it('AC9: 500 with the last good read 16 s old → unreadable; a later 200 { active: false } reopens', async () => {
    const t0 = Date.now()
    idp.state.maintenance = { status: 200, body: ON('J1') }
    expect((await readEstateMaintenance(cfg({ nowMs: t0 }))).ok).toBe(true)
    idp.state.maintenance = { status: 500, body: { error: 'boom' } }
    expect(await readEstateMaintenance(cfg({ nowMs: t0 + 16_000 }))).toEqual({ ok: false, reason: 'unreadable', detail: 'HTTP 500' })
    idp.state.maintenance = { status: 200, body: OFF }
    const r = await readEstateMaintenance(cfg({ nowMs: t0 + 17_000 }))
    expect(r).toMatchObject({ ok: true, fromCache: false, state: { active: false, jti: null } })
  })

  it('401, 403, a malformed body and a transport failure are failures, not reads', async () => {
    idp.state.maintenance = { status: 401, body: { error: 'unauthorized' } }
    expect(await readEstateMaintenance(cfg())).toMatchObject({ ok: false, reason: 'unreadable', detail: 'HTTP 401' })
    idp.state.maintenance = { status: 403, body: { error: 'scope' } }
    expect(await readEstateMaintenance(cfg())).toMatchObject({ ok: false, reason: 'unreadable', detail: 'HTTP 403' })
    idp.state.maintenance = { status: 200, body: { active: 'yes', jti: null } }
    expect(await readEstateMaintenance(cfg())).toMatchObject({ ok: false, reason: 'unreadable', detail: 'HTTP 200 with a malformed body' })
    idp.state.maintenance = { status: 200, raw: '{not json' }
    expect(await readEstateMaintenance(cfg())).toMatchObject({ ok: false, reason: 'unreadable' })
    const dead = await closedPort()
    const r = await readEstateMaintenance({ issuer: dead, rpKey: 'rp-key' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.detail.startsWith('transport:')).toBe(true)
  })

  it('a well-formed 200 is the only read: the wire shape is carried through camelCase', async () => {
    idp.state.maintenance = { status: 200, body: { active: true, jti: 'J', since: 's', reason: 'r', extendedUntil: 'e', firstActivationAt: 'f' } }
    const r = await readEstateMaintenance(cfg({ maxAgeMs: 0 }))
    expect(r.ok && r.state).toEqual({ active: true, jti: 'J', since: 's', reason: 'r', extendedUntil: 'e', firstActivationAt: 'f' })
  })
})

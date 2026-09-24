/**
 * p77 STORY-003 — the freshness matrix per kind, the version cache, the
 * fail-closed split, the D24 lookup, the derived lineage and the
 * session-token trio — against a REAL loopback IdP and a REAL local Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetFreshnessCachesForTests,
  assertCredentialFresh,
  assertSessionTokenFresh,
  derivedLineageFromToken,
  stampConnectEpochOnSignIn,
  type CredentialEpoch,
  type FreshnessDeps,
  type SessionEpochToken,
} from '../freshness.js'
import { __resetRevocationCacheForTests, applyLogoutToken } from '../ledger.js'
import { BACKCHANNEL_LOGOUT_EVENT, __resetJwksCacheForTests, verifyLogoutToken } from '../logout-token.js'
import { closedPort, signJwt, startFakeIdp, type FakeIdp } from './support/fake-idp.js'
import { openLocalLedgerDb, type LocalLedgerDb } from './support/local-db.js'
import { WOULD_REFUSE_PREFIX, withEpochEnforcement } from '../../../next-auth/epoch-enforcement.js'

const db: LocalLedgerDb | null = await openLocalLedgerDb()
let idp: FakeIdp
let dead: string

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'crm', clientSecret: 'crm-secret', rpKey: 'rp-key' })
  dead = await closedPort()
})
afterAll(async () => {
  await db?.close()
  await idp.close()
})

const nowS = () => Math.floor(Date.now() / 1000)
const silent = () => ({ error: vi.fn(), warn: vi.fn(), log: vi.fn() })

function deps(over: Partial<FreshnessDeps> = {}): FreshnessDeps {
  return {
    execute: db!.sql.execute,
    connect: { issuer: idp.issuer, clientId: 'crm', clientSecret: 'crm-secret' },
    lookup: { issuer: idp.issuer, rpKey: 'rp-key' },
    logger: silent(),
    ...over,
  }
}

describe.skipIf(!db)('assertCredentialFresh (real IdP + real Postgres)', () => {
  beforeEach(async () => {
    __resetFreshnessCachesForTests()
    __resetRevocationCacheForTests()
    __resetJwksCacheForTests()
    idp.state.introspect.clear()
    idp.state.accountVersion.clear()
    idp.state.refresh.clear()
    idp.introspected.length = 0
    idp.accountVersionBodies.length = 0
    idp.hits.introspect = 0
    idp.hits.accountVersion = 0
    idp.hits.token = 0
    await db!.sql.execute('TRUNCATE connect_logout_tokens, connect_session_revocations, users RESTART IDENTITY')
    await db!.sql.execute(
      `INSERT INTO users (id, connect_issuer, connect_sub, credential_authority, credential_version) VALUES
        (1, $1, '42', 'connect', 1),
        (2, NULL, NULL, 'local', 3),
        (7, $1, '77', 'connect', 2)`,
      [idp.issuer],
    )
  })

  const oidc = (over: Partial<CredentialEpoch> = {}): CredentialEpoch => ({
    kind: 'oidc',
    localUserId: 1,
    issuer: idp.issuer,
    sub: '42',
    cv: 1,
    aeid: 'E1',
    issuedAtSeconds: nowS() - 30,
    accessToken: 'AT-1',
    ...over,
  })

  describe('oidc', () => {
    it('active introspection reporting the same cv/aeid → fresh, source introspection', async () => {
      idp.state.introspect.set('AT-1', { active: true, sub: '42', cv: 1, aeid: 'E1', grant_id: 'G1' })
      const v = await assertCredentialFresh(oidc(), deps())
      expect(v).toMatchObject({ ok: true, cv: 1, aeid: 'E1', grantId: 'G1', source: 'introspection' })
    })

    it('the issuer reports a newer cv → stale; active:false → inactive; a transport failure → unreadable', async () => {
      idp.state.introspect.set('AT-1', { active: true, sub: '42', cv: 2, aeid: 'E1' })
      expect(await assertCredentialFresh(oidc(), deps())).toMatchObject({ ok: false, reason: 'stale' })
      idp.state.introspect.set('AT-2', { active: false })
      expect(await assertCredentialFresh(oidc({ accessToken: 'AT-2' }), deps())).toMatchObject({ ok: false, reason: 'inactive' })
      expect(
        await assertCredentialFresh(oidc({ accessToken: 'AT-3' }), deps({ connect: { issuer: dead, clientId: 'crm', clientSecret: 'crm-secret' } })),
      ).toMatchObject({ ok: false, reason: 'unreadable' })
      // A 401 from the issuer (our client credentials refused) is a failure to answer, not a verdict.
      expect(
        await assertCredentialFresh(oidc({ accessToken: 'AT-4' }), deps({ connect: { issuer: idp.issuer, clientId: 'crm', clientSecret: 'wrong' } })),
      ).toMatchObject({ ok: false, reason: 'unreadable' })
    })

    it('no aeid on an oidc credential → no_epoch; no (issuer, sub) on a connect-authority user → no_binding', async () => {
      expect(await assertCredentialFresh(oidc({ aeid: null }), deps())).toMatchObject({ ok: false, reason: 'no_epoch' })
      expect(await assertCredentialFresh(oidc({ issuer: null, sub: null }), deps())).toMatchObject({ ok: false, reason: 'no_binding' })
    })

    it('AC3: one check learned version 2; a second credential carrying version 1 within 60 s is refused from the same cache entry', async () => {
      idp.state.introspect.set('AT-A', { active: true, sub: '42', cv: 2, aeid: 'E2' })
      idp.state.introspect.set('AT-B', { active: true, sub: '42', cv: 1, aeid: 'E1' })
      const t0 = Date.now()
      // Browser A: its token reports cv 2 and it carries cv 2 → fresh, and the process learned 2.
      expect(await assertCredentialFresh(oidc({ cv: 2, aeid: 'E2', accessToken: 'AT-A' }), deps({ nowMs: t0 }))).toMatchObject({ ok: true, cv: 2 })
      expect(idp.hits.introspect).toBe(1)
      // Browser B, 10 s later, carries cv 1. Its own token's introspection says cv 1 too — consistent with
      // itself — but the SUBJECT's high-water mark is 2, so it is refused from that entry.
      expect(await assertCredentialFresh(oidc({ cv: 1, aeid: 'E1', accessToken: 'AT-B' }), deps({ nowMs: t0 + 10_000 }))).toMatchObject({ ok: false, reason: 'stale' })
      // A credential spliced onto browser A's token with cv 1: refused from A's cached introspection, no new POST.
      const before = idp.hits.introspect
      expect(await assertCredentialFresh(oidc({ cv: 1, aeid: 'E1', accessToken: 'AT-A' }), deps({ nowMs: t0 + 20_000 }))).toMatchObject({ ok: false, reason: 'stale' })
      expect(idp.hits.introspect).toBe(before)
      // The mirror row rose to 2 in the real database.
      expect((await db!.sql.execute('SELECT credential_version FROM users WHERE id = 1'))[0]?.credential_version).toBe(2)
    })

    it('maxAgeMs forces a re-read of a cached introspection', async () => {
      idp.state.introspect.set('AT-1', { active: true, sub: '42', cv: 1, aeid: 'E1' })
      const t0 = Date.now()
      await assertCredentialFresh(oidc(), deps({ nowMs: t0 }))
      await assertCredentialFresh(oidc(), deps({ nowMs: t0 + 30_000 }))
      expect(idp.hits.introspect).toBe(1)
      await assertCredentialFresh(oidc(), deps({ nowMs: t0 + 30_000, maxAgeMs: 25_000 }))
      expect(idp.hits.introspect).toBe(2)
      // And the cap is 60 s regardless of what the caller asks for.
      await assertCredentialFresh(oidc(), deps({ nowMs: t0 + 95_000, maxAgeMs: 600_000 }))
      expect(idp.hits.introspect).toBe(3)
    })

    it('a revocation landed after authTime → revoked, with revokedAfter on the facts', async () => {
      idp.state.introspect.set('AT-1', { active: true, sub: '42', cv: 1, aeid: 'E1' })
      const tok = await verifyLogoutToken(
        signJwt(idp.key, { iss: idp.issuer, aud: 'crm', iat: nowS(), jti: 'j-rev', sub: '42', events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } }),
        { issuer: idp.issuer, clientId: 'crm' },
      )
      if (!tok.ok) throw new Error(tok.reason)
      await applyLogoutToken(db!.sql, tok.token, { logger: silent() })
      const v = await assertCredentialFresh(oidc({ issuedAtSeconds: nowS() - 60 }), deps())
      expect(v).toMatchObject({ ok: false, reason: 'revoked' })
      expect(typeof (v as { facts: { revokedAfter: unknown } }).facts.revokedAfter).toBe('number')
      // No introspection was needed to refuse.
      expect(idp.hits.introspect).toBe(0)
    })
  })

  describe('the fail-closed split (AC4)', () => {
    const throwing = async () => {
      throw new Error('store down')
    }
    it('a Connect-bound credential with an unreadable version → refuse (unreadable)', async () => {
      idp.state.introspect.set('AT-1', { active: true, sub: '42', cv: 1, aeid: 'E1' })
      expect(await assertCredentialFresh(oidc(), deps({ execute: throwing }))).toMatchObject({ ok: false, reason: 'unreadable' })
      expect(await assertCredentialFresh(oidc(), deps({ execute: null }))).toMatchObject({ ok: false, reason: 'unreadable' })
    })
    it('a local credential with a thrown local read → admit with a warning (unverified_local)', async () => {
      const logger = silent()
      const v = await assertCredentialFresh({ kind: 'app_local', localUserId: 2, cv: 3, issuedAtSeconds: nowS() }, deps({ execute: throwing, logger }))
      expect(v).toMatchObject({ ok: true, source: 'unverified_local' })
      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
    it('a local credential on a readable store is compared to the mirror: behind → stale, none → implied_v1', async () => {
      expect(await assertCredentialFresh({ kind: 'app_local', localUserId: 2, cv: 2, issuedAtSeconds: nowS() }, deps())).toMatchObject({ ok: false, reason: 'stale' })
      expect(await assertCredentialFresh({ kind: 'app_local', localUserId: 2, cv: 3, issuedAtSeconds: nowS() }, deps())).toMatchObject({ ok: true, source: 'mirror' })
      await db!.sql.execute('UPDATE users SET credential_version = 1 WHERE id = 2')
      __resetFreshnessCachesForTests()
      expect(await assertCredentialFresh({ kind: 'app_local', localUserId: 2, issuedAtSeconds: nowS() }, deps())).toMatchObject({ ok: true, cv: 1, source: 'implied_v1' })
    })
  })

  describe('app_local (D24)', () => {
    const appLocal = (over: Partial<CredentialEpoch> = {}): CredentialEpoch => ({
      kind: 'app_local',
      localUserId: 7,
      issuer: idp.issuer,
      sub: '77',
      cv: 2,
      issuedAtSeconds: nowS() - 30,
      ...over,
    })

    it('AC5: the route answers the same cv → fresh; cv+1 → stale; unreachable → unreadable — and the missing aeid is never the reason', async () => {
      idp.state.accountVersion.set('77|7', { found: true, cv: 2, active: true, epoch: 'unknown', grant: 'unknown' })
      expect(await assertCredentialFresh(appLocal(), deps())).toMatchObject({ ok: true, cv: 2, aeid: null, source: 'lookup' })
      expect(idp.accountVersionBodies[0]).toEqual({ sub: '77', sourceUserRef: '7' })
      expect('aeid' in idp.accountVersionBodies[0]!).toBe(false)

      idp.state.accountVersion.set('77|7', { found: true, cv: 3, active: true, epoch: 'unknown', grant: 'unknown' })
      const stale = await assertCredentialFresh(appLocal(), deps({ maxAgeMs: 0 }))
      expect(stale).toMatchObject({ ok: false, reason: 'stale', facts: { version: 3 } })
      // The process learned 3: the mirror row rose, and the same credential is refused even from the mirror alone.
      expect((await db!.sql.execute('SELECT credential_version FROM users WHERE id = 7'))[0]?.credential_version).toBe(3)

      __resetFreshnessCachesForTests()
      await db!.sql.execute('UPDATE users SET credential_version = 2 WHERE id = 7')
      expect(await assertCredentialFresh(appLocal(), deps({ lookup: { issuer: dead, rpKey: 'rp-key' } }))).toMatchObject({ ok: false, reason: 'unreadable' })
      // A refused key (401) is a failure, not a version.
      __resetFreshnessCachesForTests()
      expect(await assertCredentialFresh(appLocal(), deps({ lookup: { issuer: idp.issuer, rpKey: 'wrong' } }))).toMatchObject({ ok: false, reason: 'unreadable' })
      // No lookup configured at all: unreadable, never admitted on the mirror alone.
      expect(await assertCredentialFresh(appLocal(), deps({ lookup: null }))).toMatchObject({ ok: false, reason: 'unreadable' })
    })

    it('the 60 s cache holds the VERSION: a second app_local credential with a lower cv is refused from the entry without a second POST', async () => {
      idp.state.accountVersion.set('77|7', { found: true, cv: 4, active: true, epoch: 'unknown', grant: 'unknown' })
      const t0 = Date.now()
      expect(await assertCredentialFresh(appLocal({ cv: 4 }), deps({ nowMs: t0 }))).toMatchObject({ ok: true, cv: 4 })
      expect(idp.hits.accountVersion).toBe(1)
      expect(await assertCredentialFresh(appLocal({ cv: 3 }), deps({ nowMs: t0 + 5_000 }))).toMatchObject({ ok: false, reason: 'stale' })
      expect(idp.hits.accountVersion).toBe(1)
      // maxAgeMs forces the re-read.
      expect(await assertCredentialFresh(appLocal({ cv: 4 }), deps({ nowMs: t0 + 5_000, maxAgeMs: 0 }))).toMatchObject({ ok: true })
      expect(idp.hits.accountVersion).toBe(2)
      // The mirror rose to 4 in the database.
      expect((await db!.sql.execute('SELECT credential_version FROM users WHERE id = 7'))[0]?.credential_version).toBe(4)
    })

    it('active:false → inactive; epoch stale → stale; found:false → unreadable and NOT cached', async () => {
      idp.state.accountVersion.set('77|7', { found: true, cv: 2, active: false, epoch: 'unknown', grant: 'unknown' })
      expect(await assertCredentialFresh(appLocal(), deps())).toMatchObject({ ok: false, reason: 'inactive' })
      __resetFreshnessCachesForTests()
      idp.state.accountVersion.set('77|7', { found: true, cv: 2, active: true, epoch: 'stale', grant: 'unknown' })
      expect(await assertCredentialFresh(appLocal(), deps())).toMatchObject({ ok: false, reason: 'stale' })
      __resetFreshnessCachesForTests()
      idp.state.accountVersion.set('77|7', { found: false })
      expect(await assertCredentialFresh(appLocal(), deps())).toMatchObject({ ok: false, reason: 'unreadable' })
      const hits = idp.hits.accountVersion
      idp.state.accountVersion.set('77|7', { found: true, cv: 2, active: true, epoch: 'unknown', grant: 'unknown' })
      expect(await assertCredentialFresh(appLocal(), deps())).toMatchObject({ ok: true })
      expect(idp.hits.accountVersion).toBe(hits + 1)
    })

    it('the ledger runs first: a revocation newer than authTime refuses before any lookup', async () => {
      await db!.sql.execute(`INSERT INTO connect_session_revocations (connect_issuer, connect_sub, local_user_id, jti) VALUES ($1, '77', 7, 'x')`, [idp.issuer])
      expect(await assertCredentialFresh(appLocal({ issuedAtSeconds: nowS() - 60 }), deps())).toMatchObject({ ok: false, reason: 'revoked' })
      expect(idp.hits.accountVersion).toBe(0)
    })
  })

  describe('derived — the parent answering slides (§9.4, AC8)', () => {
    const lineage = (over: Partial<CredentialEpoch> = {}): CredentialEpoch => ({
      kind: 'derived',
      lineage: 'oidc',
      localUserId: 1,
      sourceUserRef: 1,
      issuer: idp.issuer,
      sub: '42',
      sid: 'S-parent',
      aeid: 'E1',
      grantId: 'G1',
      cv: 1,
      issuedAtSeconds: nowS() - 30,
      ...over,
    })
    const answer = (a: Record<string, unknown>) => idp.state.accountVersion.set('42|1', a as never)

    it('same cv, epoch fresh, grant gone (a sign-out at Connect) → refused grant_gone, cv unchanged in the facts', async () => {
      answer({ found: true, cv: 1, active: true, epoch: 'fresh', grant: 'gone' })
      const v = await assertCredentialFresh(lineage(), deps())
      expect(v).toMatchObject({ ok: false, reason: 'grant_gone', facts: { version: 1, epoch: 'fresh', grant: 'gone', active: true } })
      expect(idp.accountVersionBodies[0]).toEqual({ sub: '42', sourceUserRef: '1', aeid: 'E1', grantId: 'G1' })
      // No token of the parent's own was ever introspected.
      expect(idp.hits.introspect).toBe(0)
    })

    it('grant unknown on an oidc lineage → refused (grant_unknown), never admitted', async () => {
      answer({ found: true, cv: 1, active: true, epoch: 'fresh', grant: 'unknown' })
      expect(await assertCredentialFresh(lineage(), deps())).toMatchObject({ ok: false, reason: 'grant_unknown' })
    })

    it('aeid stale → stale; found:false → unreadable; epoch unknown → unreadable; transport → unreadable — none cached as fresh', async () => {
      answer({ found: true, cv: 1, active: true, epoch: 'stale', grant: 'live' })
      expect(await assertCredentialFresh(lineage(), deps())).toMatchObject({ ok: false, reason: 'stale', facts: { epoch: 'stale' } })
      __resetFreshnessCachesForTests()
      answer({ found: false })
      expect(await assertCredentialFresh(lineage(), deps())).toMatchObject({ ok: false, reason: 'unreadable' })
      answer({ found: true, cv: 1, active: true, epoch: 'unknown', grant: 'live' })
      expect(await assertCredentialFresh(lineage(), deps())).toMatchObject({ ok: false, reason: 'unreadable' })
      expect(await assertCredentialFresh(lineage(), deps({ lookup: { issuer: dead, rpKey: 'rp-key' } }))).toMatchObject({ ok: false, reason: 'unreadable' })
      // Every one of those re-asked; a good answer now is admitted and it reached the route.
      const hits = idp.hits.accountVersion
      answer({ found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
      expect(await assertCredentialFresh(lineage(), deps())).toMatchObject({ ok: true, cv: 1, aeid: 'E1', grantId: 'G1', source: 'lookup' })
      expect(idp.hits.accountVersion).toBe(hits + 1)
    })

    it('the refusal facts are returned, not collapsed: a fresh answer carries version/active/epoch/grant', async () => {
      answer({ found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
      const v = await assertCredentialFresh(lineage(), deps())
      expect(v.facts).toMatchObject({ version: 1, active: true, epoch: 'fresh', grant: 'live', revokedAfter: null })
    })

    it("the parent's ledger takes the sid: a sid-scoped sign-out ends the bridges of that browser only", async () => {
      await db!.sql.execute(`INSERT INTO connect_session_revocations (connect_issuer, connect_sub, connect_sid, local_user_id, jti) VALUES ($1, '42', 'S-parent', 1, 'x')`, [idp.issuer])
      answer({ found: true, cv: 1, active: true, epoch: 'fresh', grant: 'live' })
      expect(await assertCredentialFresh(lineage({ issuedAtSeconds: nowS() - 60 }), deps())).toMatchObject({ ok: false, reason: 'revoked' })
      __resetRevocationCacheForTests()
      expect(await assertCredentialFresh(lineage({ sid: 'S-other', issuedAtSeconds: nowS() - 60 }), deps())).toMatchObject({ ok: true })
    })

    it('an app_local lineage needs no aeid and no grant: epoch/grant unknown is the expected answer', async () => {
      idp.state.accountVersion.set('77|7', { found: true, cv: 2, active: true, epoch: 'unknown', grant: 'unknown' })
      const v = await assertCredentialFresh(
        { kind: 'derived', lineage: 'app_local', localUserId: 7, sourceUserRef: 7, issuer: idp.issuer, sub: '77', cv: 2, issuedAtSeconds: nowS() - 30 },
        deps(),
      )
      expect(v).toMatchObject({ ok: true, cv: 2, source: 'lookup' })
      expect(idp.accountVersionBodies[0]).toEqual({ sub: '77', sourceUserRef: '7' })
    })
  })
})

describe.skipIf(!db)('the session-token trio (§4.5)', () => {
  beforeEach(async () => {
    __resetFreshnessCachesForTests()
    __resetRevocationCacheForTests()
    idp.state.introspect.clear()
    idp.state.refresh.clear()
    idp.refreshed.length = 0
    idp.hits.introspect = 0
    idp.hits.token = 0
    idp.state.refreshDelayMs = 0
    await db!.sql.execute('TRUNCATE connect_logout_tokens, connect_session_revocations, users RESTART IDENTITY')
    await db!.sql.execute(`INSERT INTO users (id, connect_issuer, connect_sub, credential_authority, credential_version) VALUES (1, $1, '42', 'connect', 1)`, [idp.issuer])
  })

  it('AC6: access token expiring in 10 s, three concurrent calls → exactly one refresh POST, all three see the rotated pair; after the issuer revokes the refresh token → stale', async () => {
    const t0 = Date.now()
    const token: SessionEpochToken = {
      userId: 1,
      authTime: Math.floor(t0 / 1000) - 600,
      connectIssuer: idp.issuer,
      connectSub: '42',
      connectSid: 'S1',
      connectCv: 1,
      connectAeid: 'E1',
      connectAccessToken: 'AT-old',
      connectRefreshToken: 'RT-1',
      connectAccessTokenExpiresAt: Math.floor(t0 / 1000) + 10,
      connectKind: 'oidc',
    }
    idp.state.refresh.set('RT-1', { access_token: 'AT-new', refresh_token: 'RT-2', expires_in: 3600 })
    idp.state.refreshDelayMs = 50
    idp.state.introspect.set('AT-new', { active: true, sub: '42', cv: 1, aeid: 'E1', grant_id: 'G1' })

    const d = deps({ nowMs: t0 })
    const [a, b, c] = await Promise.all([assertSessionTokenFresh(token, d), assertSessionTokenFresh(token, d), assertSessionTokenFresh(token, d)])
    expect(a).toMatchObject({ ok: true, cv: 1, source: 'introspection' })
    expect(b).toMatchObject({ ok: true })
    expect(c).toMatchObject({ ok: true })
    expect(idp.hits.token).toBe(1)
    expect(idp.refreshed).toEqual(['RT-1'])
    expect(token.connectAccessToken).toBe('AT-new')
    expect(token.connectRefreshToken).toBe('RT-2')
    expect(token.connectAccessTokenExpiresAt).toBe(Math.floor(t0 / 1000) + 3600)
    // The old handle was never introspected; the new one once.
    expect(idp.introspected).toEqual(['AT-new'])

    // The issuer revokes the family; the next expiry-driven refresh is refused → stale.
    idp.state.refresh.set('RT-2', 'invalid_grant')
    const later = t0 + (3600 - 20) * 1000
    expect(await assertSessionTokenFresh(token, deps({ nowMs: later }))).toMatchObject({ ok: false, reason: 'stale' })
    expect(idp.hits.token).toBe(2)
  })

  it('the memo answers a repeated refresh token from memory until the new expiry − 30 s', async () => {
    const t0 = Date.now()
    const mk = (): SessionEpochToken => ({
      userId: 1,
      authTime: Math.floor(t0 / 1000) - 600,
      connectIssuer: idp.issuer,
      connectSub: '42',
      connectCv: 1,
      connectAeid: 'E1',
      connectAccessToken: 'AT-old',
      connectRefreshToken: 'RT-1',
      connectAccessTokenExpiresAt: Math.floor(t0 / 1000) + 5,
    })
    idp.state.refresh.set('RT-1', { access_token: 'AT-new', expires_in: 120 })
    idp.state.introspect.set('AT-new', { active: true, sub: '42', cv: 1, aeid: 'E1' })
    expect(await assertSessionTokenFresh(mk(), deps({ nowMs: t0 }))).toMatchObject({ ok: true })
    // The next request arrives with the SAME cookie (NextAuth could not persist the pair): no second POST.
    expect(await assertSessionTokenFresh(mk(), deps({ nowMs: t0 + 1_000 }))).toMatchObject({ ok: true })
    expect(idp.hits.token).toBe(1)
    // Past the memo (120 s − 30 s), the exchange is made again.
    expect(await assertSessionTokenFresh(mk(), deps({ nowMs: t0 + 100_000 }))).toMatchObject({ ok: true })
    expect(idp.hits.token).toBe(2)
  })

  it('a Connect session with no access token (legacy) → no_epoch; a refresh transport failure → unreadable', async () => {
    const t0 = Date.now()
    const legacy: SessionEpochToken = { userId: 1, connectIssuer: idp.issuer, connectSub: '42', connectCv: 1, connectAeid: 'E1', authTime: Math.floor(t0 / 1000) }
    expect(await assertSessionTokenFresh(legacy, deps())).toMatchObject({ ok: false, reason: 'no_epoch' })
    const expiring: SessionEpochToken = { ...legacy, connectAccessToken: 'AT', connectRefreshToken: 'RT', connectAccessTokenExpiresAt: Math.floor(t0 / 1000) }
    expect(await assertSessionTokenFresh(expiring, deps({ nowMs: t0, connect: { issuer: dead, clientId: 'crm', clientSecret: 's' } }))).toMatchObject({ ok: false, reason: 'unreadable' })
  })

  it('an app_local session token is checked by lookup with its own local id, never introspected', async () => {
    idp.state.accountVersion.set('42|1', { found: true, cv: 1, active: true, epoch: 'unknown', grant: 'unknown' })
    const token: SessionEpochToken = { userId: 1, authTime: nowS() - 10, connectIssuer: idp.issuer, connectSub: '42', connectCv: 1, connectKind: 'app_local' }
    expect(await assertSessionTokenFresh(token, deps())).toMatchObject({ ok: true, source: 'lookup' })
    expect(idp.hits.introspect).toBe(0)
    idp.state.accountVersion.set('42|1', { found: true, cv: 2, active: true, epoch: 'unknown', grant: 'unknown' })
    expect(await assertSessionTokenFresh(token, deps({ maxAgeMs: 0 }))).toMatchObject({ ok: false, reason: 'stale' })
  })

  it('a token with no Connect binding is read against the local mirror (localCv, or 1)', async () => {
    await db!.sql.execute(`INSERT INTO users (id, credential_authority, credential_version) VALUES (2, 'local', 2)`)
    expect(await assertSessionTokenFresh({ userId: 2, iat: nowS(), localCv: 2 }, deps())).toMatchObject({ ok: true, source: 'mirror' })
    expect(await assertSessionTokenFresh({ userId: 2, iat: nowS(), localCv: 1 }, deps())).toMatchObject({ ok: false, reason: 'stale' })
  })

  it('stampConnectEpochOnSignIn: active with cv/aeid → stamped (set-or-delete), cache primed, mirror observed', async () => {
    idp.state.introspect.set('AT-S', { active: true, sub: '42', cv: 5, aeid: 'E5', grant_id: 'G5' })
    const token: SessionEpochToken = { connectIssuer: idp.issuer, connectSub: '42', connectCv: 99, connectAeid: 'stale', connectAccessToken: 'gone' }
    await stampConnectEpochOnSignIn(token, { access_token: 'AT-S', refresh_token: 'RT-S', expires_at: nowS() + 3600 }, deps(), 1)
    expect(token).toMatchObject({ connectCv: 5, connectAeid: 'E5', connectGrantId: 'G5', connectAccessToken: 'AT-S', connectRefreshToken: 'RT-S', connectKind: 'oidc' })
    expect(idp.hits.introspect).toBe(1)
    // The first use does not ask again inside the minute.
    const v = await assertSessionTokenFresh({ ...token, userId: 1, authTime: nowS() }, deps())
    expect(v).toMatchObject({ ok: true, cv: 5, source: 'introspection' })
    expect(idp.hits.introspect).toBe(1)
    expect((await db!.sql.execute('SELECT credential_version FROM users WHERE id = 1'))[0]?.credential_version).toBe(5)
    // The lineage a bridge mint carries:
    expect(derivedLineageFromToken({ ...token, userId: 1, authTime: 1000, connectSid: 'S' })).toEqual({
      kind: 'oidc', issuer: idp.issuer, sub: '42', sid: 'S', cv: 5, aeid: 'E5', grantId: 'G5', authTime: 1000, parentUserId: 1,
    })
  })

  it('stampConnectEpochOnSignIn: inactive, or active without cv/aeid → no epoch on the token, refused at first use as no_epoch', async () => {
    idp.state.introspect.set('AT-I', { active: false })
    idp.state.introspect.set('AT-N', { active: true, sub: '42' })
    for (const at of ['AT-I', 'AT-N', 'AT-unknown']) {
      const token: SessionEpochToken = { userId: 1, connectIssuer: idp.issuer, connectSub: '42', connectCv: 3, connectAeid: 'old' }
      await stampConnectEpochOnSignIn(token, { access_token: at }, deps())
      expect(token.connectCv).toBeUndefined()
      expect(token.connectAeid).toBeUndefined()
      expect(token.connectAccessToken).toBe(at)
      expect(await assertSessionTokenFresh({ ...token, authTime: nowS() }, deps())).toMatchObject({ ok: false, reason: 'no_epoch' })
    }
    const none: SessionEpochToken = { userId: 1, connectIssuer: idp.issuer, connectSub: '42', connectCv: 3, connectAeid: 'old', connectAccessToken: 'x' }
    await stampConnectEpochOnSignIn(none, null, deps())
    expect(none.connectAccessToken).toBeUndefined()
    expect(derivedLineageFromToken({ ...none, authTime: 1 })).toBeNull()
  })
})

/**
 * p77 FIX-logout-record (found in STORY-028) — an UNBOUND session (no
 * (issuer, sub) on the token: yobo's password and phone-only OTP sessions)
 * consults the revocation record too. Real logout tokens, signed by the
 * loopback IdP and applied by the real receiver half (`applyLogoutToken`),
 * against the real local Postgres; the gate is the real `withEpochEnforcement`.
 */
describe.skipIf(!db)('unbound sessions and the logout record (FIX-logout-record)', () => {
  beforeEach(async () => {
    __resetFreshnessCachesForTests()
    __resetRevocationCacheForTests()
    __resetJwksCacheForTests()
    await db!.sql.execute('TRUNCATE connect_logout_tokens, connect_session_revocations, users RESTART IDENTITY')
    // 3: bound to Connect (the pair set) but its credential still LOCAL — the
    //    STORY-028 case. 4: a stranger, bound the same way. 5: phone-only, no pair.
    await db!.sql.execute(
      `INSERT INTO users (id, connect_issuer, connect_sub, credential_authority, credential_version) VALUES
        (3, $1, '33', 'local', 2),
        (4, $1, '44', 'local', 1),
        (5, NULL, NULL, 'local', 1)`,
      [idp.issuer],
    )
  })

  let jtiSeq = 0
  async function logout(claims: { sub?: string; sid?: string }): Promise<void> {
    const tok = await verifyLogoutToken(
      signJwt(idp.key, { iss: idp.issuer, aud: 'crm', iat: nowS(), jti: `j-fix-${++jtiSeq}`, ...claims, events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } }),
      { issuer: idp.issuer, clientId: 'crm' },
    )
    if (!tok.ok) throw new Error(tok.reason)
    const applied = await applyLogoutToken(db!.sql, tok.token, { logger: silent() })
    expect(applied.outcome).toBe('applied')
  }
  const passwordSession = (userId: number, localCv: number): SessionEpochToken => ({ userId, authTime: nowS() - 60, localCv })

  it('a subject-wide logout for the lineage ends a password (unbound) session; the refusal carries revokedAfter', async () => {
    const token = passwordSession(3, 2)
    expect(await assertSessionTokenFresh(token, deps())).toMatchObject({ ok: true, source: 'mirror' })
    await logout({ sub: '33' })
    // maxAgeMs 0: no cached "no revocations yet" answer (the 60 s bound, F2).
    const v = await assertSessionTokenFresh(token, deps({ maxAgeMs: 0 }))
    expect(v).toMatchObject({ ok: false, reason: 'revoked' })
    expect(typeof (v as { facts: { revokedAfter: unknown } }).facts.revokedAfter).toBe('number')
    // The receiver resolved local_user_id from the pair — the key the local session carries.
    expect((await db!.sql.execute('SELECT local_user_id, connect_sid FROM connect_session_revocations'))[0]).toEqual({ local_user_id: 3, connect_sid: null })
    // A sign-in AFTER the logout is not ended by it.
    __resetRevocationCacheForTests()
    expect(await assertSessionTokenFresh({ userId: 3, authTime: nowS() + 1, localCv: 2 }, deps({ maxAgeMs: 0 }))).toMatchObject({ ok: true })
  })

  it('an unrelated logout does not end it: another subject, or a sid-scoped sign-out of this subject (D12)', async () => {
    await logout({ sub: '44' })
    await logout({ sub: '33', sid: 'browser-A' })
    await logout({ sid: 'browser-B' })
    expect(await assertSessionTokenFresh(passwordSession(3, 2), deps({ maxAgeMs: 0 }))).toMatchObject({ ok: true, source: 'mirror' })
    expect(await assertSessionTokenFresh(passwordSession(5, 1), deps({ maxAgeMs: 0 }))).toMatchObject({ ok: true })
    // …while the stranger's own session IS ended.
    expect(await assertSessionTokenFresh(passwordSession(4, 1), deps({ maxAgeMs: 0 }))).toMatchObject({ ok: false, reason: 'revoked' })
  })

  it('a revocation older than the session does not match; a local-id row (the RP adapter\'s invalidate) ends a phone-only session', async () => {
    await db!.sql.execute(
      `INSERT INTO connect_session_revocations (connect_issuer, connect_sub, local_user_id, jti, revoked_at) VALUES ($1, '33', 3, 'old', now() - interval '10 minutes')`,
      [idp.issuer],
    )
    expect(await assertSessionTokenFresh(passwordSession(3, 2), deps({ maxAgeMs: 0 }))).toMatchObject({ ok: true })
    await db!.sql.execute(`INSERT INTO connect_session_revocations (connect_issuer, connect_sub, local_user_id, jti) VALUES ('rp:yobo', 'local:5', 5, 'rp:yobo:invalidate:x')`)
    expect(await assertSessionTokenFresh(passwordSession(5, 1), deps({ maxAgeMs: 0 }))).toMatchObject({ ok: false, reason: 'revoked' })
  })

  it('an unreadable ledger ADMITS an unbound session (the local half of the split), and is not cached', async () => {
    await logout({ sub: '33' })
    const ledgerDown = async (text: string, params?: unknown[]) => {
      if (text.includes('connect_session_revocations')) throw new Error('ledger down')
      return db!.sql.execute(text, params as never)
    }
    const logger = silent()
    expect(await assertSessionTokenFresh(passwordSession(3, 2), deps({ execute: ledgerDown as never, logger, maxAgeMs: 0 }))).toMatchObject({ ok: true })
    expect(logger.error).toHaveBeenCalled()
    // The store is back: the same session is refused at once.
    expect(await assertSessionTokenFresh(passwordSession(3, 2), deps({ maxAgeMs: 0 }))).toMatchObject({ ok: false, reason: 'revoked' })
  })

  it('withEpochEnforcement: enforce refuses the ended password session; warn admits and logs would_refuse revoked (kind local)', async () => {
    await logout({ sub: '33' })
    const enforced = await withEpochEnforcement('enforce', deps({ maxAgeMs: 0 }))({ ...passwordSession(3, 2) })
    expect(enforced).toMatchObject({ userId: 0 })
    const logger = silent()
    const warned = await withEpochEnforcement('warn', deps({ maxAgeMs: 0, logger }))({ ...passwordSession(3, 2) })
    expect(warned.userId).toBe(3)
    expect(logger.warn).toHaveBeenCalledWith(`${WOULD_REFUSE_PREFIX} revoked`, { userId: 3, kind: 'local' })
  })
})

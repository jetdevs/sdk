/**
 * p77 STORY-003 — the revocation ledger on a REAL local Postgres (scratch
 * schema), with tokens verified against the REAL loopback IdP.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { BACKCHANNEL_LOGOUT_EVENT, __resetJwksCacheForTests, verifyLogoutToken } from '../logout-token.js'
import {
  __resetRevocationCacheForTests,
  applyLogoutToken,
  isSessionRevokedForToken,
  pruneExpiredLogoutTokens,
  readConnectSessionRevocation,
} from '../ledger.js'
import { __resetFreshnessCachesForTests } from '../freshness.js'
import { signJwt, startFakeIdp, type FakeIdp } from './support/fake-idp.js'
import { openLocalLedgerDb, type LocalLedgerDb } from './support/local-db.js'
import type { SqlExecutor } from '../../../adapter/index.js'

const silent = { error: () => {}, warn: () => {}, log: () => {} }

// Top-level: the suite is SKIPPED visibly (not silently green) when the local
// database is unreachable — the helper prints the host and the createdb hint.
const db: LocalLedgerDb | null = await openLocalLedgerDb()
let idp: FakeIdp

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'crm', clientSecret: 'crm-secret' })
})
afterAll(async () => {
  await db?.close()
  await idp.close()
})

const nowS = () => Math.floor(Date.now() / 1000)
const claims = (over: Record<string, unknown> = {}) => ({
  iss: idp.issuer,
  aud: 'crm',
  iat: nowS(),
  jti: `jti-${Math.random().toString(36).slice(2)}`,
  sub: '42',
  events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
  ...over,
})

async function verified(over: Record<string, unknown> = {}) {
  const r = await verifyLogoutToken(signJwt(idp.key, claims(over)), { issuer: idp.issuer, clientId: 'crm' })
  if (!r.ok) throw new Error(`token refused: ${r.reason}`)
  return r.token
}

describe.skipIf(!db)('the ledger (real local Postgres)', () => {
  beforeEach(async () => {
    __resetJwksCacheForTests()
    __resetRevocationCacheForTests()
    __resetFreshnessCachesForTests()
    if (!db) return
    await db.sql.execute('TRUNCATE connect_logout_tokens, connect_session_revocations, users RESTART IDENTITY')
    await db.sql.execute(`INSERT INTO users (id, connect_issuer, connect_sub, credential_authority, credential_version) VALUES
      (1, $1, '42', 'connect', 1), (2, NULL, NULL, 'local', 1)`, [idp.issuer])
  })

  it('AC1: a replayed jti is refused permanently — the second apply is `replay` and no second revocation row exists', async () => {
    if (!db) return
    const t = await verified({ sid: 'S1' })
    const first = await applyLogoutToken(db.sql, t, { logger: silent })
    expect(first).toMatchObject({ outcome: 'applied', localUserId: 1 })
    const again = await applyLogoutToken(db.sql, t, { logger: silent })
    expect(again).toEqual({ outcome: 'replay' })
    const rows = await db.sql.execute('SELECT count(*)::int AS n FROM connect_session_revocations WHERE jti = $1', [t.jti])
    expect(rows[0]?.n).toBe(1)
    const ledger = await db.sql.execute('SELECT count(*)::int AS n FROM connect_logout_tokens WHERE jti = $1', [t.jti])
    expect(ledger[0]?.n).toBe(1)
  })

  it('the ledger key is the LOCAL user id resolved from (issuer, sub): an OTP session with only a local id is revoked', async () => {
    if (!db) return
    const authTime = nowS() - 60
    const t = await verified()
    expect(await applyLogoutToken(db.sql, t, { logger: silent })).toMatchObject({ outcome: 'applied', localUserId: 1 })
    // An app_local session carries no Connect claims of its own — just the local id.
    expect(await isSessionRevokedForToken(db.sql.execute, { localUserId: 1, issuedAtSeconds: authTime }, Date.now(), { logger: silent })).toBe(true)
    // A stranger's local id is not.
    expect(await isSessionRevokedForToken(db.sql.execute, { localUserId: 2, issuedAtSeconds: authTime }, Date.now(), { logger: silent })).toBe(false)
    // A session minted AFTER the revocation is fine — a logout is not a ban.
    __resetRevocationCacheForTests()
    expect(await isSessionRevokedForToken(db.sql.execute, { localUserId: 1, issuedAtSeconds: nowS() + 5 }, Date.now(), { logger: silent })).toBe(false)
  })

  it('a sid-scoped logout ends ONE IdP session (D12): matched by sid, never by sub or local id', async () => {
    if (!db) return
    const authTime = nowS() - 60
    const t = await verified({ sid: 'S-browser-1' })
    await applyLogoutToken(db.sql, t, { logger: silent })
    const bySid = await readConnectSessionRevocation(db.sql.execute, { issuer: idp.issuer, sub: '42', sid: 'S-browser-1', localUserId: 1, issuedAtSeconds: authTime })
    expect(bySid.revoked).toBe(true)
    expect(typeof bySid.revokedAfter).toBe('number')
    const otherBrowser = await readConnectSessionRevocation(db.sql.execute, { issuer: idp.issuer, sub: '42', sid: 'S-browser-2', localUserId: 1, issuedAtSeconds: authTime })
    expect(otherBrowser.revoked).toBe(false)
    const derivedNoSid = await readConnectSessionRevocation(db.sql.execute, { issuer: idp.issuer, sub: '42', localUserId: 1, issuedAtSeconds: authTime })
    expect(derivedNoSid.revoked).toBe(false)
  })

  it('a sid-only token (no sub) resolves no local user and is enforceable only by sid', async () => {
    if (!db) return
    const t = await verified({ sub: undefined, sid: 'S-only' })
    expect(await applyLogoutToken(db.sql, t, { logger: silent })).toMatchObject({ outcome: 'applied', localUserId: null })
    expect((await readConnectSessionRevocation(db.sql.execute, { issuer: idp.issuer, sid: 'S-only', issuedAtSeconds: nowS() - 60 })).revoked).toBe(true)
    expect((await readConnectSessionRevocation(db.sql.execute, { localUserId: 1, issuedAtSeconds: nowS() - 60 })).revoked).toBe(false)
  })

  it('a token carrying cv raises users.credential_version in the same transaction that claims the jti', async () => {
    if (!db) return
    const t = await verified({ cv: 5 })
    await applyLogoutToken(db.sql, t, { logger: silent })
    const rows = await db.sql.execute('SELECT credential_version FROM users WHERE id = 1')
    expect(rows[0]?.credential_version).toBe(5)
    // A lower cv never lowers it.
    await applyLogoutToken(db.sql, await verified({ cv: 3 }), { logger: silent })
    expect((await db.sql.execute('SELECT credential_version FROM users WHERE id = 1'))[0]?.credential_version).toBe(5)
  })

  it('a write failure is `unavailable` (transient) and burns no jti', async () => {
    if (!db) return
    const t = await verified()
    const broken = {
      execute: db.sql.execute,
      transaction: <T,>(fn: (tx: { execute: SqlExecutor }) => Promise<T>) =>
        db!.sql.transaction(async (tx) => {
          await fn(tx)
          throw new Error('disk full')
        }),
    }
    expect(await applyLogoutToken(broken, t, { logger: silent })).toEqual({ outcome: 'unavailable' })
    expect((await db.sql.execute('SELECT count(*)::int AS n FROM connect_logout_tokens'))[0]?.n).toBe(0)
    // The retry genuinely retries.
    expect(await applyLogoutToken(db.sql, t, { logger: silent })).toMatchObject({ outcome: 'applied' })
    expect(await applyLogoutToken(null, t, { logger: silent })).toEqual({ outcome: 'unavailable' })
  })

  it('an unreadable store refuses a Connect-bound credential and admits an unbound one, and caches neither', async () => {
    if (!db) return
    const throwing = async () => {
      throw new Error('store down')
    }
    expect(await isSessionRevokedForToken(throwing, { issuer: idp.issuer, sub: '42', localUserId: 1, issuedAtSeconds: nowS() }, Date.now(), { logger: silent })).toBe(true)
    expect(await isSessionRevokedForToken(throwing, { localUserId: 2, issuedAtSeconds: nowS() }, Date.now(), { logger: silent })).toBe(false)
    // Back on a readable store, the bound credential is admitted (nothing was cached).
    expect(await isSessionRevokedForToken(db.sql.execute, { issuer: idp.issuer, sub: '42', localUserId: 1, issuedAtSeconds: nowS() }, Date.now(), { logger: silent })).toBe(false)
    expect(await isSessionRevokedForToken(null, { issuer: idp.issuer, sub: '42', issuedAtSeconds: nowS() }, Date.now(), { logger: silent })).toBe(true)
  })

  it('the 60 s cache is bounded by maxAgeMs: a revocation landed after a cached "no" is seen when the caller asks for a younger answer', async () => {
    if (!db) return
    const authTime = nowS() - 60
    const id = { issuer: idp.issuer, sub: '42', localUserId: 1, issuedAtSeconds: authTime }
    const t0 = Date.now()
    expect(await isSessionRevokedForToken(db.sql.execute, id, t0, { logger: silent })).toBe(false)
    await applyLogoutToken(db.sql, await verified(), { logger: silent })
    // Default: the cached "no" is served for up to 60 s.
    expect(await isSessionRevokedForToken(db.sql.execute, id, t0 + 30_000, { logger: silent })).toBe(false)
    // A caller that may only accept a 25 s-old answer gets the truth.
    expect(await isSessionRevokedForToken(db.sql.execute, id, t0 + 30_000, { maxAgeMs: 25_000, logger: silent })).toBe(true)
  })

  it('pruning drops replay rows past their guard and keeps live ones', async () => {
    if (!db) return
    await db.sql.execute(`INSERT INTO connect_logout_tokens (connect_issuer, jti, expires_at) VALUES ($1, 'old', now() - interval '1 minute'), ($1, 'live', now() + interval '10 minutes')`, [idp.issuer])
    await pruneExpiredLogoutTokens(db.sql.execute, silent)
    const rows = await db.sql.execute('SELECT jti FROM connect_logout_tokens ORDER BY jti')
    expect(rows.map((r) => r.jti)).toEqual(['live'])
  })
})

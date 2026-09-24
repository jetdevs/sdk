/**
 * p77 follow-up (FIX-connect-followups, found in STORY-018) — the BUILT
 * package keeps ONE copy of its process-local caches across entry points.
 *
 * WHY. tsup bundles each entry (`dist/next-auth/index.js`,
 * `dist/server/revocation/index.js`, …) self-contained, so before the fix
 * each carried its own `authorityCache`, `lastGood`, `revokedCache`, … and a
 * reset or write through one entry never reached the other. This suite
 * imports TWO BUILT ENTRIES FROM dist — exactly what an app's
 * `@jetdevs/connect/next-auth` and `@jetdevs/connect/server/revocation`
 * imports resolve to — and shows a write/reset through one is seen by the
 * other. It reads dist, so run `pnpm build` first; it fails (never skips)
 * when dist is missing, because a green run without dist would prove nothing.
 *
 * Real local Postgres for the authority cache (CORE_TEST_DATABASE_URL, host
 * printed, non-loopback refused — support/local-db.ts); the maintenance
 * cache uses an in-test fetch (the IdP's reply), no module mocks.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openLocalLedgerDb, type LocalLedgerDb } from '../server/revocation/__tests__/support/local-db.js'

const distUrl = (p: string) => new URL(`../../dist/${p}`, import.meta.url)
const NEXT_AUTH = distUrl('next-auth/index.js')
const REVOCATION = distUrl('server/revocation/index.js')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nextAuth: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let revocation: any
let db: LocalLedgerDb | null = null

beforeAll(async () => {
  for (const u of [NEXT_AUTH, REVOCATION]) {
    if (!existsSync(fileURLToPath(u))) throw new Error(`${fileURLToPath(u)} missing — run \`pnpm build\` in core-sdk/connect first`)
  }
  nextAuth = await import(NEXT_AUTH.href)
  revocation = await import(REVOCATION.href)
  db = await openLocalLedgerDb()
})

afterAll(async () => {
  await db?.close()
})

describe('dist entries share ONE process-local cache (not one per entry)', () => {
  it('the two entries are different bundles (the premise)', () => {
    expect(NEXT_AUTH.href).not.toBe(REVOCATION.href)
    expect(typeof nextAuth.stampOnSignIn).toBe('function')
    expect(typeof revocation.forgetCredentialAuthority).toBe('function')
  })

  it("authority cache: forgetCredentialAuthority through ./server/revocation is seen by ./next-auth's stampOnSignIn", async () => {
    if (!db) throw new Error('local Postgres unreachable — this suite needs it')
    revocation.__resetFreshnessCachesForTests()
    const id = Number((await db.sql.execute(`INSERT INTO users DEFAULT VALUES RETURNING id`))[0]!.id)
    const stamp = async () => {
      const token: Record<string, unknown> = {}
      await nextAuth.stampOnSignIn(token, null, { id }, { execute: db!.sql.execute })
      return token.localCv
    }
    expect(await stamp()).toBe(1) // read through ./next-auth → cached
    await db.sql.execute(`UPDATE users SET credential_version = 2 WHERE id = $1`, [id])
    expect(await stamp()).toBe(1) // the cache is real: still the cached row
    revocation.forgetCredentialAuthority(id) // through the OTHER entry
    expect(await stamp()).toBe(2) // before the fix: 1 for up to 60 s
    await db.sql.execute(`UPDATE users SET credential_version = 3 WHERE id = $1`, [id])
    revocation.__resetFreshnessCachesForTests() // the test reset, through the other entry
    expect(await stamp()).toBe(3)
  })

  it("maintenance cache: a good read through ./next-auth is served by ./server/revocation's reader, and a reset through ./server/revocation empties ./next-auth's", async () => {
    revocation.__resetMaintenanceCacheForTests()
    const issuer = 'https://idp.shared-state.test'
    const good = async () => new Response(JSON.stringify({ active: false, jti: null }), { status: 200, headers: { 'content-type': 'application/json' } })
    const down = async () => {
      throw new Error('idp down')
    }
    const cfg = (fetchImpl: typeof fetch) => ({ issuer, rpKey: 'k', maxAgeMs: 0, fetchImpl })

    expect(await nextAuth.isEstatePaused({ read: cfg(good as typeof fetch) })).toBe(false) // write through ./next-auth
    const served = await revocation.readEstateMaintenance(cfg(down as typeof fetch)) // read through ./server/revocation
    expect(served).toMatchObject({ ok: true, fromCache: true, state: { active: false } })

    revocation.__resetMaintenanceCacheForTests() // reset through ./server/revocation
    // ./next-auth now has no last good read: an unreadable switch fails closed (paused).
    expect(await nextAuth.isEstatePaused({ read: cfg(down as typeof fetch) })).toBe(true)
  })
})

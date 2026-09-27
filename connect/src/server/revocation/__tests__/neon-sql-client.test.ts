/**
 * p77 follow-up (FIX-connect-followups) — `sqlClientFromNeon` against the
 * REAL local Postgres through the REAL @neondatabase/serverless driver.
 *
 * WHY. superhost-app runs `drizzle-orm/neon-serverless` on Vercel: its
 * privileged `$client` is a neon `Pool` speaking Postgres over a WebSocket.
 * The revocation module's transactions (the logout receiver's claim-then-
 * insert, the handoff adapter's leased writes) must hold BEGIN…COMMIT on ONE
 * connection. This suite runs the driver end to end — Pool.connect() →
 * WebSocket → a local ws→TCP proxy (support/ws-pg-proxy.ts, the part Neon's
 * edge proxy plays in production) → localhost:5432 — and proves:
 * one backend and one txid per transaction, rollback, isolation from other
 * connections, real row locks, a broken connection dropped from the pool, a
 * single Client serialised, the stateless HTTP `neon()` function refused, and
 * the SDK's own `applyLogoutToken` transaction over it.
 *
 * NOT covered here (needs Vercel): the Neon edge proxy itself, TLS over wss,
 * and `neonConfig.poolQueryViaFetch` (Pool.query over HTTP — the adapter
 * never uses HTTP for a transaction either way: transactions always go
 * through `pool.connect()`).
 *
 * The driver is borrowed from the sibling `core` package (same version as
 * superhost-app, 0.10.4) through createRequire — no install, no new
 * dependency. URL: CORE_TEST_DATABASE_URL; any non-loopback host is refused
 * before connecting; the host is printed first.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyLogoutToken, isConnectSessionRevoked } from '../ledger.js'
import { NeonHttpDriverRefusedError, sqlClientFromNeon } from '../sql-client.js'
import type { RpSqlClient } from '../../../adapter/index.js'
import { assertLocalUrl, LOCAL_TEST_DB_URL } from './support/local-db.js'
import { startWsPgProxy, type WsPgProxy } from './support/ws-pg-proxy.js'

const requireFromCore = createRequire(new URL('../../../../../core/package.json', import.meta.url))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const neonMod = requireFromCore('@neondatabase/serverless') as any
const { Pool, Client, neon, neonConfig } = neonMod

function neonVersion(): string {
  const main = requireFromCore.resolve('@neondatabase/serverless')
  return JSON.parse(readFileSync(join(dirname(main), 'package.json'), 'utf8')).version
}

const parsed = assertLocalUrl(LOCAL_TEST_DB_URL)
console.log(`[p77 neon-sql-client test] database host: ${parsed.hostname}:${parsed.port || 5432}${parsed.pathname} (via @neondatabase/serverless ${neonVersion()} over a local WebSocket proxy)`)

const schema = `p77_neon_${randomBytes(4).toString('hex')}`
const ISSUER = 'https://idp.neon.test'

let proxy: WsPgProxy
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any
let sql: RpSqlClient
let dbDown = false

function poolConfig(max = 4) {
  return { connectionString: LOCAL_TEST_DB_URL, max, options: `-c search_path=${schema},public` }
}

beforeAll(async () => {
  proxy = await startWsPgProxy()
  neonConfig.wsProxy = (host: string, port: number | string) => `127.0.0.1:${proxy.port}/v1?address=${host}:${port}`
  neonConfig.useSecureWebSocket = false
  neonConfig.pipelineConnect = false
  neonConfig.pipelineTLS = false
  pool = new Pool(poolConfig())
  pool.on('error', () => {})
  try {
    await pool.query('select 1')
  } catch (err) {
    console.warn(`[p77 neon-sql-client test] SKIPPING: ${parsed.host}${parsed.pathname} unreachable through the neon driver (${err instanceof Error ? err.message : String(err)})`)
    dbDown = true
    return
  }
  await pool.query(`CREATE SCHEMA ${schema}`)
  await pool.query(`
    CREATE TABLE ${schema}.probe (id serial PRIMARY KEY, label text NOT NULL);
    CREATE TABLE ${schema}.users (
      id serial PRIMARY KEY, connect_issuer text, connect_sub text,
      credential_authority varchar(16) NOT NULL DEFAULT 'local', credential_version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE ${schema}.connect_logout_tokens (
      connect_issuer text NOT NULL, jti text NOT NULL, expires_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (connect_issuer, jti)
    );
    CREATE TABLE ${schema}.connect_session_revocations (
      id bigserial PRIMARY KEY, connect_issuer text NOT NULL, connect_sub text, connect_sid text,
      local_user_id integer, jti text NOT NULL, revoked_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  sql = sqlClientFromNeon(pool)
})

afterAll(async () => {
  if (pool) {
    if (!dbDown) await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
    await pool.end().catch(() => {})
  }
  await proxy?.close()
})

const count = async (label: string) => Number((await sql.execute(`SELECT count(*)::int AS n FROM probe WHERE label = $1`, [label]))[0]!.n)

describe('sqlClientFromNeon — @neondatabase/serverless Pool over a WebSocket, real local Postgres', () => {
  it('really goes through the neon WebSocket path, and execute binds parameters', async () => {
    if (dbDown) return
    expect(proxy.connections()).toBeGreaterThan(0)
    const rows = await sql.execute(`SELECT $1::int + $2::int AS sum, current_schema() AS s`, [2, 3])
    expect(rows).toEqual([{ sum: 5, s: schema }])
  })

  it('a transaction is ONE backend and ONE txid from BEGIN to COMMIT, and commits', async () => {
    if (dbDown) return
    const seen = await sql.transaction(async (tx) => {
      const a = (await tx.execute(`SELECT pg_backend_pid() AS pid, txid_current() AS xid`))[0]!
      await tx.execute(`INSERT INTO probe (label) VALUES ($1)`, ['commit'])
      const b = (await tx.execute(`SELECT pg_backend_pid() AS pid, txid_current() AS xid`))[0]!
      return { a, b }
    })
    expect(seen.a.pid).toBe(seen.b.pid)
    expect(seen.a.xid).toBe(seen.b.xid)
    expect(await count('commit')).toBe(1)
  })

  it('a throw inside rolls back and rethrows the same error', async () => {
    if (dbDown) return
    const boom = new Error('boom')
    await expect(
      sql.transaction(async (tx) => {
        await tx.execute(`INSERT INTO probe (label) VALUES ($1)`, ['rollback'])
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(await count('rollback')).toBe(0)
  })

  it('an open transaction is invisible to other connections until COMMIT (it is not an autocommitting HTTP call)', async () => {
    if (dbDown) return
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let inserted!: () => void
    const didInsert = new Promise<void>((r) => (inserted = r))
    const tx = sql.transaction(async (t) => {
      await t.execute(`INSERT INTO probe (label) VALUES ($1)`, ['isolated'])
      inserted()
      await gate
    })
    await didInsert
    expect(await count('isolated')).toBe(0) // another pooled connection
    release()
    await tx
    expect(await count('isolated')).toBe(1)
  })

  it('holds real row locks: a second transaction cannot take the row a first one locked', async () => {
    if (dbDown) return
    const id = (await sql.execute(`INSERT INTO probe (label) VALUES ('lock') RETURNING id`))[0]!.id
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let locked!: () => void
    const didLock = new Promise<void>((r) => (locked = r))
    const holder = sql.transaction(async (t) => {
      await t.execute(`SELECT id FROM probe WHERE id = $1 FOR UPDATE`, [id])
      locked()
      await gate
    })
    await didLock
    await expect(
      sql.transaction(async (t) => {
        await t.execute(`SET LOCAL lock_timeout = '200ms'`)
        await t.execute(`SELECT id FROM probe WHERE id = $1 FOR UPDATE`, [id])
      }),
    ).rejects.toMatchObject({ code: '55P03' })
    release()
    await holder
  })

  it('a connection that dies mid-transaction is released WITH the error — the pool drops it and the next transaction works', async () => {
    if (dbDown) return
    const small = new Pool(poolConfig(1))
    small.on('error', () => {})
    const s = sqlClientFromNeon(small)
    const before = (await s.execute(`SELECT pg_backend_pid() AS pid`))[0]!.pid
    await expect(
      s.transaction(async (t) => {
        await t.execute(`SELECT pg_terminate_backend(pg_backend_pid())`)
      }),
    ).rejects.toBeTruthy()
    const after = await s.transaction(async (t) => (await t.execute(`SELECT pg_backend_pid() AS pid`))[0]!.pid)
    expect(after).not.toBe(before)
    await small.end().catch(() => {})
  })

  it("the SDK's own applyLogoutToken runs its claim + insert transaction over the neon Pool; a replay records nothing", async () => {
    if (dbDown) return
    const uid = Number((await sql.execute(`INSERT INTO users (connect_issuer, connect_sub) VALUES ($1, 'sub-neon') RETURNING id`, [ISSUER]))[0]!.id)
    const now = Math.floor(Date.now() / 1000)
    const token = { issuer: ISSUER, sub: 'sub-neon', sid: null, jti: randomUUID(), issuedAt: now, replayGuardUntil: now + 600, reason: null, cv: 2 }
    const first = await applyLogoutToken(sql, token as never)
    expect(first).toMatchObject({ outcome: 'applied', localUserId: uid })
    expect(await applyLogoutToken(sql, token as never)).toEqual({ outcome: 'replay' })
    const n = await sql.execute(`SELECT count(*)::int AS n FROM connect_session_revocations WHERE jti = $1`, [token.jti])
    expect(n[0]!.n).toBe(1)
    expect(await isConnectSessionRevoked(sql.execute, { issuer: ISSUER, sub: 'sub-neon', localUserId: uid, issuedAtSeconds: now - 60 })).toBe(true)
    expect((await sql.execute(`SELECT credential_version FROM users WHERE id = $1`, [uid]))[0]!.credential_version).toBe(2)
  })

  it('a single connected neon Client: concurrent transactions and statements are serialised, never interleaved', async () => {
    if (dbDown) return
    const client = new Client({ connectionString: LOCAL_TEST_DB_URL, options: `-c search_path=${schema},public` })
    client.on('error', () => {})
    await client.connect()
    const one = sqlClientFromNeon(client)
    const order: string[] = []
    const a = one.transaction(async (t) => {
      order.push('a:begin')
      await t.execute(`INSERT INTO probe (label) VALUES ('client-a')`)
      await new Promise((r) => setTimeout(r, 50))
      const mine = await t.execute(`SELECT count(*)::int AS n FROM probe WHERE label LIKE 'client-%'`)
      order.push('a:commit')
      return mine[0]!.n
    })
    const b = one.execute(`INSERT INTO probe (label) VALUES ('client-b') RETURNING id`).then(() => order.push('b'))
    const c = one.transaction(async (t) => {
      order.push('c:begin')
      await t.execute(`INSERT INTO probe (label) VALUES ('client-c')`)
      throw new Error('c fails')
    })
    expect(await a).toBe(1) // b and c had not run inside a's transaction
    await b
    await expect(c).rejects.toThrow('c fails')
    expect(order).toEqual(['a:begin', 'a:commit', 'b', 'c:begin'])
    expect(await count('client-b')).toBe(1)
    expect(await count('client-c')).toBe(0)
    await client.end().catch(() => {})
  })

  it('the stateless HTTP query function (neon(url)) is refused at construction; a non-driver too', () => {
    const http = neon('postgres://nobody@localhost:5432/none')
    expect(() => sqlClientFromNeon(http)).toThrow(NeonHttpDriverRefusedError)
    expect(() => sqlClientFromNeon({} as never)).toThrow(TypeError)
  })
})

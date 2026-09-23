/**
 * p77 STORY-004 — operator leases on a REAL local Postgres, two concurrent
 * connections (AC11, AC12, AC13 — the P77-13 build decision), plus the
 * reconciler's SKIP LOCKED claim SQL.
 *
 * URL: `CORE_TEST_DATABASE_URL` (default postgres://localhost:5432/core_sdk_p77_test),
 * localhost only. `postgres` is borrowed from core's node_modules (STORY-003).
 * Each run creates a scratch schema `p77_lease_<hex>` with `connect_operator_leases`
 * in exactly the M4 shape (`OPERATOR_LEASE_DDL`), a `things` table for "the op's
 * uncommitted INSERT", and a minimal `credential_handoff` for the claim SQL; the
 * schema is dropped after.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  LEASE_CLAIM_SQL,
  LEASE_TRANSACTION_SETTINGS,
  OPERATOR_LEASE_DDL,
  OperatorLeaseExpiredError,
  claimOperatorLease,
  countInFlightLeases,
  drainLeases,
  finishLease,
  openLease,
  withOperatorLease,
} from '../lease.js'
import { RECONCILER_CLAIM_SQL } from '../reconciler.js'
import { sqlClientFromPostgresJs } from '../../revocation/sql-client.js'
import { assertLocalUrl, LOCAL_TEST_DB_URL } from '../../revocation/__tests__/support/local-db.js'
import type { RpSqlClient } from '../../../adapter/index.js'

const requireFromCore = createRequire(new URL('../../../../../core/package.json', import.meta.url))

interface Conn {
  raw: any
  sql: RpSqlClient
  statements: string[]
}

let schema = ''
let admin: any = null
let c1: Conn
let c2: Conn
/** Observer: reads while c1 holds a lock and c2 is blocked in a drain (each Conn has ONE connection). */
let c3: Conn
let available = false

function connect(schemaName: string): Conn {
  const postgres = requireFromCore('postgres') as (url: string, opts: Record<string, unknown>) => any
  const statements: string[] = []
  const raw = postgres(LOCAL_TEST_DB_URL, {
    max: 1, // ONE session per Conn — the two Conns are two real Postgres backends
    onnotice: () => {},
    connect_timeout: 3,
    connection: { search_path: `${schemaName},public` },
    debug: (_c: unknown, query: string) => statements.push(query),
  })
  return { raw, sql: sqlClientFromPostgresJs(raw), statements }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Whether a promise has settled within `ms`. */
async function settledWithin<T>(p: Promise<T>, ms: number): Promise<boolean> {
  const marker = Symbol('pending')
  const r = await Promise.race([p.then(() => true, () => true), sleep(ms).then(() => marker)])
  return r !== marker
}

beforeAll(async () => {
  const parsed = assertLocalUrl(LOCAL_TEST_DB_URL)
  console.log(`[p77 STORY-004 lease test] database host: ${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`)
  schema = `p77_lease_${randomBytes(4).toString('hex')}`
  const postgres = requireFromCore('postgres') as (url: string, opts: Record<string, unknown>) => any
  admin = postgres(LOCAL_TEST_DB_URL, { max: 1, onnotice: () => {}, connect_timeout: 3 })
  try {
    await admin`select 1`
  } catch (error) {
    console.warn(`[p77 STORY-004 lease test] SKIPPING: ${parsed.host}${parsed.pathname} unreachable (${error instanceof Error ? error.message : String(error)})`)
    await admin.end({ timeout: 1 }).catch(() => {})
    admin = null
    return
  }
  await admin.unsafe(`CREATE SCHEMA ${schema}`)
  await admin.unsafe(`SET search_path TO ${schema}, public`)
  await admin.unsafe(OPERATOR_LEASE_DDL)
  await admin.unsafe(`
    CREATE TABLE ${schema}.things (id serial PRIMARY KEY, op_id uuid NOT NULL, note text);
    CREATE TABLE ${schema}.credential_handoff (
      handoff_id uuid PRIMARY KEY,
      local_user_id integer,
      state varchar(16) NOT NULL,
      prepared_at timestamptz NOT NULL DEFAULT now(),
      next_attempt_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  c1 = connect(schema)
  c2 = connect(schema)
  c3 = connect(schema)
  await c1.raw`select 1`
  await c2.raw`select 1`
  await c3.raw`select 1`
  available = true
})

afterAll(async () => {
  await c1?.raw?.end({ timeout: 5 }).catch(() => {})
  await c2?.raw?.end({ timeout: 5 }).catch(() => {})
  await c3?.raw?.end({ timeout: 5 }).catch(() => {})
  if (admin) {
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
    await admin.end({ timeout: 5 }).catch(() => {})
  }
})

const skipIfDown = () => !available

describe('operator leases — real Postgres, two sessions', () => {
  it('the M4 table exists in exactly the spec shape, with the partial index', async () => {
    if (skipIfDown()) return
    const cols = await c1.sql.execute(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'connect_operator_leases' ORDER BY ordinal_position`,
      [schema],
    )
    expect(cols.map((c) => [c.column_name, c.data_type, c.is_nullable])).toEqual([
      ['op_id', 'uuid', 'NO'],
      ['op', 'text', 'NO'],
      ['source_user_ref', 'text', 'YES'],
      ['operator_jti', 'text', 'NO'],
      ['started_at', 'timestamp with time zone', 'NO'],
      ['lease_until', 'timestamp with time zone', 'NO'],
      ['finished_at', 'timestamp with time zone', 'YES'],
      ['outcome', 'text', 'YES'],
    ])
    const idx = await c1.sql.execute(`SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'connect_operator_leases_live_idx'`, [schema])
    expect(String(idx[0]?.indexdef)).toMatch(/\(lease_until\) WHERE \(finished_at IS NULL\)/)
  })

  it('openLease → a leased transaction claims and writes; finishLease records the outcome; a finished op cannot claim again', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    const opened = await openLease(c1.sql, { opId, op: 'prepare', sourceUserRef: '1', operatorJti: 'J1' })
    expect(opened.opId).toBe(opId)
    expect(await countInFlightLeases(c1.sql)).toBeGreaterThanOrEqual(1)
    const leased = withOperatorLease(c1.sql, opId)
    c1.statements.length = 0
    await leased.transaction(async (tx) => {
      await tx.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'ok')`, [opId])
    })
    // AC13's ordering: BEGIN, the three SET LOCALs, THEN the claim — before any potentially blocking statement.
    const inTx = c1.statements.slice(c1.statements.findIndex((s) => /^begin/i.test(s)))
    expect(inTx.slice(1, 4)).toEqual([...LEASE_TRANSACTION_SETTINGS])
    expect(inTx[4]).toBe(LEASE_CLAIM_SQL)
    expect(inTx[4]).toMatch(/outcome IS NULL/)
    expect(inTx[4]).toMatch(/clock_timestamp\(\)/)
    expect(inTx[4]).not.toMatch(/> now\(\)/)
    // The leased db's plain execute is leased too.
    await leased.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'plain')`, [opId])
    expect((await c1.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(2)
    await finishLease(c1.sql, opId, 'ok')
    const row = (await c1.sql.execute(`SELECT finished_at, outcome FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0]
    expect(row.finished_at).not.toBeNull()
    expect(row.outcome).toBe('ok')
    await expect(leased.transaction(async () => 'x')).rejects.toBeInstanceOf(OperatorLeaseExpiredError)
  })

  it('AC11 — an op whose lease has been drained: its next transaction finds no live lease, rolls back op_expired, nothing written', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'prepare', sourceUserRef: '2', operatorJti: 'J1' })
    expect(await drainLeases(c2.sql)).toEqual({ expired: 1 })
    const leased = withOperatorLease(c1.sql, opId)
    await expect(
      leased.transaction(async (tx) => {
        await tx.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'must not land')`, [opId])
      }),
    ).rejects.toMatchObject({ code: 'op_expired', opId })
    expect((await c2.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(0)
    const row = (await c2.sql.execute(`SELECT outcome, finished_at, lease_until <= clock_timestamp() AS expired FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0]
    expect(row).toMatchObject({ outcome: 'drained', finished_at: null, expired: true })
    // A second drain finds nothing (idempotent, the count is exact).
    expect(await drainLeases(c2.sql)).toEqual({ expired: 0 })
    // finishLease keeps the drain's word.
    await finishLease(c1.sql, opId, 'op_expired')
    expect((await c2.sql.execute(`SELECT outcome FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0].outcome).toBe('drained')
  })

  it('AC11 — drainLeases while a transaction holds its lease row blocks until that transaction ends, then reports expired 1', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'fence', sourceUserRef: '3', operatorJti: 'J1' })
    let releaseHolder!: () => void
    const gate = new Promise<void>((r) => { releaseHolder = r })
    let holderEndedAt = 0
    const holder = withOperatorLease(c1.sql, opId).transaction(async (tx) => {
      await tx.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'held')`, [opId])
      await gate
      holderEndedAt = Date.now()
    })
    await sleep(50) // the claim has run; the row lock is held
    const drain = drainLeases(c2.sql)
    try {
      expect(await settledWithin(drain, 300)).toBe(false) // blocked on the FOR UPDATE lock
      // While drain waits, the holder's INSERT is invisible (uncommitted) — observed on a third session.
      expect((await c3.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(0)
    } finally {
      releaseHolder()
    }
    await holder
    const result = await drain
    const drainReturnedAt = Date.now()
    expect(result).toEqual({ expired: 1 })
    expect(drainReturnedAt).toBeGreaterThanOrEqual(holderEndedAt)
    // The holder's INSERT is visible to the lift's counts once drain returned.
    expect((await c2.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(1)
    // And the op cannot begin another transaction.
    await expect(withOperatorLease(c1.sql, opId).transaction(async () => 1)).rejects.toMatchObject({ code: 'op_expired' })
  }, 15_000)

  it('AC12 — claimed at t=29 s, still holding the row lock at t=31 s (lease EXPIRED, not finished): drain waits on the lock and reports it drained; the INSERT is committed before drain returns, never after', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'prepare', sourceUserRef: '4', operatorJti: 'J1', leaseSeconds: 1 })
    let releaseHolder!: () => void
    const gate = new Promise<void>((r) => { releaseHolder = r })
    let commitObservedAt = 0
    const holder = withOperatorLease(c1.sql, opId).transaction(async (tx) => {
      // claimed inside the lease (t ≈ 0 of a 1 s lease)
      await tx.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'late commit')`, [opId])
      await gate
    })
    await sleep(1_300) // the lease is now EXPIRED while the transaction still holds its row lock
    const expired = (await c2.sql.execute(`SELECT lease_until <= clock_timestamp() AS expired, outcome, finished_at FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0]
    expect(expired).toMatchObject({ expired: true, outcome: null, finished_at: null })
    // The naive drain (`lease_until > now()`) would match nothing here and return at once. Ours must wait.
    const naiveWouldSkip = (await c2.sql.execute(`SELECT count(*)::int AS n FROM connect_operator_leases WHERE op_id = $1::uuid AND finished_at IS NULL AND lease_until > now()`, [opId]))[0].n
    expect(naiveWouldSkip).toBe(0)
    const drain = drainLeases(c2.sql)
    try {
      expect(await settledWithin(drain, 300)).toBe(false)
      // The INSERT is not visible while drain waits (uncommitted) — observed on a third session.
      expect((await c3.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(0)
    } finally {
      releaseHolder()
    }
    await holder.then(() => { commitObservedAt = Date.now() })
    const result = await drain
    expect(Date.now()).toBeGreaterThanOrEqual(commitObservedAt)
    expect(result).toEqual({ expired: 1 })
    expect((await c2.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(1)
    expect((await c2.sql.execute(`SELECT outcome FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0].outcome).toBe('drained')
  }, 15_000)

  it('AC12 (rollback variant) — the holder rolls back: drain still waits, reports drained, and nothing is committed', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'prepare', sourceUserRef: '5', operatorJti: 'J1', leaseSeconds: 1 })
    let releaseHolder!: () => void
    const gate = new Promise<void>((r) => { releaseHolder = r })
    const holder = withOperatorLease(c1.sql, opId)
      .transaction(async (tx) => {
        await tx.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'rolled back')`, [opId])
        await gate
        throw new Error('operator died')
      })
      .catch((err: Error) => err.message)
    await sleep(1_200)
    const drain = drainLeases(c2.sql)
    try {
      expect(await settledWithin(drain, 300)).toBe(false)
    } finally {
      releaseHolder()
    }
    expect(await holder).toBe('operator died')
    expect(await drain).toEqual({ expired: 1 })
    expect((await c2.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(0)
  }, 15_000)

  it('AC13 — a transaction that began BEFORE the drain committed (its now() precedes the drain) refuses its later claim op_expired: the drained outcome is checked, not lease_until > now() alone', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'reconcile', sourceUserRef: null, operatorJti: 'J1' })
    const outcome = await c1.raw.begin(async (tx: any) => {
      const txStart = (await tx.unsafe(`SELECT now() AS ts`))[0].ts as Date
      // The drain commits on the other session while this transaction is open and has claimed nothing yet.
      expect(await drainLeases(c2.sql)).toEqual({ expired: 1 })
      const drainedAt = (await c2.sql.execute(`SELECT lease_until AS ts FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0].ts as Date
      expect(drainedAt.getTime()).toBeGreaterThanOrEqual(txStart.getTime())
      // The trap: `lease_until > now()` inside THIS transaction still says "live" (now() = transaction start).
      const naive = await tx.unsafe(`SELECT 1 FROM connect_operator_leases WHERE op_id = $1::uuid AND finished_at IS NULL AND lease_until > now()`, [opId])
      expect(naive.length).toBe(1)
      // The real claim — the same statement `withOperatorLease` runs — refuses.
      try {
        await claimOperatorLease({ execute: async (text, params) => (await tx.unsafe(text, params ? [...params] : [])) as any }, opId)
        return 'claimed'
      } catch (err) {
        return err instanceof OperatorLeaseExpiredError ? err.code : String(err)
      }
    })
    expect(outcome).toBe('op_expired')
  }, 15_000)

  it('AC13 — a claim that WAITS on the drain re-evaluates against the drained row and refuses (READ COMMITTED requalification)', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'fence', sourceUserRef: '6', operatorJti: 'J1' })
    // Session 2 holds the drain UPDATE open (uncommitted) — the lease row is locked by the drain.
    let releaseDrain!: () => void
    const gate = new Promise<void>((r) => { releaseDrain = r })
    const drainTx = c2.raw.begin(async (tx: any) => {
      const rows = await tx.unsafe(`UPDATE connect_operator_leases SET lease_until = LEAST(lease_until, clock_timestamp()), outcome = 'drained' WHERE finished_at IS NULL AND outcome IS NULL RETURNING op_id`)
      expect(rows.length).toBe(1)
      await gate
    })
    await sleep(50)
    // Session 1's claim now blocks on the drain's row lock.
    const claim = withOperatorLease(c1.sql, opId).transaction(async (tx) => {
      await tx.execute(`INSERT INTO things (op_id, note) VALUES ($1::uuid, 'after drain')`, [opId])
      return 'written'
    })
    const claimSettled = claim.then(() => 'settled', () => 'settled')
    try {
      expect(await settledWithin(claimSettled, 300)).toBe(false)
      // A third session sees the row still undrained (the drain is uncommitted) and unlocked-for-reads.
      expect((await c3.sql.execute(`SELECT outcome FROM connect_operator_leases WHERE op_id = $1::uuid`, [opId]))[0].outcome).toBeNull()
    } finally {
      releaseDrain()
    }
    await drainTx
    await expect(claim).rejects.toMatchObject({ code: 'op_expired' })
    expect((await c2.sql.execute(`SELECT count(*)::int AS n FROM things WHERE op_id = $1::uuid`, [opId]))[0].n).toBe(0)
  }, 15_000)

  it('the claim is bounded: lock_timeout (5 s) is in force before the claim waits', async () => {
    if (skipIfDown()) return
    const opId = randomUUID()
    await openLease(c1.sql, { opId, op: 'fence', sourceUserRef: '7', operatorJti: 'J1' })
    const settings = await withOperatorLease(c1.sql, opId).transaction(async (tx) => {
      const r = await tx.execute(`SELECT current_setting('lock_timeout') AS l, current_setting('statement_timeout') AS s, current_setting('idle_in_transaction_session_timeout') AS i`)
      return r[0]
    })
    expect(settings).toEqual({ l: '5s', s: '10s', i: '10s' })
    // Outside the transaction the session defaults are untouched (SET LOCAL).
    const after = (await c1.sql.execute(`SELECT current_setting('lock_timeout') AS l`))[0]
    expect(after.l).toBe('0')
  })
})

describe('the reconciler claim SQL — FOR UPDATE SKIP LOCKED on a real table', () => {
  it('a row held by a live driver step is not returned; the others are, oldest first', async () => {
    if (skipIfDown()) return
    const held = randomUUID()
    const free = randomUUID()
    const notDue = randomUUID()
    await c1.sql.execute(`INSERT INTO credential_handoff (handoff_id, local_user_id, state, prepared_at, next_attempt_at) VALUES
      ($1::uuid, 1, 'prepared', now() - interval '2 minutes', now() - interval '1 minute'),
      ($2::uuid, 2, 'fenced',   now() - interval '1 minute', now() - interval '1 minute'),
      ($3::uuid, 3, 'fenced',   now(), now() + interval '1 hour')`, [held, free, notDue])
    let releaseHolder!: () => void
    const gate = new Promise<void>((r) => { releaseHolder = r })
    const holder = c1.raw.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM credential_handoff WHERE handoff_id = $1::uuid FOR UPDATE NOWAIT`, [held])
      await gate
    })
    await sleep(50)
    let claimed: Array<Record<string, unknown>> = []
    try {
      claimed = await c2.sql.transaction((tx) => tx.execute(RECONCILER_CLAIM_SQL, [10]))
    } finally {
      releaseHolder()
    }
    expect(claimed.map((r) => r.handoff_id)).toEqual([free])
    await holder
    const again = await c2.sql.transaction((tx) => tx.execute(RECONCILER_CLAIM_SQL, [10]))
    expect(again.map((r) => r.handoff_id)).toEqual([held, free])
  })
})

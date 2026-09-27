/**
 * p77 STORY-003 — structural wrappers that turn an RP's own database driver
 * into the `RpSqlClient` the revocation module runs on.
 *
 * WHY. `@jetdevs/connect` must not depend on drizzle, pg or postgres-js: every
 * RP already holds one of them at its own version, and a second copy inside
 * the SDK is the phantom-dependency trap the logout verifier's header warns
 * about. The revocation ledger and the freshness gate therefore speak one
 * driver-neutral shape — `(text, params) => rows` plus a transaction — and
 * these helpers are typed STRUCTURALLY against the two drivers in the estate,
 * so no import of either is needed here.
 *
 * postgres-js (crm, yobo, commerce-app, superhost-app via drizzle/postgres-js):
 *   `sqlClientFromPostgresJs(client)` — `client.unsafe(text, params)` and
 *   `client.begin(fn)`. Pass the raw `postgres()` client, not the drizzle
 *   wrapper (drizzle's `execute(sql.raw())` cannot bind parameters).
 *
 * node-pg (`pg.Pool`):
 *   `sqlClientFromPg(pool)` — `pool.query(text, params).rows`, and a transaction
 *   on one checked-out client with BEGIN/COMMIT/ROLLBACK.
 *
 * @neondatabase/serverless (superhost-app on Vercel, via drizzle/neon-serverless):
 *   `sqlClientFromNeon(poolOrClient)` — p77 follow-up (FIX-connect-followups).
 *   A neon `Pool` speaks pg's API over a WebSocket, so a transaction MUST run
 *   on ONE checked-out connection: BEGIN, the statements, COMMIT, all on the
 *   client `pool.connect()` returned. The stateless HTTP query function
 *   (`neon(url)`) cannot hold a transaction — every call is its own fetch and
 *   its own implicit transaction, so a BEGIN there commits nothing and locks
 *   nothing — and it answers a bare rows array, not `{ rows }`. It is REFUSED
 *   at construction, never wrapped. A single neon `Client` (one connection) is
 *   accepted: every statement and transaction on it is serialised, so no other
 *   caller's statement can land inside an open transaction.
 *   A connection that fails mid-transaction is released WITH the error, so the
 *   pool destroys it instead of handing a dead WebSocket to the next caller.
 */

import type { RpSqlClient, SqlExecutor } from '../../adapter/index.js'

/** The subset of a postgres-js `Sql` this needs. */
export interface PostgresJsLike {
  unsafe(text: string, params?: unknown[]): PromiseLike<unknown>
  begin<T>(fn: (tx: PostgresJsLike) => Promise<T>): PromiseLike<T>
}

/** The subset of a `pg.Pool` / `pg.Client` this needs. */
export interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
  connect?(): Promise<PgClientLike>
}

export interface PgClientLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
  release(err?: unknown): void
  /** pg / neon clients are EventEmitters; used to absorb a checked-out client's late 'error'. */
  on?(event: 'error', listener: (err: unknown) => void): unknown
  removeListener?(event: 'error', listener: (err: unknown) => void): unknown
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>
  const rows = (result as { rows?: unknown[] } | null)?.rows
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
}

export function sqlClientFromPostgresJs(client: PostgresJsLike): RpSqlClient {
  const executorFor =
    (c: PostgresJsLike): SqlExecutor =>
    async (text, params) =>
      rowsOf(await c.unsafe(text, params ? [...params] : []))
  return {
    execute: executorFor(client),
    transaction: (fn) => Promise.resolve(client.begin((tx) => fn({ execute: executorFor(tx) }))),
  }
}

/** BEGIN … COMMIT on ONE connection; ROLLBACK on any throw. Returns what `fn` returned. */
async function transactionOn<T>(
  client: Pick<PgClientLike, 'query'>,
  fn: (tx: { execute: SqlExecutor }) => Promise<T>,
): Promise<{ out: T } | { err: unknown; broken: boolean }> {
  try {
    await client.query('BEGIN')
    const out = await fn({
      execute: async (text, params) => rowsOf(await client.query(text, params ? [...params] : [])),
    })
    await client.query('COMMIT')
    return { out }
  } catch (err) {
    // A failed ROLLBACK means the connection itself is gone (or wedged).
    const broken = await client.query('ROLLBACK').then(
      () => false,
      () => true,
    )
    return { err, broken }
  }
}

export function sqlClientFromPg(pool: PgPoolLike): RpSqlClient {
  const execute: SqlExecutor = async (text, params) =>
    (await pool.query(text, params ? [...params] : [])).rows
  return {
    execute,
    async transaction(fn) {
      if (!pool.connect) throw new Error('sqlClientFromPg: a transaction needs a Pool with connect()')
      const client = await pool.connect()
      // A checked-out client has no pool listener: a connection that dies
      // mid-transaction (a dropped neon WebSocket, a terminated backend)
      // emits 'error' on it, and an EventEmitter 'error' with no listener
      // crashes the process. The failing statement already rejects with the
      // cause, so the event is absorbed here.
      const absorb = () => {}
      client.on?.('error', absorb)
      const r = await transactionOn(client, fn)
      if ('out' in r) {
        client.removeListener?.('error', absorb)
        client.release()
        return r.out
      }
      // Released WITH the error when broken: the pool destroys the connection
      // (the listener stays on it — its close can still emit).
      if (!r.broken) client.removeListener?.('error', absorb)
      client.release(r.broken ? r.err : undefined)
      throw r.err
    },
  }
}

/** The subset of a @neondatabase/serverless `Pool` this needs (pg's Pool API over WebSockets). */
export interface NeonPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
  connect(): Promise<PgClientLike>
  /** pg's pool counters — how a Pool is told from a single Client. */
  totalCount: number
  idleCount: number
}

/** The subset of a CONNECTED @neondatabase/serverless `Client` (one WebSocket connection) this needs. */
export interface NeonClientLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

export class NeonHttpDriverRefusedError extends TypeError {
  constructor() {
    super(
      "sqlClientFromNeon: the stateless HTTP query function (neon(url)) cannot hold a transaction — pass the @neondatabase/serverless Pool (drizzle-orm/neon-serverless's $client), not neon-http's",
    )
    this.name = 'NeonHttpDriverRefusedError'
  }
}

function isNeonPool(d: unknown): d is NeonPoolLike {
  const r = d as Record<string, unknown>
  return typeof r.query === 'function' && typeof r.connect === 'function' && typeof r.totalCount === 'number' && typeof r.idleCount === 'number'
}

/**
 * The `RpSqlClient` over @neondatabase/serverless. Pass the `Pool` (the
 * `$client` of `drizzle-orm/neon-serverless`) or a CONNECTED `Client`; the
 * HTTP function from `neon(url)` is refused (NeonHttpDriverRefusedError).
 */
export function sqlClientFromNeon(driver: NeonPoolLike | NeonClientLike): RpSqlClient {
  if (typeof driver === 'function') throw new NeonHttpDriverRefusedError()
  if (!driver || typeof (driver as { query?: unknown }).query !== 'function') {
    throw new TypeError('sqlClientFromNeon: expected a @neondatabase/serverless Pool or connected Client')
  }
  if (isNeonPool(driver)) return sqlClientFromPg(driver)

  // ONE connection: every statement and every transaction runs in turn. A
  // statement issued through the OUTER client while a transaction is open
  // waits for it to end — inside `fn`, use the `tx` executor it is given.
  const client = driver as NeonClientLike
  let tail: Promise<unknown> = Promise.resolve()
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work)
    tail = run.catch(() => {})
    return run
  }
  return {
    execute: (text, params) => serial(async () => rowsOf(await client.query(text, params ? [...params] : []))),
    transaction: (fn) =>
      serial(async () => {
        const r = await transactionOn(client, fn)
        if ('out' in r) return r.out
        throw r.err
      }),
  }
}

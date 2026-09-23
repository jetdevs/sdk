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

export function sqlClientFromPg(pool: PgPoolLike): RpSqlClient {
  const execute: SqlExecutor = async (text, params) =>
    (await pool.query(text, params ? [...params] : [])).rows
  return {
    execute,
    async transaction(fn) {
      if (!pool.connect) throw new Error('sqlClientFromPg: a transaction needs a Pool with connect()')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn({
          execute: async (text, params) => (await client.query(text, params ? [...params] : [])).rows,
        })
        await client.query('COMMIT')
        return out
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
  }
}

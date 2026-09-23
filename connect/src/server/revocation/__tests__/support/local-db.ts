/**
 * Test support (p77 STORY-003): a REAL local Postgres for the ledger tests,
 * the way `@jetdevs/core` does it (STORY-001's `local-test-db.ts`).
 *
 * URL: `CORE_TEST_DATABASE_URL`, default `postgres://localhost:5432/core_sdk_p77_test`.
 * Refuses — throws — any host other than localhost/127.0.0.1 BEFORE
 * connecting. The host is printed first.
 *
 * The driver: `@jetdevs/connect` has no database dependency by design (see
 * `sql-client.ts`), so the test borrows `postgres` from the sibling `core`
 * package's node_modules through `createRequire` — no install, no lockfile
 * change, and the SDK's own dependency list stays empty.
 *
 * Each open creates a scratch schema `p77_rev_<random>` on the connection's
 * `search_path`, with the two ledger tables (cadra-web 0129's shape) and a
 * minimal `users` table; `close()` drops it.
 */
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'

import { sqlClientFromPostgresJs } from '../../sql-client.js'
import type { RpSqlClient } from '../../../../adapter/index.js'

const requireFromCore = createRequire(new URL('../../../../../../core/package.json', import.meta.url))

export const LOCAL_TEST_DB_URL = process.env.CORE_TEST_DATABASE_URL ?? 'postgres://localhost:5432/core_sdk_p77_test'

export function assertLocalUrl(url: string): URL {
  const parsed = new URL(url)
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`refusing non-local test database host ${parsed.hostname}`)
  }
  return parsed
}

export interface LocalLedgerDb {
  schema: string
  sql: RpSqlClient
  /** Raw postgres-js client (untyped: borrowed from core). */
  raw: any
  close(): Promise<void>
}

export async function openLocalLedgerDb(): Promise<LocalLedgerDb | null> {
  const parsed = assertLocalUrl(LOCAL_TEST_DB_URL)
  console.log(`[p77 STORY-003 test] database host: ${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`)
  const postgres = requireFromCore('postgres') as (url: string, opts: Record<string, unknown>) => any
  const schema = `p77_rev_${randomBytes(4).toString('hex')}`
  const raw = postgres(LOCAL_TEST_DB_URL, {
    max: 2,
    onnotice: () => {},
    connect_timeout: 3,
    connection: { search_path: `${schema},public` },
  })
  try {
    await raw`select 1`
  } catch (error) {
    console.warn(
      `[p77 STORY-003 test] SKIPPING DB-backed tests: ${parsed.host}${parsed.pathname} unreachable (${
        error instanceof Error ? error.message : String(error)
      }). Create it: createdb -h localhost core_sdk_p77_test`,
    )
    await raw.end({ timeout: 1 }).catch(() => {})
    return null
  }
  await raw.unsafe(`CREATE SCHEMA ${schema}`)
  await raw.unsafe(`
    CREATE TABLE ${schema}.users (
      id serial PRIMARY KEY,
      connect_issuer text,
      connect_sub text,
      credential_authority varchar(16) NOT NULL DEFAULT 'local',
      credential_version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE ${schema}.connect_logout_tokens (
      connect_issuer text NOT NULL,
      jti text NOT NULL,
      expires_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (connect_issuer, jti)
    );
    CREATE TABLE ${schema}.connect_session_revocations (
      id bigserial PRIMARY KEY,
      connect_issuer text NOT NULL,
      connect_sub text,
      connect_sid text,
      local_user_id integer,
      jti text NOT NULL,
      revoked_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  return {
    schema,
    raw,
    sql: sqlClientFromPostgresJs(raw),
    close: async () => {
      await raw.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
      await raw.end({ timeout: 5 })
    },
  }
}

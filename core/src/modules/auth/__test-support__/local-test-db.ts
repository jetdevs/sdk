/**
 * Test support (p77 STORY-001): a REAL local Postgres for the credential-write
 * and schema-pin tests.
 *
 * URL: `CORE_TEST_DATABASE_URL`, default `postgres://localhost:5432/core_sdk_p77_test`
 * (the OS user). Refuses — throws — any host other than localhost/127.0.0.1,
 * before connecting, so a shared or remote database is never touched.
 * Create it once: `createdb -h localhost core_sdk_p77_test`.
 *
 * `openLocalTestDb()` resolves `null` (and warns loudly) when the database is
 * unreachable, so a machine without it skips the DB-backed suites instead of
 * failing the whole package; the warning names the skip.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export const LOCAL_TEST_DB_URL =
  process.env.CORE_TEST_DATABASE_URL ?? 'postgres://localhost:5432/core_sdk_p77_test';

export function assertLocalUrl(url: string): URL {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`refusing non-local test database host ${parsed.hostname}`);
  }
  return parsed;
}

export interface LocalTestDb {
  client: postgres.Sql;
  db: ReturnType<typeof drizzle>;
  /** Every query text the client sent, in order (postgres-js `debug`). */
  queries: string[];
  close: () => Promise<void>;
}

export async function openLocalTestDb(
  options: { searchPath?: string; url?: string } = {},
): Promise<LocalTestDb | null> {
  const url = options.url ?? LOCAL_TEST_DB_URL;
  const parsed = assertLocalUrl(url);
  const queries: string[] = [];
  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 3,
    debug: (_connection: number, query: string) => {
      queries.push(query);
    },
    ...(options.searchPath && { connection: { search_path: options.searchPath } }),
  });
  try {
    await client`select 1`;
  } catch (error) {
    console.warn(
      `[p77 test] SKIPPING DB-backed tests: local test database ${parsed.host}${parsed.pathname} unreachable ` +
        `(${error instanceof Error ? error.message : String(error)}). Create it: createdb -h localhost core_sdk_p77_test`,
    );
    await client.end({ timeout: 1 }).catch(() => {});
    return null;
  }
  queries.length = 0;
  return {
    client,
    db: drizzle(client),
    queries,
    close: () => client.end({ timeout: 5 }),
  };
}

/**
 * withRlsContext runs setRlsContext + fn inside ONE transaction.
 *
 * Before the fix it called setRlsContext on the bare client: the tx-local
 * `rls.current_org_id` died with that statement's implicit transaction, so
 * `fn` ran with no org context (RLS read zero rows).
 *
 * INTEGRATION, real local Postgres, no mocks. A single-connection pool
 * (`max: 1`), so "gone after" cannot be explained by landing on another
 * connection. URL: `CORE_TEST_DATABASE_URL`, default
 * `postgres://localhost:5432/postgres`. Refuses any non-localhost host before
 * connecting. Only reads settings; creates nothing. Skips (with a warning)
 * when the database is unreachable.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RLS_ORG_VAR, RLS_USER_VAR, setRlsContext, withRlsContext } from '../context';
import type { DbClient } from '../../db';

const URL_ = process.env.CORE_TEST_DATABASE_URL ?? 'postgres://localhost:5432/postgres';

const host = new URL(URL_).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  throw new Error(`refusing non-local test database host ${host}`);
}

const queries: string[] = [];
let client: postgres.Sql | null = null;
let db: DbClient;

async function setting(d: DbClient, name: string): Promise<string | null> {
  const rows = (await (d as any).execute(
    sql`SELECT current_setting(${name}, true) AS v`,
  )) as Array<{ v: string | null }>;
  return rows[0]?.v ?? null;
}

/** Unset = NULL (never defined) or '' (defined earlier, reverted at tx end). */
function isUnset(v: string | null): boolean {
  return v === null || v === '';
}

beforeAll(async () => {
  const c = postgres(URL_, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 3,
    debug: (_conn: number, query: string) => {
      queries.push(query);
    },
  });
  try {
    await c`select 1`;
    client = c;
    db = drizzle(c) as unknown as DbClient;
  } catch (error) {
    console.warn(
      `[rls context test] SKIPPING: local database unreachable (${error instanceof Error ? error.message : String(error)})`,
    );
    await c.end({ timeout: 1 }).catch(() => {});
  }
});

afterAll(async () => {
  await client?.end({ timeout: 5 });
});

describe('withRlsContext — one transaction around set + fn', () => {
  it('org and user context are visible inside fn and gone after', async (ctx) => {
    if (!client) ctx.skip();

    const seen = await withRlsContext(db, { orgId: 42, userId: 7 }, async (tx) => ({
      org: await setting(tx, RLS_ORG_VAR),
      user: await setting(tx, RLS_USER_VAR),
    }));

    expect(seen).toEqual({ org: '42', user: '7' });
    expect(isUnset(await setting(db, RLS_ORG_VAR))).toBe(true);
    expect(isUnset(await setting(db, RLS_USER_VAR))).toBe(true);
  });

  it('reverts the context when fn throws, and rethrows', async (ctx) => {
    if (!client) ctx.skip();

    await expect(
      withRlsContext(db, { orgId: 43 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(isUnset(await setting(db, RLS_ORG_VAR))).toBe(true);
  });

  it('reuses a transaction it is given (no nested BEGIN or SAVEPOINT)', async (ctx) => {
    if (!client) ctx.skip();

    const result = await (db as any).transaction(async (outer: DbClient) => {
      queries.length = 0;
      const inner = await withRlsContext(outer, { orgId: 44 }, async (tx) => {
        expect(tx).toBe(outer);
        return setting(tx, RLS_ORG_VAR);
      });
      const nested = queries.filter((q) => /^\s*(begin|savepoint)/i.test(q));
      return { inner, nested, afterInOuter: await setting(outer, RLS_ORG_VAR) };
    });

    expect(result.inner).toBe('44');
    expect(result.nested).toEqual([]);
    // The outer transaction owns the lifetime: still set until it ends.
    expect(result.afterInOuter).toBe('44');
    expect(isUnset(await setting(db, RLS_ORG_VAR))).toBe(true);
  });

  it('setRlsContext on a bare client does not survive to the next statement (why the wrapper needs a tx)', async (ctx) => {
    if (!client) ctx.skip();

    await setRlsContext(db, { orgId: 45 });
    expect(isUnset(await setting(db, RLS_ORG_VAR))).toBe(true);
  });
});

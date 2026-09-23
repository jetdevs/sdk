/**
 * p77 STORY-001 — the boot-time schema pin (specs.md §5.1, §5.5).
 *
 * Classification: INTEGRATION against the REAL local Postgres
 * (`__test-support__/local-test-db.ts`, localhost only). Each case builds a
 * `users` table in its own scratch schema and points the connection's
 * `search_path` at it, so the pin's default `current_schema()` path is the one
 * under test. No mocks except the logger (a spy, to read what was logged).
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { openLocalTestDb, type LocalTestDb } from './__test-support__/local-test-db';
import { assertUsersSchemaCarriesConnectColumns } from './schema-pin';

const admin = await openLocalTestDb();
const suffix = randomBytes(4).toString('hex');

const SCHEMAS = {
  full: `p77_pin_full_${suffix}`,
  bare: `p77_pin_bare_${suffix}`,
  noIssuer: `p77_pin_noissuer_${suffix}`,
};

describe.skipIf(!admin)('assertUsersSchemaCarriesConnectColumns — real local Postgres', () => {
  const opened: LocalTestDb[] = [];
  const connect = async (schema: string) => {
    const handle = (await openLocalTestDb({ searchPath: schema }))!;
    opened.push(handle);
    return handle.db;
  };
  const logger = () => ({ info: vi.fn(), warn: vi.fn() });

  beforeAll(async () => {
    const c = admin!.client;
    await c.unsafe(`create schema ${SCHEMAS.full}`);
    await c.unsafe(`create table ${SCHEMAS.full}.users (
      id serial primary key, email text, password text,
      connect_issuer varchar(255), credential_authority varchar(16) not null default 'local',
      credential_version integer not null default 1)`);
    await c.unsafe(`create schema ${SCHEMAS.bare}`);
    await c.unsafe(`create table ${SCHEMAS.bare}.users (id serial primary key, email text, password text)`);
    await c.unsafe(`create schema ${SCHEMAS.noIssuer}`);
    await c.unsafe(`create table ${SCHEMAS.noIssuer}.users (
      id serial primary key, email text, password text,
      credential_authority varchar(16) not null default 'local',
      credential_version integer not null default 1)`);
  });

  afterAll(async () => {
    for (const h of opened) await h.close();
    for (const s of Object.values(SCHEMAS)) await admin!.client.unsafe(`drop schema if exists ${s} cascade`);
    await admin!.close();
  });

  it('logs "[connect schema-pin] ok" when users carries all three columns', async () => {
    const log = logger();
    const result = await assertUsersSchemaCarriesConnectColumns(await connect(SCHEMAS.full), { logger: log });
    expect(result).toEqual({ ok: true, missing: [] });
    expect(log.info).toHaveBeenCalledWith('[connect schema-pin] ok');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('a users table lacking connect_issuer: warns schema_behind naming it, and does not throw', async () => {
    const log = logger();
    const result = await assertUsersSchemaCarriesConnectColumns(await connect(SCHEMAS.noIssuer), { logger: log });
    expect(result).toEqual({ ok: false, missing: ['connect_issuer'] });
    expect(log.warn).toHaveBeenCalledWith('[connect schema-pin] WARNING schema_behind: connect_issuer');
    expect(log.info).not.toHaveBeenCalled();
  });

  it('a pre-p79 users table: warns naming all three, and does not throw', async () => {
    const log = logger();
    const result = await assertUsersSchemaCarriesConnectColumns(await connect(SCHEMAS.bare), { logger: log });
    expect(result.missing).toEqual(['connect_issuer', 'credential_authority', 'credential_version']);
    expect(log.warn).toHaveBeenCalledWith(
      '[connect schema-pin] WARNING schema_behind: connect_issuer, credential_authority, credential_version',
    );
  });

  it('an explicit schema option overrides current_schema()', async () => {
    const log = logger();
    const onBare = await connect(SCHEMAS.bare);
    const result = await assertUsersSchemaCarriesConnectColumns(onBare, { schema: SCHEMAS.full, logger: log });
    expect(result.ok).toBe(true);
  });

  it('writes nothing: the scratch tables are unchanged', async () => {
    const c = admin!.client;
    const before = await c.unsafe(`select count(*)::int as n from information_schema.columns where table_schema like 'p77_pin_%_${suffix}'`);
    await assertUsersSchemaCarriesConnectColumns(await connect(SCHEMAS.noIssuer), { logger: logger() });
    const after = await c.unsafe(`select count(*)::int as n from information_schema.columns where table_schema like 'p77_pin_%_${suffix}'`);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe('assertUsersSchemaCarriesConnectColumns — a failed probe never throws', () => {
  it('logs schema_pin_unavailable and resolves', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const broken = { execute: async () => { throw new Error('connection refused'); } };
    const result = await assertUsersSchemaCarriesConnectColumns(broken, { logger: log });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith('[connect schema-pin] WARNING schema_pin_unavailable: connection refused');
  });
});

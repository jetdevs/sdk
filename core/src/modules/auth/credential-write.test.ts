/**
 * p77 STORY-001 — the credential-write seam (specs.md §5.1, D26; P77-21 r5).
 *
 * Three parts:
 *
 * 1. The seam itself, on the REAL local Postgres: the gate runs first and a
 *    refusal opens no transaction; an admitted write's transaction begins with
 *    the three SET LOCALs (observed on the wire and read back with
 *    current_setting); a write that reaches commit ≥ 10 s after admission is
 *    rolled back `write_deadline` (fake Date clock); a real row lock held by a
 *    second connection is refused by lock_timeout → `write_deadline`.
 * 2. Every SDK writer, called through its router config / service / reset
 *    service against real scratch tables, with a spied hashPassword and a
 *    gate: refusing → 503 maintenance, no hash, no transaction, tables' md5
 *    unchanged; admitting → gate before hash before write, the write runs
 *    under the three timeouts, and a hold past the deadline lands nothing.
 * 3. Static: every `hashPassword(` / `updatePassword(` in core/src (tests
 *    excluded) is on the allowlist below AND — for call sites — lexically
 *    inside a `withCredentialWrite(` call. A new writer, or one moved outside
 *    the seam, fails the suite naming it.
 *
 * Classification: INTEGRATION (real local Postgres, real drizzle transactions,
 * real routers/services). Stubbed: the repositories' method bodies (they write
 * REAL rows through the handle they are given) and the password hash (a spy).
 */
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { getTRPCErrorFromUnknown } from '@trpc/server/unstable-core-do-not-import';
import { eq, sql } from 'drizzle-orm';
import { integer, jsonb, pgSchema, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPasswordResetService } from '../password-reset/service';
import { createUserRouterConfig } from '../users/router-config';
import { createUserService } from '../users/service';
import { openLocalTestDb, type LocalTestDb } from './__test-support__/local-test-db';
import {
  CREDENTIAL_WRITE_DEADLINE_MS,
  CREDENTIAL_WRITE_SET_LOCALS,
  CredentialWriteRefusedError,
  credentialWriteRefusedResponse,
  isCredentialWriteRefused,
  withCredentialWrite,
  type CredentialWriteGate,
} from './credential-write';
import * as authIndex from './index';
import { createAuthRouterConfig } from './router-config';

const CORE_SRC = resolve(__dirname, '../..');

// =============================================================================
// Real local database + scratch schema
// =============================================================================

const handle: LocalTestDb | null = await openLocalTestDb();
const SCHEMA = `p77_cw_${randomBytes(4).toString('hex')}`;
const s = pgSchema(SCHEMA);
const usersT = s.table('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  name: text('name'),
  firstName: text('first_name'),
  password: text('password'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
const tokensT = s.table('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});
const logsT = s.table('auth_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  eventType: text('event_type'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
});
const scratchT = s.table('scratch', { id: serial('id').primaryKey(), note: text('note') });

const OWNED_EMAIL = 'owned@example.test';
const OLD = 'Old!Passw0rd1';
const NEW = 'N3w!Passw0rd#2';
const RESET_TOKEN = 'a'.repeat(64);

async function md5All(): Promise<string> {
  const rows = await handle!.client.unsafe(`
    select md5(
      coalesce((select string_agg(u::text, '|' order by u.id) from ${SCHEMA}.users u), '') || '#' ||
      coalesce((select string_agg(t::text, '|' order by t.id) from ${SCHEMA}.password_reset_tokens t), '') || '#' ||
      coalesce((select string_agg(l::text, '|' order by l.id) from ${SCHEMA}.auth_logs l), '')
    ) as h`);
  return rows[0]!.h as string;
}

async function readTimeouts(h: any) {
  const rows: any = await h.execute(sql`select current_setting('statement_timeout') as st,
    current_setting('lock_timeout') as lt,
    current_setting('idle_in_transaction_session_timeout') as it`);
  const r = Array.isArray(rows) ? rows[0] : rows.rows[0];
  return { statement: r.st, lock: r.lt, idle: r.it };
}

/** Index of the next `begin` the client sent at or after `from`. */
function beginIndex(from: number): number {
  const q = handle!.queries;
  for (let i = from; i < q.length; i++) if (/^\s*begin\b/i.test(q[i]!)) return i;
  return -1;
}

// One scratch schema for the whole file; created once, dropped once.
beforeAll(async () => {
  if (!handle) return;
  await handle.client.unsafe(`create schema ${SCHEMA}`);
  await handle.client.unsafe(`
    create table ${SCHEMA}.users (id serial primary key, email varchar(255) not null unique, name text,
      first_name text, password text, updated_at timestamptz default now());
    create table ${SCHEMA}.password_reset_tokens (id serial primary key, user_id integer not null,
      token text not null, expires_at timestamptz not null, used_at timestamptz);
    create table ${SCHEMA}.auth_logs (id serial primary key, user_id integer, event_type text,
      ip_address text, user_agent text, metadata jsonb);
    create table ${SCHEMA}.scratch (id serial primary key, note text);`);
});

afterAll(async () => {
  if (!handle) return;
  await handle.client.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await handle.close();
});

describe.skipIf(!handle)('withCredentialWrite — the seam on real local Postgres', () => {
  const db = handle?.db as any;

  beforeEach(async () => {
    await handle!.client.unsafe(`truncate ${SCHEMA}.users, ${SCHEMA}.password_reset_tokens,
      ${SCHEMA}.auth_logs, ${SCHEMA}.scratch restart identity`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refusing gate: the refusal propagates, fn never runs, no transaction is opened', async () => {
    const fn = vi.fn();
    const gate: CredentialWriteGate = vi.fn(async () => {
      throw new CredentialWriteRefusedError('maintenance');
    });
    const mark = handle!.queries.length;
    const err: any = await withCredentialWrite({ credentialWriteGate: gate }, { operation: 'update', db }, fn).catch((e) => e);

    expect(isCredentialWriteRefused(err)).toBe(true);
    expect(err.reason).toBe('maintenance');
    expect(gate).toHaveBeenCalledWith({ operation: 'update', db });
    expect(fn).not.toHaveBeenCalled();
    expect(beginIndex(mark)).toBe(-1);
  });

  it('admitting gate: gate first, then BEGIN and the three SET LOCALs as the first statements', async () => {
    const order: string[] = [];
    const gate: CredentialWriteGate = async () => { order.push('gate'); };
    const mark = handle!.queries.length;

    const seen = await withCredentialWrite({ credentialWriteGate: gate }, { operation: 'change-password', db }, async (tx) => {
      order.push('fn');
      return readTimeouts(tx);
    });

    expect(order).toEqual(['gate', 'fn']);
    expect(seen).toEqual({ statement: '10s', lock: '5s', idle: '10s' });
    const b = beginIndex(mark);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(handle!.queries.slice(b + 1, b + 4)).toEqual([...CREDENTIAL_WRITE_SET_LOCALS]);

    // SET LOCAL: gone once the transaction ends.
    const after = await readTimeouts(db);
    expect(after.lock).not.toBe('5s');
  });

  it('a missing gate admits (the Cadra apps pass none)', async () => {
    const out = await withCredentialWrite(undefined, { operation: 'register', db }, async (tx) => readTimeouts(tx));
    expect(out.statement).toBe('10s');
    const out2 = await withCredentialWrite({}, { operation: 'register', db }, async () => 'ok');
    expect(out2).toBe('ok');
  });

  it('commits a write that reaches commit inside the deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await withCredentialWrite(undefined, { operation: 'update', db }, async (tx) => {
      await tx.insert(scratchT).values({ note: 'in-time' });
      vi.setSystemTime(Date.now() + CREDENTIAL_WRITE_DEADLINE_MS - 1);
    });
    expect(await db.select().from(scratchT)).toHaveLength(1);
  });

  it.each([
    ['exactly at admittedAt + 10 s', CREDENTIAL_WRITE_DEADLINE_MS],
    ['past admittedAt + 10 s', CREDENTIAL_WRITE_DEADLINE_MS + 5_000],
  ])('a write reaching commit %s is rolled back write_deadline (fake clock)', async (_label, heldMs) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const err: any = await withCredentialWrite(undefined, { operation: 'update', db }, async (tx) => {
      await tx.insert(scratchT).values({ note: 'held' });
      vi.setSystemTime(Date.now() + heldMs);
    }).catch((e) => e);

    expect(isCredentialWriteRefused(err)).toBe(true);
    expect(err.reason).toBe('write_deadline');
    expect(await db.select().from(scratchT)).toHaveLength(0);
  });

  it('a writer blocked on a row lock is refused by lock_timeout (5 s) as write_deadline', async () => {
    await handle!.client.unsafe(`insert into ${SCHEMA}.users (email, password) values ('locked@example.test', 'h')`);
    const holder = (await openLocalTestDb())!;
    try {
      const released = holder.client.begin(async (t) => {
        await t.unsafe(`select id from ${SCHEMA}.users where email = 'locked@example.test' for update`);
        await new Promise((r) => setTimeout(r, 6_500));
      });
      await new Promise((r) => setTimeout(r, 200));

      const started = Date.now();
      const err: any = await withCredentialWrite(undefined, { operation: 'update', db }, async (tx) => {
        await tx.update(usersT).set({ password: 'blocked' }).where(eq(usersT.email, 'locked@example.test'));
      }).catch((e) => e);
      const waited = Date.now() - started;

      expect(isCredentialWriteRefused(err)).toBe(true);
      expect(err.reason).toBe('write_deadline');
      expect(waited).toBeGreaterThanOrEqual(4_500);
      expect(waited).toBeLessThan(6_500);
      await released;
      const [row] = await db.select().from(usersT).where(eq(usersT.email, 'locked@example.test'));
      expect(row.password).toBe('h');
    } finally {
      await holder.close();
    }
  }, 15_000);

  it('fails closed on a handle with no transaction(): fn never runs', async () => {
    const fn = vi.fn();
    await expect(withCredentialWrite(undefined, { operation: 'create', db: {} }, fn)).rejects.toThrow(/no transaction/);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('CredentialWriteRefusedError — the transport faces', () => {
  it('is a tRPC SERVICE_UNAVAILABLE → HTTP 503, recognised by tRPC as-is', () => {
    const err = new CredentialWriteRefusedError('maintenance');
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.name).toBe('TRPCError');
    expect(getTRPCErrorFromUnknown(err)).toBe(err);
    expect(getHTTPStatusCodeFromError(err)).toBe(503);
    expect(err.retryAfterSeconds).toBe(60);
  });

  it.each(['maintenance', 'write_deadline'] as const)('route face: 503 { error: %s } + Retry-After: 60', async (reason) => {
    const res = credentialWriteRefusedResponse(new CredentialWriteRefusedError(reason));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: reason });
  });

  it('isCredentialWriteRefused recognises a copy from another bundle (duck-typed, not instanceof)', () => {
    const foreign = Object.assign(new Error('x'), { kind: 'credential_write_refused', reason: 'maintenance' });
    expect(isCredentialWriteRefused(foreign)).toBe(true);
    expect(isCredentialWriteRefused(new Error('x'))).toBe(false);
    expect(isCredentialWriteRefused(null)).toBe(false);
  });

  it('is exported from the auth entry point', () => {
    expect(authIndex.withCredentialWrite).toBe(withCredentialWrite);
    expect(authIndex.CredentialWriteRefusedError).toBe(CredentialWriteRefusedError);
    expect(authIndex.credentialWriteRefusedResponse).toBe(credentialWriteRefusedResponse);
  });
});

// =============================================================================
// 2. Every SDK writer through the seam
// =============================================================================

interface WriterEnv {
  db: any;
  gate: CredentialWriteGate;
  hashPassword: (p: string, rounds?: number) => Promise<string>;
  comparePassword: (p: string, h: string) => Promise<boolean>;
  order: string[];
  observed: Array<{ statement: string; lock: string; idle: string }>;
}

/** Users-router repository: real rows through whatever handle it is handed. */
function makeUsersRouterRepo(env: WriterEnv) {
  const write = async (h: any, label: string, fn: () => Promise<any>) => {
    env.order.push(label);
    env.observed.push(await readTimeouts(h));
    return fn();
  };
  return class Repo {
    constructor(public db: any) {}
    async findByEmail(h: any, email: string) {
      const [u] = await h.select().from(usersT).where(eq(usersT.email, email));
      return u ?? null;
    }
    async findById(h: any, id: number) {
      const [u] = await h.select().from(usersT).where(eq(usersT.id, id));
      return u ?? null;
    }
    async isUsernameAvailable() { return true; }
    async hasRoleInOrg() { return true; }
    async assignRole() {}
    async getUserRoles() { return []; }
    async create(h: any, data: any) {
      return write(h, 'write', async () => {
        const [u] = await h.insert(usersT).values({ email: data.email, password: data.password ?? null }).returning();
        return u;
      });
    }
    async update(h: any, id: number, data: any) {
      return write(h, 'write', async () => {
        const [u] = await h.update(usersT).set({ ...(data.password && { password: data.password }) }).where(eq(usersT.id, id)).returning();
        return u;
      });
    }
    async updatePassword(h: any, id: number, hash: string) {
      return write(h, 'write', async () => {
        const [u] = await h.update(usersT).set({ password: hash }).where(eq(usersT.id, id)).returning();
        return u ?? null;
      });
    }
  };
}

/** Auth-router repository: bound to a handle at construction, like the real one. */
function makeAuthRepo(env: WriterEnv) {
  return class AuthRepo {
    constructor(public h: any) {}
    async findByEmail(email: string) {
      const [u] = await this.h.select().from(usersT).where(eq(usersT.email, email));
      return u ?? null;
    }
    async createUser(data: any) {
      env.order.push('write');
      env.observed.push(await readTimeouts(this.h));
      const [u] = await this.h.insert(usersT).values({ email: data.email, password: data.password, name: data.name }).returning();
      return u;
    }
  };
}

async function ownedId(env: WriterEnv): Promise<number> {
  const [u] = await env.db.select().from(usersT).where(eq(usersT.email, OWNED_EMAIL));
  return u.id;
}

/**
 * The runtime writer list. Its names are asserted equal to the writers the
 * static allowlist (part 3) maps every call site to.
 */
const WRITERS: Record<string, (env: WriterEnv) => Promise<unknown>> = {
  'users.router.create': async (env) => {
    const Repo = makeUsersRouterRepo(env);
    const cfg: any = createUserRouterConfig({ Repository: Repo as any, hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate });
    return cfg.create.handler({ input: { email: 'created@example.test', password: NEW }, service: { db: env.db, orgId: 1, userId: '1' }, actor: {}, db: env.db, repo: new Repo(env.db), ctx: {} });
  },
  'users.router.invite': async (env) => {
    const Repo = makeUsersRouterRepo(env);
    const cfg: any = createUserRouterConfig({ Repository: Repo as any, hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate });
    return cfg.invite.handler({ input: { email: 'invited@example.test', password: NEW, roleId: 3 }, service: { db: env.db, orgId: 1, userId: '1' }, actor: {}, db: env.db, repo: new Repo(env.db), ctx: {} });
  },
  'users.router.update': async (env) => {
    const Repo = makeUsersRouterRepo(env);
    const cfg: any = createUserRouterConfig({ Repository: Repo as any, hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate });
    return cfg.update.handler({ input: { id: await ownedId(env), password: NEW }, service: { db: env.db, orgId: 1, userId: '1' }, actor: {}, db: env.db, repo: new Repo(env.db), ctx: {} });
  },
  'users.router.changePassword': async (env) => {
    const Repo = makeUsersRouterRepo(env);
    const cfg: any = createUserRouterConfig({ Repository: Repo as any, hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate });
    return cfg.changePassword.handler({ input: { currentPassword: OLD, newPassword: NEW }, service: { db: env.db, orgId: 1, userId: String(await ownedId(env)) }, actor: {}, db: env.db, repo: new Repo(env.db), ctx: {} });
  },
  'users.service.invite': async (env) => {
    const svc = createUserService({ hooks: { withPrivilegedDb: (fn: any) => fn(env.db), hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate }, repository: new (makeUsersRouterRepo(env))(env.db) as any });
    return svc.invite({ email: 'svc-invited@example.test', password: NEW } as any, { db: env.db, userId: 1, orgId: null, isSystemUser: true, permissions: [] });
  },
  'users.service.update': async (env) => {
    const svc = createUserService({ hooks: { withPrivilegedDb: (fn: any) => fn(env.db), hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate }, repository: new (makeUsersRouterRepo(env))(env.db) as any });
    return svc.update({ id: await ownedId(env), password: NEW } as any, { db: env.db, userId: 1, orgId: null, isSystemUser: true, permissions: ['user:update'] });
  },
  'users.service.changePassword': async (env) => {
    const svc = createUserService({ hooks: { withPrivilegedDb: (fn: any) => fn(env.db), hashPassword: env.hashPassword, comparePassword: env.comparePassword, credentialWriteGate: env.gate }, repository: new (makeUsersRouterRepo(env))(env.db) as any });
    const id = await ownedId(env);
    return svc.changePassword({ userId: id, currentPassword: OLD, newPassword: NEW }, { db: env.db, userId: id, orgId: null, isSystemUser: false, permissions: [] });
  },
  'auth.router.register': async (env) => {
    const AuthRepo = makeAuthRepo(env);
    const cfg: any = createAuthRouterConfig({ Repository: AuthRepo as any, hashPassword: env.hashPassword, getPrivilegedDb: () => env.db, schema: {} as any, isRegistrationEnabled: () => true, credentialWriteGate: env.gate });
    return cfg.register.handler({ input: { email: 'registered@example.test', password: NEW, name: 'R' }, repo: new AuthRepo(env.db), db: env.db });
  },
  'password-reset.consume': async (env) => {
    const svc = createPasswordResetService({
      runPrivileged: (fn: any) => fn(env.db),
      tables: { users: usersT, passwordResetTokens: tokensT, authLogs: logsT },
      hashPassword: env.hashPassword,
      comparePassword: env.comparePassword,
      sendResetEmail: async () => true,
      baseUrl: 'https://app.example.test',
      credentialWriteGate: env.gate,
      onPasswordChanged: async (tx: any) => {
        env.order.push('write');
        env.observed.push(await readTimeouts(tx));
      },
      logger: { error: () => {}, warn: () => {} },
    });
    const res = await svc.resetPassword({ token: RESET_TOKEN, password: NEW });
    if (!res.ok) throw new Error(`reset refused: ${res.reason}`);
    return res;
  },
};

describe.skipIf(!handle)('every SDK writer goes through the seam — real local Postgres', () => {
  const db = handle?.db as any;

  beforeEach(async () => {
    await handle!.client.unsafe(`truncate ${SCHEMA}.users, ${SCHEMA}.password_reset_tokens,
      ${SCHEMA}.auth_logs, ${SCHEMA}.scratch restart identity`);
    await handle!.client.unsafe(`insert into ${SCHEMA}.users (email, password, updated_at)
      values ('${OWNED_EMAIL}', 'hashed:${OLD}', '2026-01-01T00:00:00Z')`);
    await handle!.client.unsafe(`insert into ${SCHEMA}.password_reset_tokens (user_id, token, expires_at)
      values (1, '${RESET_TOKEN}', now() + interval '1 hour')`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function env(gate: CredentialWriteGate, onHash?: () => void): WriterEnv & { hash: ReturnType<typeof vi.fn> } {
    const e: any = { db, gate, order: [], observed: [] };
    e.hash = vi.fn(async (p: string) => {
      e.order.push('hash');
      onHash?.();
      return `hashed:${p}`;
    });
    e.hashPassword = e.hash;
    e.comparePassword = async (p: string, h: string) => h === `hashed:${p}`;
    return e;
  }

  const names = Object.keys(WRITERS);

  it.each(names)('%s — a refusing gate: 503 maintenance, never hashes, opens no transaction, writes nothing', async (name) => {
    const gate = vi.fn(async () => { throw new CredentialWriteRefusedError('maintenance'); });
    const e = env(gate);
    const before = await md5All();
    const mark = handle!.queries.length;

    const err: any = await WRITERS[name]!(e).catch((x) => x);

    expect(isCredentialWriteRefused(err), `${name} resolved instead of refusing: ${String(err)}`).toBe(true);
    expect(err.reason).toBe('maintenance');
    expect(getHTTPStatusCodeFromError(err)).toBe(503);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(e.hash).not.toHaveBeenCalled();
    expect(e.order).toEqual([]);
    expect(beginIndex(mark)).toBe(-1);
    expect(await md5All()).toBe(before);
  });

  it.each(names)('%s — an admitting gate: gate → hash → write, the write under the three timeouts, and it lands', async (name) => {
    const e = env(async (ctx) => { e.order.push(`gate:${ctx.operation}`); });
    const before = await md5All();
    const mark = handle!.queries.length;

    await WRITERS[name]!(e);

    expect(e.order[0]).toMatch(/^gate:/);
    expect(e.order.slice(1)).toEqual(['hash', 'write']);
    expect(e.observed).toEqual([{ statement: '10s', lock: '5s', idle: '10s' }]);
    const b = beginIndex(mark);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(handle!.queries.slice(b + 1, b + 4)).toEqual([...CREDENTIAL_WRITE_SET_LOCALS]);
    expect(await md5All()).not.toBe(before);
  });

  it.each(names)('%s — held past admittedAt + 10 s (fake clock): rolled back write_deadline, nothing lands', async (name) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const e = env(async () => {}, () => vi.setSystemTime(Date.now() + CREDENTIAL_WRITE_DEADLINE_MS + 1));
    const before = await md5All();

    const err: any = await WRITERS[name]!(e).catch((x) => x);

    expect(isCredentialWriteRefused(err), `${name}: ${String(err)}`).toBe(true);
    expect(err.reason).toBe('write_deadline');
    expect(e.order).toEqual(['hash', 'write']);
    expect(await md5All()).toBe(before);
  });

  it('each writer names its own operation to the gate', async () => {
    const expected: Record<string, string> = {
      'users.router.create': 'create',
      'users.router.invite': 'invite',
      'users.router.update': 'update',
      'users.router.changePassword': 'change-password',
      'users.service.invite': 'invite',
      'users.service.update': 'update',
      'users.service.changePassword': 'change-password',
      'auth.router.register': 'register',
      'password-reset.consume': 'reset-consume',
    };
    expect(Object.keys(expected).sort()).toEqual([...names].sort());
    for (const name of names) {
      const seen: string[] = [];
      await handle!.client.unsafe(`truncate ${SCHEMA}.users, ${SCHEMA}.password_reset_tokens restart identity`);
      await handle!.client.unsafe(`insert into ${SCHEMA}.users (email, password) values ('${OWNED_EMAIL}', 'hashed:${OLD}')`);
      await handle!.client.unsafe(`insert into ${SCHEMA}.password_reset_tokens (user_id, token, expires_at) values (1, '${RESET_TOKEN}', now() + interval '1 hour')`);
      await WRITERS[name]!(env(async (ctx) => { seen.push(ctx.operation); }));
      expect(seen, name).toEqual([expected[name]]);
    }
  });
});

// =============================================================================
// 3. Static: the grep over core/src vs the allowlist
// =============================================================================

/**
 * Every line in core/src (tests and test support excluded) matching
 * `hashPassword(` or `updatePassword(`. `writer` names the runtime writer
 * above that exercises the call site; `definition` marks a declaration, which
 * carries no seam obligation. Anchored by file + trimmed line text, so a
 * moved line needs no update and a new or edited call site fails.
 */
const ALLOWLIST: Array<{ file: string; line: string; writer: string }> = [
  { file: 'modules/auth/router-config.ts', line: 'const hashedPassword = await deps.hashPassword(input.password, 12);', writer: 'auth.router.register' },
  { file: 'modules/password-reset/service.ts', line: 'const hashedPassword = await hashPassword(password);', writer: 'password-reset.consume' },
  { file: 'modules/users/repository.ts', line: 'updatePassword(db: any, userId: number, hashedPassword: string): Promise<UserWithRoles | null>;', writer: 'definition' },
  { file: 'modules/users/repository.ts', line: 'async updatePassword(db: PostgresJsDatabase<any>, userId: number, hashedPassword: string): Promise<UserWithRoles | null> {', writer: 'definition' },
  { file: 'modules/users/router-config.ts', line: '? await deps.hashPassword(input.password, 10)', writer: 'users.router.invite' },
  { file: 'modules/users/router-config.ts', line: '? await deps.hashPassword(input.password, 10)', writer: 'users.router.create' },
  { file: 'modules/users/router-config.ts', line: 'finalUpdateData.password = await deps.hashPassword(password, 10);', writer: 'users.router.update' },
  { file: 'modules/users/router-config.ts', line: 'const hashedPassword = await deps.hashPassword(input.newPassword, 10);', writer: 'users.router.changePassword' },
  { file: 'modules/users/router-config.ts', line: 'await repo.updatePassword(tx, userId, hashedPassword);', writer: 'users.router.changePassword' },
  { file: 'modules/users/service.ts', line: '? await hooks.hashPassword(params.password, 12)', writer: 'users.service.invite' },
  { file: 'modules/users/service.ts', line: 'const hashedPassword = await hooks.hashPassword(password, 12);', writer: 'users.service.update' },
  { file: 'modules/users/service.ts', line: 'const hashedPassword = await hooks.hashPassword(newPassword, 12);', writer: 'users.service.changePassword' },
  { file: 'modules/users/service.ts', line: 'const result = await getRepo(tx).updatePassword(tx, userId, hashedPassword);', writer: 'users.service.changePassword' },
];

const PATTERN = /hashPassword\(|updatePassword\(/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__test-support__' || entry === '__tests__') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Code-only view of a source: comments and string/template contents blanked
 * with spaces (offsets preserved), so parentheses are counted on code alone.
 */
function codeOnly(src: string): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; blank(i, end); i = end; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Offsets [start, end) of every `withCredentialWrite(` call's argument list. */
function seamSpans(code: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /withCredentialWrite\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let k = open; k < code.length; k++) {
      if (code[k] === '(') depth++;
      else if (code[k] === ')' && --depth === 0) { spans.push([open, k]); break; }
    }
  }
  return spans;
}

describe('static: every hashPassword( / updatePassword( in core/src is allowlisted, and every call site is inside the seam', () => {
  const hits: Array<{ file: string; line: string; lineNo: number; offset: number }> = [];
  for (const full of sourceFiles(CORE_SRC)) {
    const src = readFileSync(full, 'utf8');
    const code = codeOnly(src);
    let offset = 0;
    src.split('\n').forEach((raw, idx) => {
      const codeLine = code.slice(offset, offset + raw.length);
      if (PATTERN.test(codeLine)) {
        hits.push({ file: relative(CORE_SRC, full), line: raw.trim(), lineNo: idx + 1, offset: offset + codeLine.search(PATTERN) });
      }
      offset += raw.length + 1;
    });
  }

  it('finds the sites (the grep ran over the real tree)', () => {
    expect(hits.length).toBeGreaterThanOrEqual(ALLOWLIST.length);
  });

  it('every grep hit is on the allowlist — a new writer fails here, named', () => {
    const remaining = [...ALLOWLIST];
    const unlisted: string[] = [];
    for (const h of hits) {
      const i = remaining.findIndex((a) => a.file === h.file && a.line === h.line);
      if (i < 0) unlisted.push(`${h.file}:${h.lineNo}  ${h.line}`);
      else remaining.splice(i, 1);
    }
    expect(unlisted, `credential writer(s) not on the p77 allowlist — route them through withCredentialWrite and list them:\n${unlisted.join('\n')}`).toEqual([]);
    expect(remaining.map((r) => `${r.file}  ${r.line}`), 'allowlist entries with no matching source line (stale)').toEqual([]);
  });

  it('every allowlisted CALL site lies lexically inside a withCredentialWrite( call', () => {
    const outside: string[] = [];
    for (const h of hits) {
      const entry = ALLOWLIST.find((a) => a.file === h.file && a.line === h.line);
      if (!entry || entry.writer === 'definition') continue;
      const code = codeOnly(readFileSync(join(CORE_SRC, h.file), 'utf8'));
      const inside = seamSpans(code).some(([a, b]) => h.offset > a && h.offset < b);
      if (!inside) outside.push(`${h.file}:${h.lineNo}  ${h.line}`);
    }
    expect(outside, `credential write(s) outside the seam:\n${outside.join('\n')}`).toEqual([]);
  });

  it('the allowlist names exactly the runtime writer list above', () => {
    const fromAllowlist = new Set(ALLOWLIST.filter((a) => a.writer !== 'definition').map((a) => a.writer));
    expect([...fromAllowlist].sort()).toEqual(Object.keys(WRITERS).sort());
  });

  it('the containment check is not vacuous: a call outside any seam is detected', () => {
    const code = codeOnly(`a(); withCredentialWrite(d, o, async (tx) => { await h.hashPassword(p); });\nawait h.hashPassword(q);`);
    const spans = seamSpans(code);
    const first = code.indexOf('hashPassword(');
    const second = code.lastIndexOf('hashPassword(');
    expect(spans.some(([a, b]) => first > a && first < b)).toBe(true);
    expect(spans.some(([a, b]) => second > a && second < b)).toBe(false);
  });
});

/**
 * The password-reset service's two STORY-042 obligations:
 *
 *  1. `onCredentialWritten` fires exactly once per successful consumption,
 *     inside the same transaction as the write, and never on a refusal or an
 *     invalid link. `onPasswordChanged` stays as the older alias and fires
 *     FIRST, so a consumer that implements both keeps its existing ordering.
 *  2. `requestReset` matches the STORED email case-insensitively, so a legacy
 *     row saved as `Sean@x.com` still receives the link.
 *
 * Classification per concern:
 *   - hook firing / ordering: MOCK (fake drizzle client, as the sibling
 *     `service.test.ts` uses).
 *   - `lower(email)`: REAL drizzle SQL. The where clause the service builds is
 *     captured and rendered by the real `PgDialect` against real `pgTable`
 *     columns, so the assertion is on the SQL Postgres would receive, not on a
 *     stub's behaviour. No database is contacted.
 */
import { describe, expect, it, vi } from 'vitest';
import { PgDialect, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { createPasswordResetService } from './service';
import type { CredentialOwner } from '../auth/credential-owner';

// =============================================================================
// FAKE CLIENT (MOCK) — hook firing and ordering
// =============================================================================

function createFakeDb(rows: { users?: any[]; tokens?: any[] }) {
  const calls = { inserted: [] as any[], updated: [] as any[], deleted: 0, order: [] as string[] };

  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => Promise.resolve(result),
      then: (res: any) => Promise.resolve(result).then(res),
    };
    return c;
  };

  const db: any = {
    select: (shape: any) => {
      const source =
        shape && 'password' in shape
          ? rows.users ?? []
          : shape && ('expiresAt' in shape || 'userId' in shape)
            ? rows.tokens ?? []
            : rows.users ?? [];
      return chain(source);
    },
    insert: (table: any) => ({
      values: (v: any) => {
        calls.inserted.push({ table, values: v });
        calls.order.push('insert');
        return Promise.resolve();
      },
    }),
    update: (table: any) => ({
      set: (v: any) => ({
        where: () => {
          calls.updated.push({ table, values: v });
          calls.order.push(v && 'usedAt' in v ? 'token-used' : 'password-written');
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({ where: () => { calls.deleted += 1; return Promise.resolve(); } }),
    transaction: (fn: any) => fn(db),
    __calls: calls,
  };

  return db;
}

const tables = {
  users: { id: 'users.id', email: 'users.email', password: 'users.password', name: 'users.name', firstName: 'users.firstName', updatedAt: 'users.updatedAt' },
  passwordResetTokens: { id: 't.id', userId: 't.userId', token: 't.token', expiresAt: 't.expiresAt', usedAt: 't.usedAt' },
} as any;

function build(rows: Parameters<typeof createFakeDb>[0], overrides: Record<string, unknown> = {}) {
  const db = createFakeDb(rows);
  const service = createPasswordResetService({
    runPrivileged: (fn: any) => fn(db),
    tables,
    hashPassword: async (pw: string) => `hashed:${pw}`,
    comparePassword: async (pw: string, hash: string) => hash === `hashed:${pw}`,
    sendResetEmail: vi.fn().mockResolvedValue(true),
    baseUrl: 'https://app.example.com',
    logger: { error: vi.fn(), warn: vi.fn() } as any,
    ...overrides,
  });
  return { service, db };
}

const liveToken = [{ id: 1, userId: 7 }];

const external: CredentialOwner = {
  kind: 'external',
  issuer: 'https://idp.example.com',
  providerId: 'idp',
  accountUrl: 'https://idp.example.com/account',
  resetUrl: 'https://idp.example.com/forgot',
};
const frozen: CredentialOwner = { kind: 'frozen', reason: 'mid-migration' };
const none: CredentialOwner = { kind: 'none' };

describe('password reset — onCredentialWritten', () => {
  it('fires once on a successful consumption, on the transaction handle', async () => {
    const onCredentialWritten = vi.fn();
    const { service, db } = build(
      { users: [{ id: 7, email: 'user@example.com', password: 'hashed:Old!Pass1' }], tokens: liveToken },
      { onCredentialWritten },
    );

    await expect(service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' })).resolves.toEqual({ ok: true });

    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({ db, userId: 7, operation: 'reset', firstSet: false }),
    );
    // The link is the actor; there is no session behind a reset.
    expect(onCredentialWritten.mock.calls[0][0].actorUserId).toBeUndefined();
  });

  it('reports firstSet when the account held no verifier', async () => {
    const onCredentialWritten = vi.fn();
    const { service } = build(
      { users: [{ id: 7, email: 'user@example.com', password: null }], tokens: liveToken },
      { onCredentialWritten },
    );

    await service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' });
    expect(onCredentialWritten).toHaveBeenCalledWith(expect.objectContaining({ operation: 'reset', firstSet: true }));
  });

  it('runs between the password write and the token being marked used, after onPasswordChanged', async () => {
    const order: string[] = [];
    const { service, db } = build(
      { users: [{ id: 7, email: 'user@example.com', password: 'hashed:Old!Pass1' }], tokens: liveToken },
      {
        onPasswordChanged: async () => { order.push('onPasswordChanged'); },
        onCredentialWritten: async () => { order.push('onCredentialWritten'); },
      },
    );

    await service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' });

    // The alias keeps its original position; the general hook follows it.
    expect(order).toEqual(['onPasswordChanged', 'onCredentialWritten']);
    // And both sit between the write and the token being consumed.
    expect(db.__calls.order).toEqual(['password-written', 'token-used']);
  });

  it('still fires when only the alias is absent, and vice versa', async () => {
    const onCredentialWritten = vi.fn();
    const { service } = build(
      { users: [{ id: 7, email: 'user@example.com', password: 'hashed:Old!Pass1' }], tokens: liveToken },
      { onCredentialWritten },
    );
    await service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' });
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);

    const onPasswordChanged = vi.fn();
    const aliasOnly = build(
      { users: [{ id: 7, email: 'user@example.com', password: 'hashed:Old!Pass1' }], tokens: liveToken },
      { onPasswordChanged },
    );
    await aliasOnly.service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' });
    expect(onPasswordChanged).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['external', external],
    ['frozen', frozen],
    ['none', none],
  ] as Array<[string, CredentialOwner]>)('a %s owner refuses the consumption and announces nothing', async (_kind, owner) => {
    const onCredentialWritten = vi.fn();
    const { service, db } = build(
      { users: [{ id: 7, email: 'user@example.com', password: 'hashed:Old!Pass1' }], tokens: liveToken },
      { onCredentialWritten, resolveCredentialOwner: () => owner },
    );

    const result = await service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' });

    expect(result).toMatchObject({ ok: false });
    expect(db.__calls.updated).toHaveLength(0);
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('announces nothing for an invalid or expired link', async () => {
    const onCredentialWritten = vi.fn();
    const { service } = build({ users: [], tokens: [] }, { onCredentialWritten });

    await expect(service.resetPassword({ token: 'tok', password: 'N3w!Passw0rd' })).resolves.toMatchObject({
      ok: false,
      reason: 'expired',
    });
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('announces nothing for requestReset — minting a link writes no verifier', async () => {
    const onCredentialWritten = vi.fn();
    const { service } = build({ users: [{ id: 7, email: 'user@example.com' }] }, { onCredentialWritten });

    await service.requestReset({ email: 'user@example.com' });
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });
});

// =============================================================================
// STORED EMAIL CASE (REAL drizzle SQL)
// =============================================================================

const realUsers = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password'),
  name: text('name'),
  firstName: text('first_name'),
  updatedAt: timestamp('updated_at'),
});

/** Captures the where clause the service hands the select, then renders it. */
function captureUserLookup() {
  const captured: any[] = [];
  const db: any = {
    select: () => {
      const c: any = {
        from: () => c,
        where: (cond: any) => { captured.push(cond); return c; },
        limit: () => Promise.resolve([]),
        then: (res: any) => Promise.resolve([]).then(res),
      };
      return c;
    },
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: (fn: any) => fn(db),
  };
  return { db, captured };
}

describe('password reset — the STORED email is matched case-insensitively', () => {
  it('requestReset looks the user up by lower(users.email), not by equality', async () => {
    const { db, captured } = captureUserLookup();
    const service = createPasswordResetService({
      runPrivileged: (fn: any) => fn(db),
      tables: { users: realUsers, passwordResetTokens: tables.passwordResetTokens },
      hashPassword: async (pw: string) => `hashed:${pw}`,
      comparePassword: async () => false,
      sendResetEmail: vi.fn(),
      baseUrl: 'https://app.example.com',
      logger: { error: vi.fn(), warn: vi.fn() } as any,
    });

    await service.requestReset({ email: '  Sean@X.com ' });

    expect(captured).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(captured[0]);
    // A row stored as `Sean@x.com` is reached: the column is lowered too,
    // where before only the typed value was.
    expect(query.sql).toBe('lower("users"."email") = lower($1)');
    expect(query.params).toEqual(['sean@x.com']);
  });
});

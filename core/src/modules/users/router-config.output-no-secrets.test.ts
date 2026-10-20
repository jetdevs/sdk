/**
 * Users router — no response carries a password verifier (CAD-443).
 *
 * The repository read and returned whole users rows, so getAllWithStats,
 * getAll, getById, update and friends sent `password` (a bcrypt hash) to any
 * caller with user:read. Every procedure's result is now stripped, whichever
 * repository produced the row.
 */
import { describe, expect, it } from 'vitest';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

import { createUserRouterConfig, type UserRouterDeps } from './router-config';
import { isUserSecretKey, omitUserSecrets, publicUserColumns } from './user-output';

const ORG = 1;
const SELF = 7;
const HASH = '$2b$10$abcdefghijklmnopqrstuv';

function row(id: number) {
  return { id, email: `u${id}@example.com`, password: HASH, mfaSecret: 's', resetToken: 't', createdAt: new Date(0) };
}

function build() {
  class Repo {
    constructor(public db: any) {}
    async findAll() { return [row(SELF), row(50)]; }
    async count() { return 2; }
    async getUserRolesBatch() { return new Map(); }
    async getMembershipStatuses() { return new Map(); }
    async findById(_db: any, id: number) { return row(id); }
    async getUserRoles() { return []; }
    async update(_db: any, id: number) { return row(id); }
    async softDelete(_db: any, id: number) { return row(id); }
    async updateSessionTimeout(_db: any, id: number) { return row(id); }
    async updateThemePreference(_db: any, id: number) { return row(id); }
  }
  const cfg: any = createUserRouterConfig({
    Repository: Repo as unknown as UserRouterDeps['Repository'],
    hashPassword: async (p: string) => `hashed:${p}`,
    comparePassword: async () => true,
  });
  return { cfg, Repo };
}

function ctx(Repo: any, input: any) {
  return {
    input,
    service: { db: {}, orgId: ORG, userId: String(SELF) },
    actor: { userId: SELF, orgId: ORG, isSystemUser: false, permissions: ['user:read', 'user:update', 'user:delete'] },
    db: {},
    repo: new Repo({}),
    ctx: {},
  } as any;
}

function expectNoSecret(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain('"password"');
  expect(json).not.toContain(HASH);
  expect(json).not.toContain('mfaSecret');
  expect(json).not.toContain('resetToken');
}

describe('users router — no response carries a secret column (CAD-443)', () => {
  it('getAllWithStats', async () => {
    const { cfg, Repo } = build();
    const out = await cfg.getAllWithStats.handler(ctx(Repo, { limit: 10, offset: 0 }));
    expect(out.users).toHaveLength(2);
    expect(out.users[0].email).toBe(`u${SELF}@example.com`);
    expectNoSecret(out);
  });

  it('getAll', async () => {
    const { cfg, Repo } = build();
    expectNoSecret(await cfg.getAll.handler(ctx(Repo, undefined)));
  });

  it('getById', async () => {
    const { cfg, Repo } = build();
    const out = await cfg.getById.handler(ctx(Repo, SELF));
    expect(out.id).toBe(SELF);
    expectNoSecret(out);
  });

  it('update without a password', async () => {
    const { cfg, Repo } = build();
    expectNoSecret(await cfg.update.handler(ctx(Repo, { id: SELF, name: 'New' })));
  });

  it('updateSessionPreference and updateThemePreference', async () => {
    const { cfg, Repo } = build();
    expectNoSecret(await cfg.updateSessionPreference.handler(ctx(Repo, { sessionTimeoutMinutes: 30 })));
    expectNoSecret(await cfg.updateThemePreference.handler(ctx(Repo, { theme: 'dark' })));
  });
});

describe('user-output helpers', () => {
  it('omitUserSecrets keeps Dates and non-secret keys, drops secrets at any depth', () => {
    const out: any = omitUserSecrets({ user: row(1), list: [row(2)] });
    expect(out.user.createdAt).toBeInstanceOf(Date);
    expect(out.user.email).toBe('u1@example.com');
    expectNoSecret(out);
  });

  it('isUserSecretKey leaves ordinary user columns alone', () => {
    for (const key of ['id', 'email', 'credentialAuthority', 'credentialVersion', 'connectSub', 'hasPassword']) {
      expect(isUserSecretKey(key), key).toBe(false);
    }
  });

  it('publicUserColumns drops the password column of any users table', () => {
    const users = pgTable('users', { id: serial('id'), email: text('email'), password: text('password') });
    expect(Object.keys(publicUserColumns(users))).toEqual(['id', 'email']);
  });
});

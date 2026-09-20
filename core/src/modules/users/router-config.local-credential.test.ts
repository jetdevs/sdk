/**
 * `canWriteLocalCredential` — the caller-injected guard on every local
 * verifier write in the users and auth routers.
 *
 * The SDK has no idea WHICH users have their password owned elsewhere; the app
 * injects the rule. These tests pin the contract from the SDK's side: each
 * writer asks the guard with the right operation and target BEFORE hashing,
 * a refusal becomes a FORBIDDEN error with the guard's reason and nothing is
 * written, and with no guard injected behaviour is exactly what it was.
 */
import { describe, expect, it, vi } from 'vitest';

import { createAuthRouterConfig } from '../auth/router-config';
import { createUserRouterConfig, type UserRouterDeps } from './router-config';

/** A repository stub that records writes; the routers only touch these methods. */
function stubRepo(existing: Record<string, any> = {}) {
  const writes: any[] = [];
  const byEmail = new Map(Object.entries(existing));
  class Repo {
    constructor(public db: any) {}
    async findByEmail(_db: any, email?: string) {
      // auth repo signature is (email); users repo is (db, email)
      const key = typeof _db === 'string' ? _db : email;
      return byEmail.get(key as string) ?? null;
    }
    async findById(_db: any, id: number) {
      return [...byEmail.values()].find((u) => u.id === id) ?? null;
    }
    async create(_db: any, data: any) { writes.push({ op: 'create', data }); return { id: 99, ...data }; }
    async createUser(data: any) { writes.push({ op: 'createUser', data }); return { id: 99, ...data }; }
    async update(_db: any, id: number, data: any) { writes.push({ op: 'update', id, data }); return { id, ...data }; }
    async updatePassword(_db: any, id: number, hash: string) { writes.push({ op: 'updatePassword', id, hash }); }
    async hasRoleInOrg() { return true; }
    async assignRole() { /* not under test */ }
  }
  // The stub implements only what these handlers call; present it as the
  // full repository type so the config builders typecheck.
  return { Repo: Repo as unknown as UserRouterDeps['Repository'], writes };
}

const hashPassword = async (p: string) => `hashed:${p}`;
const comparePassword = async (p: string, h: string) => h === `hashed:${p}`;
const refuse = vi.fn().mockResolvedValue({ allowed: false, reason: 'owned elsewhere' });
const allow = vi.fn().mockResolvedValue({ allowed: true });

function userCtx(overrides: Partial<{ input: any; userId: string; orgId: number | null }>, Repo: any) {
  return {
    input: overrides.input,
    service: { db: {}, orgId: overrides.orgId ?? 1, userId: overrides.userId ?? '7' },
    actor: {},
    db: {},
    repo: new Repo({}),
    ctx: {},
  } as any;
}

describe('users router — canWriteLocalCredential', () => {
  const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };

  it('changePassword refuses BEFORE comparing, with the guard reason, and writes nothing', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, canWriteLocalCredential: refuse });

    await expect(
      cfg.changePassword.handler(userCtx({ input: { currentPassword: 'WRONG', newPassword: 'N3w!Passw0rd' } }, Repo)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'owned elsewhere' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'change-password', user: owned }));
  });

  it('update with a password refuses and writes nothing; update without one never asks', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, canWriteLocalCredential: refuse });

    await expect(
      cfg.update.handler(userCtx({ input: { id: 7, password: 'N3w!Passw0rd' } }, Repo)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update', user: owned }));

    refuse.mockClear();
    await cfg.update.handler(userCtx({ input: { id: 7, name: 'Renamed' } }, Repo));
    expect(refuse).not.toHaveBeenCalled();
    expect(writes).toEqual([{ op: 'update', id: 7, data: { name: 'Renamed' } }]);
  });

  it('invite of a NEW email asks with user:null and refuses before any row is created', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({});
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, canWriteLocalCredential: refuse });

    await expect(
      cfg.invite.handler(userCtx({ input: { email: 'new@example.com', password: 'N3w!Passw0rd' } }, Repo)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'invite', user: null, email: 'new@example.com' }));
  });

  it('invite of an EXISTING user never writes a verifier and never asks — there is nothing to write', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, canWriteLocalCredential: refuse });

    const result = await cfg.invite.handler(userCtx({ input: { email: owned.email, password: 'Ignored!Pass1' } }, Repo));
    expect(result).toBe(owned);
    expect(writes).toHaveLength(0);
    expect(refuse).not.toHaveBeenCalled();
  });

  it('create asks with user:null and refuses before any row is created', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({});
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, canWriteLocalCredential: refuse });

    await expect(
      cfg.create.handler(userCtx({ input: { email: 'new@example.com' } }, Repo)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'create', user: null }));
  });

  it('an allowing guard, and no guard at all, leave the writers exactly as they were', async () => {
    for (const guard of [allow, undefined]) {
      const { Repo, writes } = stubRepo({ [owned.email]: owned });
      const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, canWriteLocalCredential: guard });
      await expect(
        cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo)),
      ).resolves.toEqual({ success: true });
      expect(writes).toEqual([{ op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' }]);
    }
  });
});

describe('auth router — canWriteLocalCredential', () => {
  const deps = (Repo: any, guard: any) => ({
    Repository: Repo,
    hashPassword,
    getPrivilegedDb: () => ({}),
    schema: { users: {}, userRoles: {} },
    isRegistrationEnabled: () => true,
    canWriteLocalCredential: guard,
  });
  const publicCtx = (input: any, Repo: any) =>
    ({ input, service: { db: {}, orgId: 0, userId: '' }, actor: {}, db: {}, repo: new Repo({}), ctx: {} }) as any;

  it('register refuses with the guard reason and creates no user', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({});
    const cfg: any = createAuthRouterConfig(deps(Repo, refuse));

    await expect(
      cfg.register.handler(publicCtx({ email: 'new@example.com', password: 'N3w!Passw0rd', name: 'New' }, Repo)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'owned elsewhere' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'register', user: null, email: 'new@example.com' }));
  });

  it('register for an email that already exists is CONFLICT before the guard is asked', async () => {
    refuse.mockClear();
    const { Repo, writes } = stubRepo({ 'taken@example.com': { id: 1, email: 'taken@example.com' } });
    const cfg: any = createAuthRouterConfig(deps(Repo, refuse));

    await expect(
      cfg.register.handler(publicCtx({ email: 'taken@example.com', password: 'N3w!Passw0rd' }, Repo)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(writes).toHaveLength(0);
    expect(refuse).not.toHaveBeenCalled();
  });

  it('register with an allowing guard, or none, creates the user with a hashed verifier', async () => {
    for (const guard of [allow, undefined]) {
      const { Repo, writes } = stubRepo({});
      const cfg: any = createAuthRouterConfig(deps(Repo, guard));
      const result = await cfg.register.handler(publicCtx({ email: 'new@example.com', password: 'N3w!Passw0rd' }, Repo));
      expect(result).toMatchObject({ id: 99, email: 'new@example.com' });
      expect(writes[0].data.password).toBe('hashed:N3w!Passw0rd');
    }
  });
});

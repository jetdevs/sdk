/**
 * `canWriteLocalCredential` on `createUserService` — the same contract the
 * users router carries, so an app that drives the service directly (not the
 * tRPC config) gets the same server-side refusal before anything is hashed.
 */
import { describe, expect, it, vi } from 'vitest';

import { createUserService, type UserServiceContext } from './service';

function stubRepo(existing: Record<string, any> = {}) {
  const writes: any[] = [];
  const byEmail = new Map(Object.entries(existing));
  const repo: any = {
    async findByEmail(_db: any, email: string) { return byEmail.get(email) ?? null; },
    async findById(_db: any, id: number) { return [...byEmail.values()].find((u) => u.id === id) ?? null; },
    async isUsernameAvailable() { return true; },
    async create(_db: any, data: any) { writes.push({ op: 'create', data }); return { id: 99, ...data }; },
    async update(_db: any, id: number, data: any) { writes.push({ op: 'update', id, data }); return { id, ...data }; },
    async updatePassword(_db: any, id: number, hash: string) { writes.push({ op: 'updatePassword', id, hash }); return { id }; },
    async hasRoleInOrg() { return false; },
    async assignRole() { /* not under test */ },
  };
  return { repo, writes };
}

const hashPassword = async (p: string) => `hashed:${p}`;
const comparePassword = async (p: string, h: string) => h === `hashed:${p}`;
const refuse = vi.fn().mockResolvedValue({ allowed: false, reason: 'owned elsewhere' });
const allow = vi.fn().mockResolvedValue({ allowed: true });

const ctx = (overrides: Partial<UserServiceContext> = {}): UserServiceContext => ({
  db: {} as any,
  userId: 7,
  orgId: null,
  isSystemUser: true,
  permissions: ['user:update'],
  ...overrides,
});

function service(repo: any, guard: any) {
  return createUserService({
    hooks: {
      withPrivilegedDb: async (fn: any) => fn({}),
      hashPassword,
      comparePassword,
      canWriteLocalCredential: guard,
    },
    repository: repo,
  });
}

describe('createUserService — canWriteLocalCredential', () => {
  const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };

  it('changePassword refuses BEFORE comparing, with the guard reason, and writes nothing', async () => {
    refuse.mockClear();
    const { repo, writes } = stubRepo({ [owned.email]: owned });
    await expect(
      service(repo, refuse).changePassword({ userId: 7, currentPassword: 'WRONG', newPassword: 'N3w!Passw0rd' }, ctx()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'owned elsewhere' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'change-password', user: owned }));
  });

  it('update with a password refuses and writes nothing; without one it never asks', async () => {
    refuse.mockClear();
    const { repo, writes } = stubRepo({ [owned.email]: owned });
    const svc = service(repo, refuse);
    await expect(svc.update({ id: 7, password: 'N3w!Passw0rd' } as any, ctx())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update', user: owned }));

    refuse.mockClear();
    await svc.update({ id: 7, name: 'Renamed' } as any, ctx());
    expect(refuse).not.toHaveBeenCalled();
    expect(writes).toEqual([{ op: 'update', id: 7, data: { name: 'Renamed' } }]);
  });

  it('invite of a NEW email asks with user:null and refuses before any row is created', async () => {
    refuse.mockClear();
    const { repo, writes } = stubRepo({});
    await expect(
      service(repo, refuse).invite({ email: 'new@example.com', password: 'N3w!Passw0rd' } as any, ctx()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes).toHaveLength(0);
    expect(refuse).toHaveBeenCalledWith(expect.objectContaining({ operation: 'invite', user: null, email: 'new@example.com' }));
  });

  it('an allowing guard, and no guard at all, leave the writers exactly as they were', async () => {
    for (const guard of [allow, undefined]) {
      const { repo, writes } = stubRepo({ [owned.email]: owned });
      await expect(
        service(repo, guard).changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx()),
      ).resolves.toMatchObject({ success: true });
      expect(writes).toEqual([{ op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' }]);
    }
  });
});

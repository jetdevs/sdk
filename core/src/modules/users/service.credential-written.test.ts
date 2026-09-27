/**
 * `onCredentialWritten` on `createUserService` — the same announcement the
 * users router makes, for an app that drives the service directly.
 *
 * One extra guarantee here: these writes go through `withPrivilegedDb`, and
 * the hook is called INSIDE that callback with the privileged handle, because
 * an app recording an RLS-protected audit row cannot use any other one.
 *
 * Classification: MOCK. Repository and db handle are stubs.
 */
import { describe, expect, it, vi } from 'vitest';
import { transactionalStub } from '../auth/__test-support__/transactional-stub';

import type { CredentialOwner } from '../auth/credential-owner';
import { createUserService, type UserServiceContext } from './service';

function stubRepo(existing: Record<string, any> = {}) {
  const writes: any[] = [];
  const byEmail = new Map(Object.entries(existing));
  const repo: any = {
    async findByEmail(_db: any, email: string) { return byEmail.get(email) ?? null; },
    async findById(_db: any, id: number) { return [...byEmail.values()].find((u) => u.id === id) ?? null; },
    async isUsernameAvailable() { return true; },
    async create(_db: any, data: any) {
      writes.push({ op: 'create', data });
      const created = { id: 99, ...data };
      // The service re-reads the row it just made; keep the stub consistent.
      byEmail.set(created.email, created);
      return created;
    },
    async update(_db: any, id: number, data: any) { writes.push({ op: 'update', id, data }); return { id, ...data }; },
    async updatePassword(_db: any, id: number, hash: string) { writes.push({ op: 'updatePassword', id, hash }); return { id }; },
    async hasRoleInOrg() { return false; },
    async assignRole() { /* not under test */ },
  };
  return { repo, writes };
}

const hashPassword = async (p: string) => `hashed:${p}`;
const comparePassword = async (p: string, h: string) => h === `hashed:${p}`;

/**
 * The handle `withPrivilegedDb` hands its callback. p77: the seam opens its
 * transaction ON it, and the hook receives that transaction (`PRIVILEGED.tx`).
 */
const PRIVILEGED = transactionalStub({ handle: 'privileged' });

const ctx = (overrides: Partial<UserServiceContext> = {}): UserServiceContext => ({
  db: { handle: 'rls' } as any,
  userId: 7,
  orgId: null,
  isSystemUser: true,
  permissions: ['user:update'],
  ...overrides,
});

function service(repo: any, onCredentialWritten?: any, resolveCredentialOwner?: any) {
  return createUserService({
    hooks: {
      withPrivilegedDb: async (fn: any) => fn(PRIVILEGED),
      hashPassword,
      comparePassword,
      onCredentialWritten,
      resolveCredentialOwner,
    },
    repository: repo,
  });
}

const external: CredentialOwner = {
  kind: 'external',
  issuer: 'https://idp.example.com',
  providerId: 'idp',
  accountUrl: 'https://idp.example.com/account',
  resetUrl: 'https://idp.example.com/forgot',
};
const frozen: CredentialOwner = { kind: 'frozen', reason: 'mid-migration' };
const none: CredentialOwner = { kind: 'none' };

describe('createUserService — onCredentialWritten', () => {
  const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };

  it('changePassword announces once, on the privileged handle', async () => {
    const onCredentialWritten = vi.fn();
    const { repo, writes } = stubRepo({ [owned.email]: owned });

    await expect(
      service(repo, onCredentialWritten).changePassword(
        { userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' },
        ctx(),
      ),
    ).resolves.toMatchObject({ success: true });

    expect(writes).toEqual([{ op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' }]);
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({
        db: PRIVILEGED.tx,
        userId: 7,
        operation: 'change-password',
        actorUserId: 7,
        firstSet: false,
      }),
    );
  });

  it('update WITH a password announces update; without one it announces nothing', async () => {
    const onCredentialWritten = vi.fn();
    const { repo } = stubRepo({ [owned.email]: owned });
    const svc = service(repo, onCredentialWritten);

    await svc.update({ id: 7, password: 'N3w!Passw0rd' } as any, ctx({ userId: 42 }));
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({ db: PRIVILEGED.tx, userId: 7, operation: 'update', actorUserId: 42, firstSet: false }),
    );

    onCredentialWritten.mockClear();
    await svc.update({ id: 7, name: 'Renamed' } as any, ctx());
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('update onto a user with no stored verifier reports firstSet', async () => {
    const onCredentialWritten = vi.fn();
    const { repo } = stubRepo({ 'none@example.com': { id: 8, email: 'none@example.com', password: null } });

    await service(repo, onCredentialWritten).update({ id: 8, password: 'N3w!Passw0rd' } as any, ctx());
    expect(onCredentialWritten).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update', firstSet: true }));
  });

  it('invite announces only when the params CARRIED a password', async () => {
    const onCredentialWritten = vi.fn();
    const withPassword = stubRepo({});
    await service(withPassword.repo, onCredentialWritten).invite(
      { email: 'new@example.com', password: 'N3w!Passw0rd' } as any,
      ctx(),
    );
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({ db: PRIVILEGED.tx, userId: 99, operation: 'invite', actorUserId: 7, firstSet: true }),
    );

    onCredentialWritten.mockClear();
    const withoutPassword = stubRepo({});
    await service(withoutPassword.repo, onCredentialWritten).invite({ email: 'nopw@example.com' } as any, ctx());
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('invite of an EXISTING user announces nothing', async () => {
    const onCredentialWritten = vi.fn();
    const { repo, writes } = stubRepo({ [owned.email]: owned });

    await service(repo, onCredentialWritten).invite(
      { email: owned.email, password: 'Ignored!Pass1' } as any,
      ctx(),
    );
    expect(writes).toHaveLength(0);
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('a wrong current password announces nothing', async () => {
    const onCredentialWritten = vi.fn();
    const { repo, writes } = stubRepo({ [owned.email]: owned });

    await expect(
      service(repo, onCredentialWritten).changePassword(
        { userId: 7, currentPassword: 'WRONG', newPassword: 'N3w!Passw0rd' },
        ctx(),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(writes).toHaveLength(0);
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it.each([
    ['external', external],
    ['frozen', frozen],
    ['none', none],
  ] as Array<[string, CredentialOwner]>)(
    'a %s owner refuses changePassword and update, announcing nothing',
    async (_kind, owner) => {
      const onCredentialWritten = vi.fn();
      const { repo, writes } = stubRepo({ [owned.email]: owned });
      const svc = service(repo, onCredentialWritten, () => owner);

      await svc
        .changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx())
        .catch(() => undefined);
      await svc.update({ id: 7, password: 'N3w!Passw0rd' } as any, ctx()).catch(() => undefined);

      expect(writes).toHaveLength(0);
      expect(onCredentialWritten).not.toHaveBeenCalled();
    },
  );

  it('with no hook injected the writers behave exactly as before', async () => {
    const { repo, writes } = stubRepo({ [owned.email]: owned });
    await expect(
      service(repo).changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx()),
    ).resolves.toMatchObject({ success: true });
    expect(writes).toEqual([{ op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' }]);
  });
});

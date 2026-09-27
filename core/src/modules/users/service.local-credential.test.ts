/**
 * `canWriteLocalCredential` on `createUserService` — the same contract the
 * users router carries, so an app that drives the service directly (not the
 * tRPC config) gets the same server-side refusal before anything is hashed.
 */
import { describe, expect, it, vi } from 'vitest';
import { transactionalStub } from '../auth/__test-support__/transactional-stub';

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
      withPrivilegedDb: async (fn: any) => fn(transactionalStub({})),
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

// =============================================================================
// resolveCredentialOwner — the routing port (STORY-039)
// =============================================================================

import { CredentialOwnedElsewhereError, fromLocalCredentialGuard, type CredentialOwner } from '../auth/credential-owner';

const external: CredentialOwner = {
  kind: 'external',
  issuer: 'https://idp.example.com',
  providerId: 'idp',
  accountUrl: 'https://idp.example.com/account',
  resetUrl: 'https://idp.example.com/forgot',
};
const frozen: CredentialOwner = { kind: 'frozen', reason: 'migration in progress' };
const none: CredentialOwner = { kind: 'none' };
const local: CredentialOwner = { kind: 'local' };
const resolving = (owner: CredentialOwner) => vi.fn().mockResolvedValue(owner);

/** The original stub cannot find a row it just created; invite's happy path needs that. */
function rememberingRepo(existing: Record<string, any> = {}) {
  const { repo, writes } = stubRepo(existing);
  const created: any[] = [];
  const create = repo.create.bind(repo);
  const findById = repo.findById.bind(repo);
  repo.create = async (db: any, data: any) => { const u = await create(db, data); created.push(u); return u; };
  repo.findById = async (db: any, id: number) => (await findById(db, id)) ?? created.find((u) => u.id === id) ?? null;
  return { repo, writes };
}

describe('createUserService — resolveCredentialOwner', () => {
  const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };
  const hashSpy = vi.fn(hashPassword);
  const compareSpy = vi.fn(comparePassword);
  function build(resolver: any, existing: Record<string, any> = {}, extraHooks: Record<string, unknown> = {}) {
    hashSpy.mockClear();
    compareSpy.mockClear();
    const { repo, writes } = rememberingRepo(existing);
    const svc = createUserService({
      hooks: { withPrivilegedDb: async (fn: any) => fn(transactionalStub({})), hashPassword: hashSpy, comparePassword: compareSpy, resolveCredentialOwner: resolver, ...extraHooks },
      repository: repo,
    });
    return { svc, writes };
  }

  describe('external', () => {
    it('invite of a NEW email refuses with OWNED_ELSEWHERE carrying accountUrl, no hash, no row', async () => {
      const resolver = resolving(external);
      const { svc, writes } = build(resolver);
      const err = await svc.invite({ email: 'new@example.com', password: 'N3w!Passw0rd' } as any, ctx()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CredentialOwnedElsewhereError);
      expect(err).toMatchObject({ code: 'OWNED_ELSEWHERE', accountUrl: external.accountUrl, operation: 'invite' });
      expect(writes).toHaveLength(0);
      expect(hashSpy).not.toHaveBeenCalled();
      expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ operation: 'invite', user: null, email: 'new@example.com' }));
    });

    it('update with a password returns {redirect: accountUrl}: no throw, no hash, nothing stored', async () => {
      const { svc, writes } = build(resolving(external), { [owned.email]: owned });
      const result = await svc.update({ id: 7, name: 'Renamed', password: 'N3w!Passw0rd' } as any, ctx());
      expect(result).toMatchObject({ redirect: external.accountUrl, ownedBy: 'external' });
      expect(writes).toHaveLength(0);
      expect(hashSpy).not.toHaveBeenCalled();
    });

    it('changePassword returns {success:false, redirect} without comparing, hashing or storing', async () => {
      const { svc, writes } = build(resolving(external), { [owned.email]: owned });
      const result = await svc.changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx());
      expect(result).toMatchObject({ success: false, redirect: external.accountUrl, ownedBy: 'external' });
      expect(writes).toHaveLength(0);
      expect(compareSpy).not.toHaveBeenCalled();
      expect(hashSpy).not.toHaveBeenCalled();
    });
  });

  describe('frozen', () => {
    it('invite, update and changePassword refuse FORBIDDEN with the reason, without hashing', async () => {
      const { svc, writes } = build(resolving(frozen), { [owned.email]: owned });
      await expect(svc.invite({ email: 'new@example.com', password: 'N3w!Passw0rd' } as any, ctx())).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'migration in progress' });
      await expect(svc.update({ id: 7, password: 'N3w!Passw0rd' } as any, ctx())).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'migration in progress' });
      await expect(svc.changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx())).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'migration in progress' });
      expect(writes).toHaveLength(0);
      expect(hashSpy).not.toHaveBeenCalled();
    });
  });

  describe('none', () => {
    it('invite allocates with a hashed verifier; update with a password and changePassword are NOT_FOUND', async () => {
      const { svc, writes } = build(resolving(none), { [owned.email]: owned });
      await expect(svc.invite({ email: 'new@example.com', password: 'N3w!Passw0rd' } as any, ctx())).resolves.toMatchObject({ isNewUser: true });
      expect(writes).toEqual([expect.objectContaining({ op: 'create', data: expect.objectContaining({ password: 'hashed:N3w!Passw0rd' }) })]);

      writes.length = 0;
      hashSpy.mockClear();
      await expect(svc.update({ id: 7, password: 'N3w!Passw0rd' } as any, ctx())).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(svc.changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx())).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(writes).toHaveLength(0);
      expect(hashSpy).not.toHaveBeenCalled();
    });
  });

  describe('local and default', () => {
    it('a local resolver and no resolver write identically', async () => {
      for (const resolver of [resolving(local), undefined]) {
        const { svc, writes } = build(resolver, { [owned.email]: owned });
        await expect(svc.changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx())).resolves.toMatchObject({ success: true });
        await svc.update({ id: 7, password: 'Upd!Passw0rd' } as any, ctx());
        await svc.invite({ email: 'i@example.com', password: 'Inv!Passw0rd' } as any, ctx());
        expect(writes.map((w) => w.op)).toEqual(['updatePassword', 'update', 'create']);
        expect(writes[0].hash).toBe('hashed:N3w!Passw0rd');
        expect(writes[1].data.password).toBe('hashed:Upd!Passw0rd');
        expect(writes[2].data.password).toBe('hashed:Inv!Passw0rd');
      }
    });
  });

  describe('precedence and adapter equivalence', () => {
    it('resolveCredentialOwner wins over a refusing guard', async () => {
      const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'guard says no' });
      const { svc, writes } = build(resolving(local), { [owned.email]: owned }, { canWriteLocalCredential: guard });
      await expect(svc.changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx())).resolves.toMatchObject({ success: true });
      expect(writes).toHaveLength(1);
      expect(guard).not.toHaveBeenCalled();
    });

    it('guard alone ≡ fromLocalCredentialGuard(guard) on invite, update and changePassword, allow and refuse', async () => {
      const calls: Array<(svc: any) => Promise<unknown>> = [
        (svc) => svc.invite({ email: 'new@example.com', password: 'N3w!Passw0rd' }, ctx()),
        (svc) => svc.update({ id: 7, password: 'N3w!Passw0rd' }, ctx()),
        (svc) => svc.changePassword({ userId: 7, currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, ctx()),
      ];
      for (const verdict of [{ allowed: true }, { allowed: false, reason: 'owned elsewhere' }]) {
        const guard = async () => verdict as any;
        for (const call of calls) {
          const run = async (hooks: Record<string, unknown>) => {
            const { repo, writes } = rememberingRepo({ [owned.email]: owned });
            const svc = createUserService({ hooks: { withPrivilegedDb: async (fn: any) => fn(transactionalStub({})), hashPassword, comparePassword, ...hooks }, repository: repo });
            const outcome = await call(svc).then(
              (r: any) => ({ ok: true, r: r && typeof r === 'object' ? { ...r } : r }),
              (e: any) => ({ ok: false, code: e.code, message: e.message }),
            );
            return { outcome, writes };
          };
          const viaGuard = await run({ canWriteLocalCredential: guard });
          const viaAdapter = await run({ resolveCredentialOwner: fromLocalCredentialGuard(guard) });
          expect(viaAdapter.outcome).toEqual(viaGuard.outcome);
          expect(viaAdapter.writes).toEqual(viaGuard.writes);
          if (!verdict.allowed) {
            expect(viaGuard.outcome).toEqual({ ok: false, code: 'FORBIDDEN', message: 'owned elsewhere' });
            expect(viaGuard.writes).toHaveLength(0);
          }
        }
      }
    });
  });
});

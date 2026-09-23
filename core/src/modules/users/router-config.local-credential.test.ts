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
import { transactionalStub } from '../auth/__test-support__/transactional-stub';

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
    db: transactionalStub({}),
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
    ({ input, service: { db: {}, orgId: 0, userId: '' }, actor: {}, db: transactionalStub({}), repo: new Repo({}), ctx: {} }) as any;

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

describe('users router — resolveCredentialOwner', () => {
  const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };
  const hashPassword = vi.fn(async (p: string) => `hashed:${p}`);
  const comparePassword = vi.fn(async (p: string, h: string) => h === `hashed:${p}`);
  const build = (resolver: any, existing: Record<string, any> = {}, extra: Partial<UserRouterDeps> = {}) => {
    hashPassword.mockClear();
    comparePassword.mockClear();
    const { Repo, writes } = stubRepo(existing);
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, resolveCredentialOwner: resolver, ...extra });
    return { cfg, Repo, writes };
  };

  describe('external', () => {
    it('invite and create refuse with OWNED_ELSEWHERE carrying accountUrl, hash nothing, write nothing', async () => {
      for (const proc of ['invite', 'create'] as const) {
        const resolver = resolving(external);
        const { cfg, Repo, writes } = build(resolver);
        const err = await cfg[proc].handler(userCtx({ input: { email: 'new@example.com', password: 'N3w!Passw0rd' } }, Repo)).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CredentialOwnedElsewhereError);
        expect(err).toMatchObject({ code: 'OWNED_ELSEWHERE', accountUrl: external.accountUrl, resetUrl: external.resetUrl, operation: proc });
        expect(writes).toHaveLength(0);
        expect(hashPassword).not.toHaveBeenCalled();
        expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ operation: proc, user: null, email: 'new@example.com' }));
      }
    });

    it('update with a password returns {redirect: accountUrl} — no throw, no hash, no store (not even the other fields)', async () => {
      const { cfg, Repo, writes } = build(resolving(external), { [owned.email]: owned });
      const result = await cfg.update.handler(userCtx({ input: { id: 7, name: 'Renamed', password: 'N3w!Passw0rd' } }, Repo));
      expect(result).toMatchObject({ redirect: external.accountUrl, ownedBy: 'external', accountUrl: external.accountUrl });
      expect(writes).toHaveLength(0);
      expect(hashPassword).not.toHaveBeenCalled();
    });

    it('changePassword returns {success:false, redirect} without comparing, hashing or storing', async () => {
      const { cfg, Repo, writes } = build(resolving(external), { [owned.email]: owned });
      const result = await cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo));
      expect(result).toMatchObject({ success: false, redirect: external.accountUrl, ownedBy: 'external' });
      expect(writes).toHaveLength(0);
      expect(comparePassword).not.toHaveBeenCalled();
      expect(hashPassword).not.toHaveBeenCalled();
    });
  });

  describe('frozen', () => {
    it('every writer refuses FORBIDDEN with the reason, without hashing', async () => {
      const calls: Array<[string, any]> = [
        ['invite', { email: 'new@example.com', password: 'N3w!Passw0rd' }],
        ['create', { email: 'new@example.com', password: 'N3w!Passw0rd' }],
        ['update', { id: 7, password: 'N3w!Passw0rd' }],
        ['changePassword', { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }],
      ];
      for (const [proc, input] of calls) {
        const { cfg, Repo, writes } = build(resolving(frozen), { [owned.email]: owned });
        await expect(cfg[proc].handler(userCtx({ input }, Repo))).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'migration in progress' });
        expect(writes).toHaveLength(0);
        expect(hashPassword).not.toHaveBeenCalled();
      }
    });

    it('a frozen owner with an empty reason gets the neutral "try again shortly" message', async () => {
      const { cfg, Repo } = build(resolving({ kind: 'frozen', reason: '' }), { [owned.email]: owned });
      await expect(cfg.changePassword.handler(userCtx({ input: { currentPassword: 'x', newPassword: 'y' } }, Repo)))
        .rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/try again shortly/) });
    });
  });

  describe('none', () => {
    it('invite and create allocate with a hashed verifier', async () => {
      for (const proc of ['invite', 'create'] as const) {
        const { cfg, Repo, writes } = build(resolving(none));
        const result = await cfg[proc].handler(userCtx({ input: { email: 'new@example.com', password: 'N3w!Passw0rd' } }, Repo));
        expect(result).toMatchObject({ id: 99, email: 'new@example.com' });
        expect(writes[0].data.password).toBe('hashed:N3w!Passw0rd');
      }
    });

    it('update with a password and changePassword are NOT_FOUND, nothing written', async () => {
      const { cfg, Repo, writes } = build(resolving(none), { [owned.email]: owned });
      await expect(cfg.update.handler(userCtx({ input: { id: 7, password: 'N3w!Passw0rd' } }, Repo))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(writes).toHaveLength(0);
      expect(hashPassword).not.toHaveBeenCalled();
    });
  });

  describe('local', () => {
    it('every writer writes exactly as with no resolver', async () => {
      for (const resolver of [resolving(local), undefined]) {
        const { cfg, Repo, writes } = build(resolver, { [owned.email]: owned });
        await expect(cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo))).resolves.toEqual({ success: true });
        await cfg.update.handler(userCtx({ input: { id: 7, password: 'Upd!Passw0rd' } }, Repo));
        await cfg.create.handler(userCtx({ input: { email: 'c@example.com', password: 'Cre!Passw0rd' } }, Repo));
        await cfg.invite.handler(userCtx({ input: { email: 'i@example.com', password: 'Inv!Passw0rd' } }, Repo));
        expect(writes.map((w) => w.op)).toEqual(['updatePassword', 'update', 'create', 'create']);
        expect(writes[0].hash).toBe('hashed:N3w!Passw0rd');
        expect(writes[1].data.password).toBe('hashed:Upd!Passw0rd');
      }
    });
  });

  describe('precedence and adapter equivalence', () => {
    it('resolveCredentialOwner wins: a refusing guard is ignored when a resolver is given', async () => {
      const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'guard says no' });
      const { cfg, Repo, writes } = build(resolving(local), { [owned.email]: owned }, { canWriteLocalCredential: guard });
      await expect(cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo))).resolves.toEqual({ success: true });
      expect(writes).toHaveLength(1);
      expect(guard).not.toHaveBeenCalled();
    });

    it('guard alone ≡ fromLocalCredentialGuard(guard) as the resolver, on every writer, allow and refuse', async () => {
      const calls: Array<[string, any]> = [
        ['invite', { email: 'new@example.com', password: 'N3w!Passw0rd' }],
        ['create', { email: 'new@example.com', password: 'N3w!Passw0rd' }],
        ['update', { id: 7, password: 'N3w!Passw0rd' }],
        ['changePassword', { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }],
      ];
      for (const verdict of [{ allowed: true }, { allowed: false, reason: 'owned elsewhere' }]) {
        for (const [proc, input] of calls) {
          const run = async (deps: Partial<UserRouterDeps>) => {
            const { Repo, writes } = stubRepo({ [owned.email]: owned });
            const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, ...deps });
            const outcome = await cfg[proc].handler(userCtx({ input }, Repo)).then(
              (r: unknown) => ({ ok: true, r }),
              (e: any) => ({ ok: false, code: e.code, message: e.message }),
            );
            return { outcome, writes };
          };
          const guard = async () => verdict as any;
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

describe('auth router — resolveCredentialOwner (register)', () => {
  const hashPassword = vi.fn(async (p: string) => `hashed:${p}`);
  const deps = (Repo: any, resolver: any, extra: Record<string, unknown> = {}) => ({
    Repository: Repo,
    hashPassword,
    getPrivilegedDb: () => ({}),
    schema: { users: {}, userRoles: {} },
    isRegistrationEnabled: () => true,
    resolveCredentialOwner: resolver,
    ...extra,
  });
  const publicCtx = (input: any, Repo: any) =>
    ({ input, service: { db: {}, orgId: 0, userId: '' }, actor: {}, db: transactionalStub({}), repo: new Repo({}), ctx: {} }) as any;
  const input = { email: 'new@example.com', password: 'N3w!Passw0rd', name: 'New' };

  it('external: OWNED_ELSEWHERE with accountUrl, no hash, no user', async () => {
    hashPassword.mockClear();
    const resolver = resolving(external);
    const { Repo, writes } = stubRepo({});
    const cfg: any = createAuthRouterConfig(deps(Repo, resolver));
    const err = await cfg.register.handler(publicCtx(input, Repo)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CredentialOwnedElsewhereError);
    expect(err).toMatchObject({ code: 'OWNED_ELSEWHERE', accountUrl: external.accountUrl, operation: 'register' });
    expect(writes).toHaveLength(0);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ operation: 'register', user: null, email: 'new@example.com' }));
  });

  it('frozen: FORBIDDEN with the reason, no hash, no user', async () => {
    hashPassword.mockClear();
    const { Repo, writes } = stubRepo({});
    const cfg: any = createAuthRouterConfig(deps(Repo, resolving(frozen)));
    await expect(cfg.register.handler(publicCtx(input, Repo))).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'migration in progress' });
    expect(writes).toHaveLength(0);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('none and local: the user is allocated with a hashed verifier, same as no resolver', async () => {
    for (const resolver of [resolving(none), resolving(local), undefined]) {
      const { Repo, writes } = stubRepo({});
      const cfg: any = createAuthRouterConfig(deps(Repo, resolver));
      await expect(cfg.register.handler(publicCtx(input, Repo))).resolves.toMatchObject({ id: 99, email: 'new@example.com' });
      expect(writes[0].data.password).toBe('hashed:N3w!Passw0rd');
    }
  });

  it('precedence: a refusing guard is ignored when a resolver is given; guard alone ≡ adapter', async () => {
    const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'owned elsewhere' });
    const { Repo, writes } = stubRepo({});
    const cfg: any = createAuthRouterConfig(deps(Repo, resolving(local), { canWriteLocalCredential: guard }));
    await expect(cfg.register.handler(publicCtx(input, Repo))).resolves.toMatchObject({ id: 99 });
    expect(writes).toHaveLength(1);
    expect(guard).not.toHaveBeenCalled();

    const viaGuard = stubRepo({});
    const viaAdapter = stubRepo({});
    const a: any = createAuthRouterConfig(deps(viaGuard.Repo, undefined, { canWriteLocalCredential: guard }));
    const b: any = createAuthRouterConfig(deps(viaAdapter.Repo, fromLocalCredentialGuard(guard)));
    await expect(a.register.handler(publicCtx(input, viaGuard.Repo))).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'owned elsewhere' });
    await expect(b.register.handler(publicCtx(input, viaAdapter.Repo))).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'owned elsewhere' });
    expect(viaGuard.writes).toEqual(viaAdapter.writes);
    expect(viaGuard.writes).toHaveLength(0);
  });
});

/**
 * `onCredentialWritten` — the announcement every successful local verifier
 * write makes, on the auth and users routers.
 *
 * The contract these pin, from the SDK's side: exactly ONE call per successful
 * write, naming the operation and the subject; ZERO calls on a refusal (any
 * non-local owner) or a failed current-password compare; and ZERO calls where
 * no verifier was written at all (an invite or create with no password, an
 * update of a name). A consumer that injects no hook sees no change.
 *
 * Classification: MOCK. The repository and the db handle are stubs — these
 * assert the SDK's call sites and ordering, not a database. The `lower(email)`
 * tests in `repository.stored-email-case.test.ts` render REAL drizzle SQL.
 */
import { describe, expect, it, vi } from 'vitest';
import { transactionalStub } from '../auth/__test-support__/transactional-stub';

import { createAuthRouterConfig } from '../auth/router-config';
import type { CredentialOwner } from '../auth/credential-owner';
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
  return { Repo: Repo as unknown as UserRouterDeps['Repository'], writes };
}

const hashPassword = async (p: string) => `hashed:${p}`;
const comparePassword = async (p: string, h: string) => h === `hashed:${p}`;

const external: CredentialOwner = {
  kind: 'external',
  issuer: 'https://idp.example.com',
  providerId: 'idp',
  accountUrl: 'https://idp.example.com/account',
  resetUrl: 'https://idp.example.com/forgot',
};
const frozen: CredentialOwner = { kind: 'frozen', reason: 'mid-migration' };
const none: CredentialOwner = { kind: 'none' };

const REFUSING_OWNERS: Array<[string, CredentialOwner]> = [
  ['external', external],
  ['frozen', frozen],
  ['none', none],
];

function userCtx(overrides: Partial<{ input: any; userId: string; orgId: number | null }>, Repo: any) {
  return {
    input: overrides.input,
    service: { db: {}, orgId: overrides.orgId ?? 1, userId: overrides.userId ?? '7' },
    actor: {},
    db: transactionalStub({ handle: 'the-db' }),
    repo: new Repo({}),
    ctx: {},
  } as any;
}

describe('users router — onCredentialWritten fires once per successful write', () => {
  const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };

  it('changePassword announces change-password after the write', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, onCredentialWritten });

    await expect(
      cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo)),
    ).resolves.toEqual({ success: true });

    expect(writes).toEqual([{ op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' }]);
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({
        // p77: the write and the hook share the seam's transaction.
        db: { handle: 'the-db:tx' },
        userId: 7,
        operation: 'change-password',
        actorUserId: 7,
        firstSet: false,
      }),
    );
    expect(onCredentialWritten.mock.calls[0][0].at).toBeInstanceOf(Date);
  });

  it('update WITH a password announces update; update without one announces nothing', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, onCredentialWritten });

    await cfg.update.handler(userCtx({ input: { id: 7, password: 'N3w!Passw0rd' }, userId: '42' }, Repo));
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, operation: 'update', actorUserId: 42, firstSet: false }),
    );

    onCredentialWritten.mockClear();
    await cfg.update.handler(userCtx({ input: { id: 7, name: 'Renamed' } }, Repo));
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('update onto a user with no stored verifier reports firstSet', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo } = stubRepo({ 'none@example.com': { id: 8, email: 'none@example.com', password: null } });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, onCredentialWritten });

    await cfg.update.handler(userCtx({ input: { id: 8, password: 'N3w!Passw0rd' } }, Repo));
    expect(onCredentialWritten).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update', firstSet: true }));
  });

  it('invite and create announce only when the input CARRIED a password', async () => {
    for (const procedure of ['invite', 'create'] as const) {
      const onCredentialWritten = vi.fn();
      const { Repo } = stubRepo({});
      const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, onCredentialWritten });

      await cfg[procedure].handler(userCtx({ input: { email: 'new@example.com', password: 'N3w!Passw0rd' } }, Repo));
      expect(onCredentialWritten).toHaveBeenCalledTimes(1);
      expect(onCredentialWritten).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 99, operation: procedure, actorUserId: 7, firstSet: true }),
      );

      onCredentialWritten.mockClear();
      const fresh = stubRepo({});
      const cfg2: any = createUserRouterConfig({ Repository: fresh.Repo, hashPassword, comparePassword, onCredentialWritten });
      await cfg2[procedure].handler(userCtx({ input: { email: 'nopw@example.com' } }, fresh.Repo));
      expect(onCredentialWritten).not.toHaveBeenCalled();
    }
  });

  it('invite of an EXISTING user announces nothing — no verifier is written', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, onCredentialWritten });

    await cfg.invite.handler(userCtx({ input: { email: owned.email, password: 'Ignored!Pass1' } }, Repo));
    expect(writes).toHaveLength(0);
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('a wrong current password announces nothing', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword, onCredentialWritten });

    await expect(
      cfg.changePassword.handler(userCtx({ input: { currentPassword: 'WRONG', newPassword: 'N3w!Passw0rd' } }, Repo)),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(writes).toHaveLength(0);
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it.each(REFUSING_OWNERS)('a %s owner refuses every writer and announces nothing', async (_kind, owner) => {
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({
      Repository: Repo,
      hashPassword,
      comparePassword,
      resolveCredentialOwner: () => owner,
      onCredentialWritten,
    });

    // changePassword and update: refused by throw or by redirect, per kind.
    await cfg.changePassword
      .handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo))
      .catch(() => undefined);
    await cfg.update.handler(userCtx({ input: { id: 7, password: 'N3w!Passw0rd' } }, Repo)).catch(() => undefined);

    // invite and create of a NEW email: `none` legitimately allocates, so it
    // announces; `external` and `frozen` refuse and must not.
    const fresh = stubRepo({});
    const cfg2: any = createUserRouterConfig({
      Repository: fresh.Repo,
      hashPassword,
      comparePassword,
      resolveCredentialOwner: () => owner,
      onCredentialWritten,
    });
    await cfg2.invite.handler(userCtx({ input: { email: 'new@example.com', password: 'N3w!Passw0rd' } }, fresh.Repo)).catch(() => undefined);
    await cfg2.create.handler(userCtx({ input: { email: 'new2@example.com', password: 'N3w!Passw0rd' } }, fresh.Repo)).catch(() => undefined);

    if (owner.kind === 'none') {
      // `none` means "nobody else claims it": the two allocating writers run.
      expect(writes).toHaveLength(0);
      expect(onCredentialWritten.mock.calls.map((c) => c[0].operation)).toEqual(['invite', 'create']);
    } else {
      expect(writes).toHaveLength(0);
      expect(onCredentialWritten).not.toHaveBeenCalled();
    }
  });
});

describe('auth router — onCredentialWritten on register', () => {
  const deps = (extra: Record<string, unknown>) => ({
    Repository: stubRepo({}).Repo as any,
    hashPassword,
    getPrivilegedDb: () => ({}),
    schema: { users: {}, userRoles: {} },
    isRegistrationEnabled: () => true,
    ...extra,
  });

  const input = { email: 'new@example.com', password: 'N3w!Passw0rd', name: 'New' };

  it('announces register exactly once after the user is created', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo({});
    const cfg: any = createAuthRouterConfig(deps({ Repository: Repo, onCredentialWritten }));

    await cfg.register.handler({ input, repo: new (Repo as any)({}), db: transactionalStub({ handle: 'the-db' }) } as any);

    expect(writes).toHaveLength(1);
    expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    expect(onCredentialWritten).toHaveBeenCalledWith(
      expect.objectContaining({ db: { handle: 'the-db:tx' }, userId: 99, operation: 'register', firstSet: true }),
    );
    // No session exists at registration, so there is no actor to name.
    expect(onCredentialWritten.mock.calls[0][0].actorUserId).toBeUndefined();
  });

  it.each(REFUSING_OWNERS)('a %s owner: register announces only when it allocates', async (_kind, owner) => {
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo({});
    const cfg: any = createAuthRouterConfig(
      deps({ Repository: Repo, onCredentialWritten, resolveCredentialOwner: () => owner }),
    );

    await cfg.register
      .handler({ input, repo: new (Repo as any)({}), db: transactionalStub({}) } as any)
      .catch(() => undefined);

    if (owner.kind === 'none') {
      expect(writes).toHaveLength(1);
      expect(onCredentialWritten).toHaveBeenCalledTimes(1);
    } else {
      expect(writes).toHaveLength(0);
      expect(onCredentialWritten).not.toHaveBeenCalled();
    }
  });

  it('a duplicate email announces nothing', async () => {
    const onCredentialWritten = vi.fn();
    const { Repo } = stubRepo({ 'new@example.com': { id: 1, email: 'new@example.com' } });
    const cfg: any = createAuthRouterConfig(deps({ Repository: Repo, onCredentialWritten }));

    await expect(
      cfg.register.handler({ input, repo: new (Repo as any)({}), db: transactionalStub({}) } as any),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });
});

describe('onCredentialWritten — regression for consumers that inject none', () => {
  it('every writer behaves exactly as before when no hook is given', async () => {
    const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };
    const { Repo, writes } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword });

    await expect(
      cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo)),
    ).resolves.toEqual({ success: true });
    await cfg.update.handler(userCtx({ input: { id: 7, password: 'An0ther!Pass' } }, Repo));

    expect(writes).toEqual([
      { op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' },
      { op: 'update', id: 7, data: { password: 'hashed:An0ther!Pass' } },
    ]);
  });

  it('a throwing hook surfaces to the caller — a dropped record is not a control', async () => {
    const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass1' };
    const { Repo } = stubRepo({ [owned.email]: owned });
    const cfg: any = createUserRouterConfig({
      Repository: Repo,
      hashPassword,
      comparePassword,
      onCredentialWritten: () => { throw new Error('audit insert failed'); },
    });

    await expect(
      cfg.changePassword.handler(userCtx({ input: { currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' } }, Repo)),
    ).rejects.toThrow('audit insert failed');
  });
});

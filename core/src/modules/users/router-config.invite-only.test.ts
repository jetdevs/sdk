/**
 * Invite-only (YMS-494 S6): no admin hands another person a password.
 *
 *   1. `user.invite` accepts no password — the schema rejects one (400) and
 *      the handler refuses one even when called directly.
 *   2. `user.create` likewise.
 *   3. `user.update` refuses a password for ANOTHER user, whoever asks
 *      (org admin or platform system user). A user setting their OWN
 *      password keeps working, as does `changePassword`.
 *
 * A form's default `password: ''` / `null` counts as "no password", so a UI
 * that still carries an empty field is not broken by the lock.
 *
 * Classification: MOCK — stubbed repository and db handle.
 */
import { describe, expect, it, vi } from 'vitest';
import { transactionalStub } from '../auth/__test-support__/transactional-stub';

import { createUserRouterConfig, type UserRouterDeps } from './router-config';
import { ADMIN_SET_PASSWORD_REFUSED, userCreateSchema, userUpdateSchema } from './schemas';

function stubRepo(existing: Array<Record<string, any>> = []) {
  const writes: any[] = [];
  class Repo {
    constructor(public db: any) {}
    async findByEmail(_db: any, email: string) {
      return existing.find((u) => u.email === email) ?? null;
    }
    async findById(_db: any, id: number) {
      return existing.find((u) => u.id === id) ?? null;
    }
    async create(_db: any, data: any) { writes.push({ op: 'create', data }); return { id: 99, ...data }; }
    async update(_db: any, id: number, data: any) { writes.push({ op: 'update', id, data }); return { id, ...data }; }
    async updatePassword(_db: any, id: number, hash: string) { writes.push({ op: 'updatePassword', id, hash }); }
    async hasRoleInOrg() { return true; }
    async assignRole() { /* not under test */ }
  }
  return { Repo: Repo as unknown as UserRouterDeps['Repository'], writes };
}

const hashPassword = async (p: string) => `hashed:${p}`;
const comparePassword = async (p: string, h: string) => h === `hashed:${p}`;

function ctx(input: any, Repo: any, opts: { userId?: string; actor?: any } = {}) {
  return {
    input,
    service: { db: {}, orgId: 1, userId: opts.userId ?? '7' },
    // A platform system user passes every other check, so a refusal here is
    // the password rule and nothing else.
    actor: opts.actor ?? { isSystemUser: true, permissions: ['user:update'] },
    db: transactionalStub({}),
    repo: new Repo({}),
    ctx: {},
  } as any;
}

describe('invite-only — schemas', () => {
  it('userCreateSchema rejects a password with the invite-only message', () => {
    const result = userCreateSchema.safeParse({ email: 'new@example.com', password: 'N3w!Passw0rd' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(ADMIN_SET_PASSWORD_REFUSED);
  });

  it.each([[''], [null], [undefined]])('userCreateSchema treats password=%j as absent', (password) => {
    const result = userCreateSchema.safeParse({ email: 'new@example.com', password });
    expect(result.success).toBe(true);
    expect(result.success && result.data.password).toBeUndefined();
  });

  it('userUpdateSchema still parses a password (the router decides whose)', () => {
    expect(userUpdateSchema.safeParse({ id: 7, password: 'N3w!Passw0rd' }).success).toBe(true);
  });
});

describe('invite-only — invite and create', () => {
  it.each(['invite', 'create'] as const)('%s with a password is BAD_REQUEST; nothing hashed or written', async (proc) => {
    const hash = vi.fn(hashPassword);
    const onCredentialWritten = vi.fn();
    const { Repo, writes } = stubRepo();
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword: hash, comparePassword, onCredentialWritten });

    await expect(
      cfg[proc].handler(ctx({ email: 'new@example.com', password: 'N3w!Passw0rd' }, Repo)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: ADMIN_SET_PASSWORD_REFUSED });
    expect(hash).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(onCredentialWritten).not.toHaveBeenCalled();
  });

  it('invite of an EXISTING user with a password is refused too', async () => {
    const { Repo, writes } = stubRepo([{ id: 8, email: 'there@example.com' }]);
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword });
    await expect(
      cfg.invite.handler(ctx({ email: 'there@example.com', password: 'N3w!Passw0rd' }, Repo)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(writes).toHaveLength(0);
  });

  it.each(['invite', 'create'] as const)('%s without a password creates a user with no verifier', async (proc) => {
    const hash = vi.fn(hashPassword);
    const { Repo, writes } = stubRepo();
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword: hash, comparePassword });

    await cfg[proc].handler(ctx({ email: 'new@example.com', password: '' }, Repo));
    expect(hash).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe('create');
    expect(writes[0].data.password).toBeUndefined();
  });
});

describe('invite-only — update', () => {
  const other = { id: 8, email: 'other@example.com', password: 'hashed:Old!Pass1' };
  const self = { id: 7, email: 'self@example.com', password: 'hashed:Old!Pass1' };

  it.each([
    ['platform system user', { isSystemUser: true }],
    ['org admin with user:update', { permissions: ['user:update'] }],
  ])('a %s cannot set ANOTHER user\'s password — FORBIDDEN, nothing written', async (_who, actor) => {
    const hash = vi.fn(hashPassword);
    const { Repo, writes } = stubRepo([self, other]);
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword: hash, comparePassword });

    await expect(
      cfg.update.handler(ctx({ id: 8, name: 'Renamed', password: 'N3w!Passw0rd' }, Repo, { userId: '7', actor })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: ADMIN_SET_PASSWORD_REFUSED });
    expect(hash).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('an admin can still edit another user\'s profile without a password', async () => {
    const { Repo, writes } = stubRepo([self, other]);
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword });
    await cfg.update.handler(ctx({ id: 8, name: 'Renamed' }, Repo, { userId: '7' }));
    expect(writes).toEqual([{ op: 'update', id: 8, data: { name: 'Renamed' } }]);
  });

  it('a user setting their OWN password through update still works', async () => {
    const { Repo, writes } = stubRepo([self]);
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword });
    await cfg.update.handler(ctx({ id: 7, password: 'N3w!Passw0rd' }, Repo, { userId: '7', actor: {} }));
    expect(writes).toEqual([{ op: 'update', id: 7, data: { password: 'hashed:N3w!Passw0rd' } }]);
  });

  it('changePassword (self-serve) still works', async () => {
    const { Repo, writes } = stubRepo([self]);
    const cfg: any = createUserRouterConfig({ Repository: Repo, hashPassword, comparePassword });
    await expect(
      cfg.changePassword.handler(ctx({ currentPassword: 'Old!Pass1', newPassword: 'N3w!Passw0rd' }, Repo, { actor: {} })),
    ).resolves.toEqual({ success: true });
    expect(writes).toEqual([{ op: 'updatePassword', id: 7, hash: 'hashed:N3w!Passw0rd' }]);
  });
});

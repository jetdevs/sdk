/**
 * Users router — a caller acts only on users of its own org (YMS-296), and
 * may not hand out a platform role (YMS-297).
 *
 * The users table has no row security, so a user id says nothing about the
 * org. getById, update, delete, bulkUpdate and bulkDelete took any id; update
 * also checked no permission at all.
 */
import { describe, expect, it } from 'vitest';

import { createUserRouterConfig, type UserRouterDeps } from './router-config';

const ORG = 1;
const SELF = 7;
const MEMBER = 50; // in the org's user list
const SUSPENDED = 51; // in the org's user list (suspended members are listed)
const REMOVED = 52; // removed from the org; a role row may linger, the list does not show it
const ROLE_ONLY = 53; // has a role row in the org but is not in its user list: the caller can write that row itself
const STAFF = 54; // platform user, not in the org's user list
const OUTSIDER = 60; // nothing in this org

function build() {
  const writes: string[] = [];
  const listQueries: Array<number | undefined> = [];
  class Repo {
    constructor(public db: any) {}
    /** The org's user list: what the Users page of this org shows. */
    async findAll(_db: any, options: any) {
      listQueries.push(options.filters.orgId);
      return options.filters.orgId === ORG ? [{ id: SELF }, { id: MEMBER }, { id: SUSPENDED }] : [];
    }
    async count() { return 3; }
    async getUserRolesBatch() { return new Map(); }
    async getMembershipStatuses() { return new Map(); }
    async findById(_db: any, id: number) { return { id, email: `u${id}@example.com` }; }
    async getUserRoles() { return []; }
    async update(_db: any, id: number) { writes.push(`update:${id}`); return { id }; }
    async softDelete(_db: any, id: number) { writes.push(`softDelete:${id}`); return { id }; }
    async bulkUpdate(_db: any, ids: number[]) { writes.push(`bulkUpdate:${ids.join(',')}`); return ids.map((id) => ({ id })); }
    async findByEmail() { return null; }
    async hasRoleInOrg() { return false; }
    async assignRole() { writes.push('assignRole'); }
  }
  const cfg: any = createUserRouterConfig({
    Repository: Repo as unknown as UserRouterDeps['Repository'],
    hashPassword: async (p: string) => `hashed:${p}`,
    comparePassword: async () => true,
  });
  return { cfg, writes, listQueries, Repo };
}

function ctx(Repo: any, input: any, actor: Record<string, unknown> = {}, db: any = {}) {
  return {
    input,
    service: { db: {}, orgId: ORG, userId: String(SELF) },
    actor: { userId: SELF, orgId: ORG, isSystemUser: false, permissions: ['user:read', 'user:update', 'user:delete', 'user:create'], ...actor },
    db,
    repo: new Repo({}),
    ctx: {},
  } as any;
}

/** A database that answers the role lookup of the assignability check. */
function roleDb(roleRow: unknown, platformRows: unknown[] = []) {
  let call = 0;
  const chain = (rows: unknown[]) => {
    const c: any = { from: () => c, innerJoin: () => c, where: () => c, limit: async () => rows };
    return c;
  };
  return { select: () => chain(call++ === 0 ? (roleRow ? [roleRow] : []) : platformRows) };
}

describe('users router — target user must be in the caller’s org (YMS-296)', () => {
  for (const [who, id] of [
    ['a user of another org', OUTSIDER],
    ['a removed member', REMOVED],
    ['a user the caller only gave a role to', ROLE_ONLY],
    ['a platform user', STAFF],
  ] as const) {
    it(`getById reads ${who} as not found`, async () => {
      const { cfg, Repo } = build();
      await expect(cfg.getById.handler(ctx(Repo, id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it(`update refuses ${who} and writes nothing`, async () => {
      const { cfg, writes, Repo } = build();
      await expect(cfg.update.handler(ctx(Repo, { id, name: 'x' }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(writes).toEqual([]);
    });

    it(`delete refuses ${who} and writes nothing`, async () => {
      const { cfg, writes, Repo } = build();
      await expect(cfg.delete.handler(ctx(Repo, id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(writes).toEqual([]);
    });
  }

  it('bulkUpdate and bulkDelete refuse a list that contains a user of another org', async () => {
    const { cfg, writes, Repo } = build();
    await expect(
      cfg.bulkUpdate.handler(ctx(Repo, { userIds: [MEMBER, OUTSIDER], isActive: false })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(cfg.bulkDelete.handler(ctx(Repo, { userIds: [MEMBER, OUTSIDER] }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(writes).toEqual([]);
  });

  it('works for the users the org’s own user list shows, and asks that list for the org the request runs in', async () => {
    const { cfg, writes, listQueries, Repo } = build();
    for (const id of [MEMBER, SUSPENDED]) {
      await expect(cfg.getById.handler(ctx(Repo, id))).resolves.toMatchObject({ id });
      await cfg.update.handler(ctx(Repo, { id, name: 'x' }));
    }
    await cfg.delete.handler(ctx(Repo, MEMBER));
    await cfg.bulkUpdate.handler(ctx(Repo, { userIds: [MEMBER, SUSPENDED], isActive: false }));
    expect(writes).toEqual([
      `update:${MEMBER}`, `update:${SUSPENDED}`, `softDelete:${MEMBER}`, `bulkUpdate:${MEMBER},${SUSPENDED}`,
    ]);
    expect(new Set(listQueries)).toEqual(new Set([ORG]));
  });

  it('refuses everyone but the caller itself when the request has no org', async () => {
    const { cfg, writes, Repo } = build();
    const c = ctx(Repo, { id: MEMBER, name: 'x' });
    c.service.orgId = null;
    await expect(cfg.update.handler(c)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(cfg.getAll.handler(c)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(cfg.getAllWithStats.handler({ ...c, input: { limit: 20, offset: 0 } })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(writes).toEqual([]);
  });

  it('invite tells an org-level caller nothing about an existing person beyond what it sent', async () => {
    const { cfg, Repo } = build();
    (Repo.prototype as any).findByEmail = async () => ({ id: OUTSIDER, email: 'x@example.com', name: 'Other Org Person', phone: '+100', password: 'hash' });
    const result = await cfg.invite.handler(ctx(Repo, { email: 'x@example.com' }));
    expect(result).toEqual({ id: OUTSIDER, email: 'x@example.com' });
  });

  it('update: a user edits itself without user:update', async () => {
    const { cfg, writes, Repo } = build();
    await cfg.update.handler(ctx(Repo, { id: SELF, name: 'me' }, { permissions: [] }));
    expect(writes).toEqual([`update:${SELF}`]);
  });

  it('update: editing another member needs user:update', async () => {
    const { cfg, writes, Repo } = build();
    await expect(
      cfg.update.handler(ctx(Repo, { id: MEMBER, name: 'x' }, { permissions: ['user:read'] })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes).toEqual([]);
  });

  it('a platform system user still acts on any user', async () => {
    const { cfg, writes, Repo } = build();
    const staff = { isSystemUser: true, permissions: ['admin:full_access'] };
    await cfg.update.handler(ctx(Repo, { id: OUTSIDER, name: 'x' }, staff));
    await cfg.delete.handler(ctx(Repo, OUTSIDER, staff));
    await expect(cfg.getById.handler(ctx(Repo, OUTSIDER, staff))).resolves.toMatchObject({ id: OUTSIDER });
    expect(writes).toEqual([`update:${OUTSIDER}`, `softDelete:${OUTSIDER}`]);
  });
});

describe('users router — an org-level caller cannot hand out a platform role (YMS-297)', () => {
  const systemRole = { id: 2, orgId: null, isSystemRole: true };
  const ownRole = { id: 9, orgId: ORG, isSystemRole: false };

  for (const [name, input] of [
    ['invite', { email: 'x@example.com', roleId: 2 }],
    ['assignRole', { userId: MEMBER, roleId: 2 }],
    ['create', { email: 'x@example.com', roleId: 2, orgId: ORG }],
  ] as const) {
    it(`${name} refuses a system role and writes nothing`, async () => {
      const { cfg, writes, Repo } = build();
      await expect(cfg[name].handler(ctx(Repo, input, {}, roleDb(systemRole)))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(writes).toEqual([]);
    });

    it(`${name} refuses a role that carries a platform permission`, async () => {
      const { cfg, writes, Repo } = build();
      await expect(
        cfg[name].handler(ctx(Repo, { ...input, roleId: 9 }, {}, roleDb(ownRole, [{ id: 1 }]))),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(writes).toEqual([]);
    });
  }

  it('assignRole still assigns an ordinary role of the own org', async () => {
    const { cfg, writes, Repo } = build();
    await expect(
      cfg.assignRole.handler(ctx(Repo, { userId: MEMBER, roleId: 9 }, {}, roleDb(ownRole))),
    ).resolves.toEqual({ success: true });
    expect(writes).toEqual(['assignRole']);
  });
});

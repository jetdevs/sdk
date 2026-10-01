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
const MEMBER = 50; // org_members: active
const SUSPENDED = 51; // org_members: suspended
const REMOVED = 52; // org_members: removed, but an active role row lingers
const LEGACY = 53; // no org_members row, active role in the org
const STAFF = 54; // no org_members row, only an org-less (system) role
const OUTSIDER = 60; // nothing in this org

function build() {
  const writes: string[] = [];
  class Repo {
    constructor(public db: any) {}
    async getMembershipStatuses(_db: any, ids: number[]) {
      const all = new Map<number, string>([[MEMBER, 'active'], [SUSPENDED, 'suspended'], [REMOVED, 'removed']]);
      return new Map(ids.filter((id) => all.has(id)).map((id) => [id, all.get(id)!]));
    }
    async getUserRolesBatch(_db: any, ids: number[]) {
      const all = new Map<number, any[]>([
        [REMOVED, [{ orgId: ORG, isActive: true }]],
        [LEGACY, [{ orgId: ORG, isActive: true }]],
        [STAFF, [{ orgId: null, isActive: true }]],
      ]);
      return new Map(ids.filter((id) => all.has(id)).map((id) => [id, all.get(id)!]));
    }
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
  return { cfg, writes, Repo };
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
  for (const [who, id] of [['a user of another org', OUTSIDER], ['a removed member', REMOVED], ['a platform user with only an org-less role', STAFF]] as const) {
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

  it('works for members: active, suspended, and a legacy member known only by its role', async () => {
    const { cfg, writes, Repo } = build();
    for (const id of [MEMBER, SUSPENDED, LEGACY]) {
      await expect(cfg.getById.handler(ctx(Repo, id))).resolves.toMatchObject({ id });
      await cfg.update.handler(ctx(Repo, { id, name: 'x' }));
    }
    await cfg.delete.handler(ctx(Repo, MEMBER));
    await cfg.bulkUpdate.handler(ctx(Repo, { userIds: [MEMBER, LEGACY], isActive: false }));
    expect(writes).toEqual([
      `update:${MEMBER}`, `update:${SUSPENDED}`, `update:${LEGACY}`, `softDelete:${MEMBER}`, `bulkUpdate:${MEMBER},${LEGACY}`,
    ]);
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

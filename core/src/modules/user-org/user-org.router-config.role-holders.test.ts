/**
 * Role holders (YMS-674 / CAD-510).
 *
 * - getUsersByRole shows platform staff every holding, including the
 *   platform-wide (org NULL) Super User grants; everyone else sees their org.
 * - A platform-wide grant can be added and removed by platform staff only,
 *   and only for a system role.
 * - An org-level caller cannot take away a system role, and removing a role
 *   in one org never deletes the platform-wide grant.
 */
import { PgDialect, boolean, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { orgs, roles, userRoles, users } from '../../db/schema';
import { createUserOrgRepository } from './user-org.repository';
import { createUserOrgRouterConfig } from './user-org.router-config';

const OWN_ORG = 1;

class TRPCError extends Error {
  code: string;
  constructor(opts: { code: string; message: string }) {
    super(opts.message);
    this.code = opts.code;
  }
}

function build(otherHolders = 2) {
  const calls: string[] = [];
  class Repo {
    async countActiveRoleHolders(roleId: number, excludeUserId?: number) { calls.push(`count:${roleId}:${excludeUserId}`); return otherHolders; }
    constructor(public db: any) {}
    async getRoleById() { return { id: 1, roleCategory: 'user' }; }
    async findRoleAssignment() { return null; }
    async createRoleAssignment(data: any) { calls.push(`create:${data.orgId}`); }
    async deleteRoleAssignment(_u: number, _r: number, orgId: number | null) { calls.push(`delete:${orgId}`); return true; }
    async getRoleHolders(roleId: number, orgId: number | null) { calls.push(`holders:${roleId}:${orgId}`); return []; }
  }
  const cfg: any = createUserOrgRouterConfig({ Repository: Repo as any, TRPCError: TRPCError as any } as any);
  return { cfg, calls, Repo };
}

/** A database whose role lookup answers `role`, with no platform permission. */
function roleDb(role: TestRole) {
  let call = 0;
  const chain = (rows: unknown[]) => {
    const q: any = { from: () => q, innerJoin: () => q, where: () => q, limit: async () => rows };
    return q;
  };
  return { select: () => chain(call++ % 2 === 0 ? [role] : []) };
}

type TestRole = { id: number; orgId: number | null; isSystemRole: boolean };
const SUPER_USER: TestRole = { id: 1, orgId: null, isSystemRole: true };
const ORG_ROLE: TestRole = { id: 3, orgId: OWN_ORG, isSystemRole: false };

function ctx(Repo: any, input: Record<string, unknown>, actor: Record<string, unknown>, role: TestRole = SUPER_USER) {
  return {
    input,
    service: { db: {}, orgId: OWN_ORG, userId: '7' },
    actor: { userId: 7, orgId: OWN_ORG, isSystemUser: false, ...actor },
    db: roleDb(role),
    repo: new Repo({}),
    ctx: {},
  } as any;
}

describe('getUsersByRole', () => {
  it('needs user:read and runs cross-org', () => {
    const { cfg } = build();
    expect(cfg.getUsersByRole.permission).toBe('user:read');
    expect(cfg.getUsersByRole.crossOrg).toBe(true);
  });

  it('gives platform staff every holding, platform-wide ones included', async () => {
    const { cfg, calls, Repo } = build();
    await cfg.getUsersByRole.handler(ctx(Repo, { roleId: 1 }, { isSystemUser: true }));
    expect(calls).toEqual(['holders:1:null']);
  });

  it('gives an org admin their own org only', async () => {
    const { cfg, calls, Repo } = build();
    await cfg.getUsersByRole.handler(ctx(Repo, { roleId: 1 }, {}));
    expect(calls).toEqual([`holders:1:${OWN_ORG}`]);
  });
});

describe('platform-wide (org NULL) grants', () => {
  for (const name of ['assignRole', 'removeRole']) {
    it(`${name} refuses a caller that is not platform staff`, async () => {
      const { cfg, calls, Repo } = build();
      await expect(
        cfg[name].handler(ctx(Repo, { userId: 50, roleId: 1, orgId: null }, {})),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(calls).toEqual([]);
    });

    it(`${name} refuses a role that is not a system role`, async () => {
      const { cfg, calls, Repo } = build();
      await expect(
        cfg[name].handler(ctx(Repo, { userId: 50, roleId: 3, orgId: null }, { isSystemUser: true }, ORG_ROLE)),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(calls).toEqual([]);
    });
  }

  it('assignRole lets platform staff grant Super User platform-wide', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.assignRole.handler(ctx(Repo, { userId: 50, roleId: 1, orgId: null }, { isSystemUser: true })),
    ).resolves.toMatchObject({ success: true });
    expect(calls).toEqual(['create:null']);
  });

  it('removeRole lets platform staff remove the platform-wide grant', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.removeRole.handler(ctx(Repo, { userId: 50, roleId: 1, orgId: null }, { isSystemUser: true })),
    ).resolves.toMatchObject({ success: true });
    expect(calls).toEqual(['count:1:50', 'delete:null']);
  });
});

describe('removeRole by an org-level caller', () => {
  it('still removes an org role that carries a platform permission (Admin)', async () => {
    const { cfg, calls, Repo } = build();
    const c = ctx(Repo, { userId: 50, roleId: 3, orgId: OWN_ORG }, {}, ORG_ROLE);
    // every role lookup answers "has a platform permission"
    const q: any = { from: () => q, innerJoin: () => q, where: () => q, limit: async () => [{ id: 9 }] };
    let call = 0;
    c.db = { select: () => (call++ === 0 ? { ...q, limit: async () => [ORG_ROLE] } : q) };
    await expect(cfg.removeRole.handler(c)).resolves.toMatchObject({ success: true });
    expect(calls).toEqual([`delete:${OWN_ORG}`]);
  });

  it('refuses to take away a system role in their own org', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.removeRole.handler(ctx(Repo, { userId: 50, roleId: 1, orgId: OWN_ORG }, {})),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toEqual([]);
  });
});

describe('deleteRoleAssignment matches the org exactly', () => {
  const Repo = createUserOrgRepository({ tables: { userRoles, users, roles, orgs } });
  const dialect = new PgDialect();

  async function whereSql(orgId: number | null): Promise<string> {
    let where: any;
    const db: any = {
      delete: () => ({
        where: (w: any) => {
          where = w;
          return { returning: async () => [{ id: 1 }] };
        },
      }),
    };
    await new Repo(db).deleteRoleAssignment(50, 1, orgId);
    return dialect.sqlToQuery(where).sql;
  }

  it('an org id deletes that org only, never the platform-wide grant', async () => {
    const sql = await whereSql(OWN_ORG);
    expect(sql).toContain('"org_id" = $');
    expect(sql).not.toMatch(/is null/i);
  });

  it('null deletes the platform-wide grant only', async () => {
    const sql = await whereSql(null);
    expect(sql).toMatch(/"org_id" is null/i);
  });
});

describe('system roles are never per company', () => {
  it('assignRole refuses a system role in a numeric org, even for platform staff', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.assignRole.handler(ctx(Repo, { userId: 50, roleId: 1, orgId: OWN_ORG }, { isSystemUser: true })),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'System roles are platform-wide' });
    expect(calls).toEqual([]);
  });

  it('assignRole still assigns an org role in a numeric org', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.assignRole.handler(ctx(Repo, { userId: 50, roleId: 3, orgId: OWN_ORG }, { isSystemUser: true }, ORG_ROLE)),
    ).resolves.toMatchObject({ success: true });
    expect(calls).toEqual([`create:${OWN_ORG}`]);
  });
});

describe('removeRole keeps someone holding a system role', () => {
  it('refuses removing your own system role', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.removeRole.handler(ctx(Repo, { userId: 7, roleId: 1, orgId: null }, { isSystemUser: true })),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: "You can't remove your own system role" });
    expect(calls).toEqual([]);
  });

  it('refuses removing the last active holder', async () => {
    const { cfg, calls, Repo } = build(0);
    await expect(
      cfg.removeRole.handler(ctx(Repo, { userId: 50, roleId: 1, orgId: null }, { isSystemUser: true })),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: "Can't remove the last holder of this role" });
    expect(calls).toEqual(['count:1:50']);
  });

  it('does not count holders when removing an org role', async () => {
    const { cfg, calls, Repo } = build(0);
    await expect(
      cfg.removeRole.handler(ctx(Repo, { userId: 7, roleId: 3, orgId: OWN_ORG }, {}, ORG_ROLE)),
    ).resolves.toMatchObject({ success: true });
    expect(calls).toEqual([`delete:${OWN_ORG}`]);
  });
});

describe('countActiveRoleHolders', () => {
  it('counts distinct active users holding the role, leaving one out', async () => {
    const Repo = createUserOrgRepository({ tables: { userRoles, users, roles, orgs } });
    let where: any;
    let fields: any;
    const q: any = {
      from: () => q,
      innerJoin: () => q,
      where: async (w: any) => { where = w; return [{ count: '3' }]; },
    };
    const db: any = { select: (f: any) => { fields = f; return q; } };
    await expect(new Repo(db).countActiveRoleHolders(1, 50)).resolves.toBe(3);
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(fields.count).sql).toMatch(/count\(distinct/i);
    expect(dialect.sqlToQuery(where).sql).toContain('<>');
  });
});

describe('getRoleHolders lastSeenAt', () => {
  function capture() {
    let fields: any;
    const row = { assignmentId: 1, id: 50, email: 'a@x', name: 'A', isActive: true, orgId: null, orgName: null, assignedAt: null, assignedById: null };
    const q: any = {
      from: () => q, innerJoin: () => q, leftJoin: () => q, where: () => q,
      orderBy: async () => [fields.lastSeenAt ? { ...row, lastSeenAt: new Date(0) } : row],
    };
    const db: any = { select: (f: any) => { fields = f; return q; } };
    return { db, fields: () => fields };
  }

  it('is null when the users table has no lastSeenAt column (core)', async () => {
    const Repo = createUserOrgRepository({ tables: { userRoles, users, roles, orgs } });
    const c = capture();
    const [holder] = await new Repo(c.db).getRoleHolders(1, null);
    expect(c.fields()).not.toHaveProperty('lastSeenAt');
    expect(holder!.lastSeenAt).toBeNull();
  });

  it("comes from the app's users.lastSeenAt when the column exists", async () => {
    const appUsers = pgTable('users', {
      id: integer('id').primaryKey(),
      email: varchar('email', { length: 255 }),
      name: text('name'),
      isActive: boolean('is_active'),
      lastSeenAt: timestamp('last_seen_at'),
    });
    const Repo = createUserOrgRepository({ tables: { userRoles, users: appUsers, roles, orgs } });
    const c = capture();
    const [holder] = await new Repo(c.db).getRoleHolders(1, null);
    expect(c.fields()).toHaveProperty('lastSeenAt', appUsers.lastSeenAt);
    expect(holder!.lastSeenAt).toEqual(new Date(0));
  });
});

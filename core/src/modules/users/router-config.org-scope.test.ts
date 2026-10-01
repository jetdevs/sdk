/**
 * Users router — a caller acts only in its own org (YMS-292).
 *
 * invite, create, assignRole, removeRole, removeFromOrg and getAllWithStats accept an
 * `orgId` in the input. Only a platform system user may name an org other
 * than its own; everyone else is refused before anything is read or written.
 *
 * `service.orgId` is set to the foreign org in these tests on purpose: the
 * handlers must refuse even when the layer above already ran the request in
 * the org the client named.
 */
import { describe, expect, it } from 'vitest';

import { createUserRouterConfig, type UserRouterDeps } from './router-config';

const OWN_ORG = 1;
const FOREIGN_ORG = 2;

function build() {
  const calls: Array<{ op: string; orgId?: number | null }> = [];
  class Repo {
    constructor(public db: any) {}
    async findByEmail() { calls.push({ op: 'findByEmail' }); return { id: 50, email: 'x@example.com' }; }
    async findAll(_db: any, opts: any) { calls.push({ op: 'findAll', orgId: opts.filters.orgId }); return []; }
    async count(_db: any, filters: any) { calls.push({ op: 'count', orgId: filters.orgId }); return 0; }
    async getUserRolesBatch() { return new Map(); }
    async getMembershipStatuses() { return new Map(); }
    async hasRoleInOrg(_db: any, _u: number, _r: number, orgId: number) { calls.push({ op: 'hasRoleInOrg', orgId }); return false; }
    async assignRole(_db: any, data: any) { calls.push({ op: 'assignRole', orgId: data.orgId }); }
    async removeRole(_db: any, _u: number, _r: number, orgId: number) { calls.push({ op: 'removeRole', orgId }); return 1; }
    async removeAllRolesInOrg(_db: any, _u: number, orgId: number) { calls.push({ op: 'removeAllRolesInOrg', orgId }); return 1; }
  }
  const cfg: any = createUserRouterConfig({
    Repository: Repo as unknown as UserRouterDeps['Repository'],
    hashPassword: async (p: string) => `hashed:${p}`,
    comparePassword: async () => true,
  });
  return { cfg, calls, Repo };
}

/** A database that answers the role lookup done before a role is assigned: an ordinary own-org role. */
function ownRoleDb() {
  let call = 0;
  const chain = (rows: unknown[]) => {
    const c: any = { from: () => c, innerJoin: () => c, where: () => c, limit: async () => rows };
    return c;
  };
  return { select: () => chain(call++ === 0 ? [{ id: 3, orgId: OWN_ORG, isSystemRole: false }] : []) };
}

function ctx(Repo: any, input: any, actor: Record<string, unknown>, serviceOrgId: number) {
  return {
    input,
    service: { db: {}, orgId: serviceOrgId, userId: '7' },
    actor: { userId: 7, orgId: OWN_ORG, isSystemUser: false, ...actor },
    db: ownRoleDb(),
    repo: new Repo({}),
    ctx: {},
  } as any;
}

const procedures: Array<[string, Record<string, unknown>]> = [
  ['invite', { email: 'x@example.com', roleId: 3 }],
  ['create', { email: 'x@example.com', roleId: 3 }],
  ['assignRole', { userId: 50, roleId: 3 }],
  ['removeRole', { userId: 50, roleId: 3 }],
  ['removeFromOrg', { userId: 50 }],
  ['getAllWithStats', { limit: 20, offset: 0 }],
];

describe('users router — foreign org (YMS-292)', () => {
  for (const [name, extra] of procedures) {
    it(`${name} refuses a foreign org for a caller that is not a system user`, async () => {
      const { cfg, calls, Repo } = build();
      await expect(
        cfg[name].handler(ctx(Repo, { orgId: FOREIGN_ORG, ...extra }, {}, FOREIGN_ORG)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(calls).toEqual([]);
    });
  }

  it('assignRole in the own org still works', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.assignRole.handler(ctx(Repo, { orgId: OWN_ORG, userId: 50, roleId: 3 }, {}, OWN_ORG)),
    ).resolves.toEqual({ success: true });
    expect(calls.at(-1)).toEqual({ op: 'assignRole', orgId: OWN_ORG });
  });

  it('removeFromOrg with no org named acts in the org the request runs in', async () => {
    const { cfg, calls, Repo } = build();
    await expect(cfg.removeFromOrg.handler(ctx(Repo, { userId: 50 }, {}, OWN_ORG))).resolves.toEqual({ removed: 1 });
    expect(calls).toEqual([{ op: 'removeAllRolesInOrg', orgId: OWN_ORG }]);
  });

  it('a platform system user may still name another org', async () => {
    const { cfg, calls, Repo } = build();
    await expect(
      cfg.removeFromOrg.handler(ctx(Repo, { orgId: FOREIGN_ORG, userId: 50 }, { isSystemUser: true }, FOREIGN_ORG)),
    ).resolves.toEqual({ removed: 1 });
    expect(calls).toEqual([{ op: 'removeAllRolesInOrg', orgId: FOREIGN_ORG }]);
  });
});

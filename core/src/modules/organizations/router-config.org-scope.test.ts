/**
 * Organizations router — a caller acts only in its own org (YMS-292).
 *
 * The member procedures (addUser, removeUser, updateUserRole) and `list` used
 * to accept a foreign org from anyone who also sent `crossOrgAccess: true`, a
 * flag the client controls, and then wrote through the privileged connection.
 * Only a platform system user may name an org other than its own.
 *
 * `service.orgId` is set to the foreign org in these tests on purpose: the
 * handlers must refuse even when the layer above already ran the request in
 * the org the client named.
 */
import { describe, expect, it, vi } from 'vitest';

import { createOrgRouterConfig } from './router-config';

const OWN_ORG = 1;
const FOREIGN_ORG = 2;

function build() {
  const withPrivilegedDb = vi.fn(async () => ({ privileged: true }));
  const calls: string[] = [];
  class Repo {
    constructor(public db: any) {}
    async findById(_db: any, id: number) {
      calls.push(`findById:${id}`);
      return { id, name: `org-${id}` };
    }
    async list() {
      calls.push('list');
      return { organizations: [], pagination: {} };
    }
  }
  const cfg: any = createOrgRouterConfig({ Repository: Repo as any, withPrivilegedDb } as any);
  return { cfg, withPrivilegedDb, calls, Repo };
}

function ctx(Repo: any, input: any, actor: Record<string, unknown>, serviceOrgId: number) {
  return {
    input,
    service: { db: {}, orgId: serviceOrgId, userId: '7' },
    actor: { userId: 7, orgId: OWN_ORG, isSystemUser: false, ...actor },
    db: {},
    repo: new Repo({}),
    ctx: {},
  } as any;
}

describe('organizations router — foreign org (YMS-292)', () => {
  const memberProcedures: Array<[string, Record<string, unknown>]> = [
    ['addUser', { userId: 50, role: 'Member' }],
    ['removeUser', { userId: 50 }],
    ['updateUserRole', { userId: 50, role: 'Member' }],
  ];

  for (const [name, extra] of memberProcedures) {
    it(`${name} refuses a foreign org for a caller that is not a system user`, async () => {
      const { cfg, withPrivilegedDb, Repo } = build();
      await expect(
        cfg[name].handler(ctx(Repo, { orgId: FOREIGN_ORG, ...extra }, {}, FOREIGN_ORG)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(withPrivilegedDb).not.toHaveBeenCalled();
    });

    it(`${name} refuses a foreign org even when the client sends crossOrgAccess`, async () => {
      const { cfg, withPrivilegedDb, Repo } = build();
      await expect(
        cfg[name].handler(ctx(Repo, { orgId: FOREIGN_ORG, crossOrgAccess: true, ...extra }, {}, OWN_ORG)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(withPrivilegedDb).not.toHaveBeenCalled();
    });

    it(`${name} still lets a platform system user act in another org`, async () => {
      const { cfg, withPrivilegedDb, Repo } = build();
      await expect(
        cfg[name].handler(
          ctx(Repo, { orgId: FOREIGN_ORG, crossOrgAccess: true, ...extra }, { isSystemUser: true }, FOREIGN_ORG),
        ),
      ).resolves.toEqual({ privileged: true });
      expect(withPrivilegedDb).toHaveBeenCalledTimes(1);
    });
  }

  it('list returns only the own org to a non-system caller that sends crossOrgAccess', async () => {
    const { cfg, withPrivilegedDb, calls, Repo } = build();
    const result = await cfg.list.handler(
      ctx(Repo, { page: 1, pageSize: 20, crossOrgAccess: true }, {}, OWN_ORG),
    );
    expect(withPrivilegedDb).not.toHaveBeenCalled();
    expect(calls).toEqual([`findById:${OWN_ORG}`]);
    expect(result.organizations).toEqual([{ id: OWN_ORG, name: `org-${OWN_ORG}` }]);
  });

  it('list still gives a platform system user every org', async () => {
    const { cfg, withPrivilegedDb, Repo } = build();
    await cfg.list.handler(ctx(Repo, { page: 1, pageSize: 20, crossOrgAccess: true }, { isSystemUser: true }, OWN_ORG));
    expect(withPrivilegedDb).toHaveBeenCalledTimes(1);
  });
});

/**
 * User-org router — role assignment stays in the caller's own org (YMS-292).
 *
 * assignRole and removeRole are `crossOrg` routes gated by a permission, so the
 * router factory runs them in the org the input names. That is for platform
 * staff. A caller that is not a platform system user holds its permission in
 * its own org only, and is refused for any other.
 */
import { describe, expect, it } from 'vitest';

import { createUserOrgRouterConfig } from './user-org.router-config';

const OWN_ORG = 1;
const FOREIGN_ORG = 2;

class TRPCError extends Error {
  code: string;
  constructor(opts: { code: string; message: string }) {
    super(opts.message);
    this.code = opts.code;
  }
}

function build() {
  const calls: string[] = [];
  class Repo {
    constructor(public db: any) {}
    async getRoleById() { calls.push('getRoleById'); return { id: 3, roleCategory: 'user' }; }
    async findRoleAssignment() { calls.push('findRoleAssignment'); return null; }
    async createRoleAssignment(data: any) { calls.push(`createRoleAssignment:${data.orgId}`); }
    async deleteRoleAssignment(_u: number, _r: number, orgId: number) { calls.push(`deleteRoleAssignment:${orgId}`); return true; }
  }
  const cfg: any = createUserOrgRouterConfig({ Repository: Repo as any, TRPCError: TRPCError as any } as any);
  return { cfg, calls, Repo };
}

function ctx(Repo: any, orgId: number, actor: Record<string, unknown> = {}) {
  return {
    input: { userId: 50, roleId: 3, orgId },
    // The factory runs a permission-gated cross-org route in the named org.
    service: { db: {}, orgId, userId: '7' },
    actor: { userId: 7, orgId: OWN_ORG, isSystemUser: false, ...actor },
    db: {},
    repo: new Repo({}),
    ctx: {},
  } as any;
}

describe('user-org router — foreign org (YMS-292)', () => {
  for (const name of ['assignRole', 'removeRole']) {
    it(`${name} refuses a foreign org for a caller that is not a system user`, async () => {
      const { cfg, calls, Repo } = build();
      await expect(cfg[name].handler(ctx(Repo, FOREIGN_ORG))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(calls).toEqual([]);
    });

    it(`${name} works in the caller's own org`, async () => {
      const { cfg, calls, Repo } = build();
      await expect(cfg[name].handler(ctx(Repo, OWN_ORG))).resolves.toMatchObject({ success: true });
      expect(calls.at(-1)).toMatch(new RegExp(`RoleAssignment:${OWN_ORG}$`));
    });

    it(`${name} still lets a platform system user act in another org`, async () => {
      const { cfg, calls, Repo } = build();
      await expect(cfg[name].handler(ctx(Repo, FOREIGN_ORG, { isSystemUser: true }))).resolves.toMatchObject({
        success: true,
      });
      expect(calls.at(-1)).toMatch(new RegExp(`RoleAssignment:${FOREIGN_ORG}$`));
    });
  }
});

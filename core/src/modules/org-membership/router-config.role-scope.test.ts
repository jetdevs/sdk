/**
 * Org-membership router — an invitation cannot carry a platform role (YMS-297).
 *
 * inviteByEmail, inviteExistingUser and reinvite store the role the caller
 * picked; it is granted when the invitation is accepted.
 */
import { describe, expect, it } from 'vitest';

import { createOrgMembershipRouterConfig } from './router-config';

function roleDb(roleRow: unknown) {
  let call = 0;
  const chain = (rows: unknown[]) => {
    const c: any = { from: () => c, innerJoin: () => c, where: () => c, limit: async () => rows };
    return c;
  };
  return { select: () => chain(call++ === 0 ? (roleRow ? [roleRow] : []) : []) };
}

function build() {
  const calls: string[] = [];
  class Repo {
    constructor(public db: any) {}
    async invite(_db: any, data: any) { calls.push(`invite:${data.pendingRoleId}`); return { ...data, status: 'invited' }; }
    async reinvite(_db: any, userId: number, _orgId: number, _by: number, roleId: number) { calls.push(`reinvite:${roleId}`); return { userId }; }
  }
  const cfg: any = createOrgMembershipRouterConfig({
    Repository: Repo as any,
    findOrCreateUserByEmail: async () => ({ id: 50 }),
  } as any);
  const ctx = (input: any, role: unknown, actor: Record<string, unknown> = {}) => ({
    input,
    service: { db: {}, orgId: 1, userId: '7' },
    actor: { userId: 7, orgId: 1, isSystemUser: false, ...actor },
    db: roleDb(role),
    repo: new Repo({}),
    ctx: {},
  }) as any;
  return { cfg, calls, ctx };
}

const systemRole = { id: 2, orgId: null, isSystemRole: true };
const ownRole = { id: 9, orgId: 1, isSystemRole: false };

describe('org-membership router — platform role (YMS-297)', () => {
  const procedures: Array<[string, Record<string, unknown>]> = [
    ['inviteByEmail', { email: 'x@example.com' }],
    ['inviteExistingUser', { userId: 50 }],
    ['reinvite', { userId: 50 }],
  ];

  for (const [name, input] of procedures) {
    it(`${name} refuses a system role and stores nothing`, async () => {
      const { cfg, calls, ctx } = build();
      await expect(cfg[name].handler(ctx({ ...input, roleId: 2 }, systemRole))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(calls).toEqual([]);
    });

    it(`${name} keeps working with an ordinary role and with no role`, async () => {
      const { cfg, calls, ctx } = build();
      await cfg[name].handler(ctx({ ...input, roleId: 9 }, ownRole));
      await cfg[name].handler(ctx({ ...input }, null));
      expect(calls).toHaveLength(2);
    });
  }

  it('a platform system user may invite with a system role', async () => {
    const { cfg, calls, ctx } = build();
    await cfg.inviteByEmail.handler(ctx({ email: 'x@example.com', roleId: 2 }, systemRole, { isSystemUser: true }));
    expect(calls).toEqual(['invite:2']);
  });
});

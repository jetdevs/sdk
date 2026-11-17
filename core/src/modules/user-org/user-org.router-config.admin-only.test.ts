/**
 * Users & roles are admin-only (Sean 2026-10-27, SECURITY).
 *
 * The reads behind the Users & roles screen used to carry no permission, so
 * any org member could list who holds a role, the roles of any org, and the
 * permission catalog. Each now needs the admin screen's read slug, and the
 * role pickers stay in the caller's own org.
 */
import { describe, expect, it } from 'vitest';

import { createUserOrgRouterConfig } from './user-org.router-config';
import { createPermissionRouterConfig } from '../../trpc/routers/permission.router';

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
    async getAvailableRolesForOrg(orgId: number) { calls.push(`roles:${orgId}`); return []; }
    async getAvailableServiceRoles(orgId: number) { calls.push(`service:${orgId}`); return []; }
  }
  const cfg: any = createUserOrgRouterConfig({ Repository: Repo as any, TRPCError: TRPCError as any } as any);
  return { cfg, calls, Repo };
}

describe('user-org reads behind Users & roles need a permission', () => {
  it('getUsersByRole needs user:read', () => {
    expect(build().cfg.getUsersByRole.permission).toBe('user:read');
  });

  for (const name of ['getAvailableRoles', 'getAvailableServiceRoles']) {
    it(`${name} needs role:read and refuses a foreign org`, async () => {
      const { cfg, calls, Repo } = build();
      expect(cfg[name].permission).toBe('role:read');
      const c = (orgId: number, actor: Record<string, unknown> = {}) => ({
        input: { orgId },
        service: { db: {}, orgId, userId: '7' },
        actor: { userId: 7, orgId: 1, isSystemUser: false, ...actor },
        repo: new Repo({}),
        ctx: {},
      }) as any;
      await expect(cfg[name].handler(c(2))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(calls).toEqual([]);
      await cfg[name].handler(c(1));
      await cfg[name].handler(c(2, { isSystemUser: true }));
      expect(calls).toHaveLength(2);
    });
  }
});

describe('permission catalog reads need role:read', () => {
  const cfg: any = createPermissionRouterConfig({ Repository: class {} as any } as any);
  for (const [name, route] of Object.entries<any>(cfg)) {
    it(name, () => {
      expect(route.permission, name).toBeTruthy();
      if (route.type === 'query') expect(route.permission).toBe('role:read');
    });
  }
});

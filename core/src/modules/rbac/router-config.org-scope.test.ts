/**
 * Role router — the org named in the input must be the caller's own (YMS-292).
 *
 * getById, getWithPermissions, assignPermissions and removePermissions are
 * `crossOrg` routes gated by a permission, so the router factory runs them in
 * the org the input names. That reach is for platform staff. A caller that is
 * not a platform system user is refused for any org but its own, before the
 * role service is asked anything.
 */
import { describe, expect, it, vi } from 'vitest';

import { createRoleRouterConfig } from './router-config';

const OWN_ORG = 1;
const FOREIGN_ORG = 2;

function build() {
  const service = {
    getById: vi.fn().mockResolvedValue({ id: 9 }),
    getWithPermissions: vi.fn().mockResolvedValue({ id: 9 }),
    assignPermissions: vi.fn().mockResolvedValue({ id: 9 }),
    removePermissions: vi.fn().mockResolvedValue({ id: 9 }),
    copyRole: vi.fn().mockResolvedValue({ id: 10 }),
  };
  const cfg: any = createRoleRouterConfig({ Service: service as any });
  return { cfg, service };
}

function ctx(input: any, serviceOrgId: number, actor: Record<string, unknown> = {}) {
  return {
    input,
    service: { db: {}, orgId: serviceOrgId, userId: '7' },
    actor: { userId: 7, orgId: OWN_ORG, roles: [], permissions: ['role:read'], isSystemUser: false, ...actor },
    db: {},
    repo: undefined,
    ctx: {},
  } as any;
}

const procedures: Array<[string, Record<string, unknown>]> = [
  ['getById', { id: 9 }],
  ['getWithPermissions', { roleId: 9 }],
  ['assignPermissions', { roleId: 9, permissionIds: [1] }],
  ['removePermissions', { roleId: 9, permissionIds: [1] }],
];

describe('role router — foreign org (YMS-292)', () => {
  it('copyRole refuses a foreign target org for a caller that is not a system user', async () => {
    const { cfg, service } = build();
    await expect(
      cfg.copyRole.handler(ctx({ sourceRoleId: 9, targetOrgId: FOREIGN_ORG }, FOREIGN_ORG)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(service.copyRole).not.toHaveBeenCalled();
  });

  it('copyRole still lets a platform system user copy into another org', async () => {
    const { cfg, service } = build();
    await cfg.copyRole.handler(ctx({ sourceRoleId: 9, targetOrgId: FOREIGN_ORG }, FOREIGN_ORG, { isSystemUser: true }));
    expect(service.copyRole).toHaveBeenCalledTimes(1);
  });

  for (const [name, extra] of procedures) {
    it(`${name} refuses a foreign org for a caller that is not a system user`, async () => {
      const { cfg, service } = build();
      await expect(
        cfg[name].handler(ctx({ ...extra, orgId: FOREIGN_ORG, crossOrgAccess: true }, FOREIGN_ORG)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((service as any)[name]).not.toHaveBeenCalled();
    });

    it(`${name} works when the input names the caller's own org or no org`, async () => {
      const { cfg, service } = build();
      await cfg[name].handler(ctx({ ...extra, orgId: OWN_ORG }, OWN_ORG));
      await cfg[name].handler(ctx({ ...extra }, OWN_ORG));
      expect((service as any)[name]).toHaveBeenCalledTimes(2);
    });

    it(`${name} still lets a platform system user name another org`, async () => {
      const { cfg, service } = build();
      await cfg[name].handler(
        ctx({ ...extra, orgId: FOREIGN_ORG, crossOrgAccess: true }, FOREIGN_ORG, { isSystemUser: true }),
      );
      expect((service as any)[name]).toHaveBeenCalledTimes(1);
    });
  }
});

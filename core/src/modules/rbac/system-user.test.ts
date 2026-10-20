/**
 * Platform system user = a role flagged `isSystemRole`, nothing else.
 *
 * The global Owner/Admin role TEMPLATE carries `admin:full_access` and the
 * whole `admin:*` namespace, and every org assigns it. Reading system status
 * off those permissions made every org Owner/Admin platform staff.
 *
 * A global role (org_id NULL) is one row shared by every org. Its permissions
 * at org_id NULL apply in every org, so only platform staff may change it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mayGrantPlatformPermissions } from './assignable-role';
import { RoleRepository } from './role.repository';
import { RoleService, sdkRbacSchema } from './role.service';
import { defaultCreateServiceContext } from './router-config';
import { hasBackofficeAccess } from './utils';

const OWN_ORG = 1;

/** An org Owner/Admin: the global template's permissions, no system role. */
const orgAdmin = {
  userId: 7,
  orgId: OWN_ORG,
  roles: ['Admin'],
  isSystemUser: false,
  isSuperUser: false,
  permissions: ['admin:full_access', 'admin:role_management', 'role:update', 'role:delete', 'role:assign_permissions'],
};
const staff = { ...orgAdmin, roles: ['Platform Staff'], isSystemUser: true, isSuperUser: true };

const globalTemplate = { id: 3, name: 'Admin', orgId: null, isGlobalRole: true, isSystemRole: false };
const systemRole = { id: 1, name: 'Platform Staff', orgId: null, isGlobalRole: false, isSystemRole: true };
const ownRole = { id: 9, name: 'Editor', orgId: OWN_ORG, isGlobalRole: false, isSystemRole: false };

describe('system-user status from permissions', () => {
  it('the default rbac service context does not make admin:* holders system users', () => {
    expect(defaultCreateServiceContext({} as any, orgAdmin as any, OWN_ORG).isSystemUser).toBe(false);
    expect(defaultCreateServiceContext({} as any, staff as any, OWN_ORG).isSystemUser).toBe(true);
  });

  it('admin:full_access alone may not grant platform permissions', () => {
    expect(mayGrantPlatformPermissions(orgAdmin)).toBe(false);
    expect(mayGrantPlatformPermissions(staff)).toBe(true);
  });

  it('backoffice access comes from a system role only', () => {
    expect(hasBackofficeAccess(orgAdmin.permissions, [{ isSystemRole: false }])).toBe(false);
    expect(hasBackofficeAccess([], [{ isSystemRole: true }])).toBe(true);
  });
});

describe('RoleService — system roles and global role templates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(role: Record<string, unknown>) {
    vi.spyOn(RoleRepository.prototype, 'getById').mockResolvedValue(role as any);
    vi.spyOn(RoleRepository.prototype, 'getPermissionSlugs').mockResolvedValue(['user:read']);
    vi.spyOn(RoleRepository.prototype, 'nameExists').mockResolvedValue(false);
    vi.spyOn(RoleRepository.prototype, 'hasActiveUsers').mockResolvedValue(false);
    vi.spyOn(RoleService.prototype as any, 'broadcastPermissionUpdate').mockResolvedValue(undefined);
    const writes = [
      vi.spyOn(RoleRepository.prototype, 'assignPermissions').mockResolvedValue(undefined),
      vi.spyOn(RoleRepository.prototype, 'removePermissions').mockResolvedValue(undefined as any),
      vi.spyOn(RoleRepository.prototype, 'update').mockResolvedValue(role as any),
      vi.spyOn(RoleRepository.prototype, 'softDelete').mockResolvedValue(true),
      vi.spyOn(RoleRepository.prototype, 'bulkUpdate').mockResolvedValue(1 as any),
      vi.spyOn(RoleRepository.prototype, 'bulkHardDelete').mockResolvedValue(1 as any),
    ];
    return { service: new RoleService(sdkRbacSchema), writes };
  }
  const ctx = (actor: any) =>
    ({ db: {}, actor, orgId: OWN_ORG, userId: 7, permissions: actor.permissions, isSystemUser: actor.isSystemUser }) as any;

  const mutations: Array<[string, (s: RoleService, c: any, id: number) => Promise<unknown>]> = [
    ['assignPermissions', (s, c, id) => s.assignPermissions({ roleId: id, permissionIds: [1] }, c)],
    ['removePermissions', (s, c, id) => s.removePermissions({ roleId: id, permissionIds: [1] }, c)],
    ['update', (s, c, id) => s.update({ id, name: 'Renamed' } as any, c)],
    ['delete', (s, c, id) => s.delete({ id } as any, c)],
    ['bulkUpdate', (s, c, id) => s.bulkUpdate({ roleIds: [id], action: 'deactivate' } as any, c)],
    ['bulkDelete', (s, c, id) => s.bulkDelete({ roleIds: [id] } as any, c)],
  ];

  for (const [name, run] of mutations) {
    it(`${name}: an org Admin with admin:full_access may not change a global role template`, async () => {
      const { service, writes } = setup(globalTemplate);
      await expect(run(service, ctx(orgAdmin), globalTemplate.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      for (const w of writes) expect(w).not.toHaveBeenCalled();
    });

    it(`${name}: an org Admin may change its own org's role`, async () => {
      const { service } = setup(ownRole);
      await expect(run(service, ctx(orgAdmin), ownRole.id)).resolves.toBeDefined();
    });
  }

  for (const [name, run] of mutations.filter(([n]) => n !== 'delete' && n !== 'bulkDelete')) {
    it(`${name}: platform staff may change a global role template`, async () => {
      const { service } = setup(globalTemplate);
      await expect(run(service, ctx(staff), globalTemplate.id)).resolves.toBeDefined();
    });
  }

  it('an org Admin with admin:full_access may not change a system role', async () => {
    const { service, writes } = setup(systemRole);
    await expect(
      service.assignPermissions({ roleId: systemRole.id, permissionIds: [1] }, ctx(orgAdmin)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const w of writes) expect(w).not.toHaveBeenCalled();
  });
});

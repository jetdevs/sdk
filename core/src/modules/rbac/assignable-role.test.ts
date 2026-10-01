/**
 * Who may hand out which role and permission (YMS-297).
 *
 * A user becomes platform staff by holding a system role or a platform
 * permission. Both can travel through org-level procedures, so those
 * procedures ask here first. Only platform staff may hand either out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  findRoleAssignmentRefusal,
  isPlatformPermission,
  mayGrantPlatformPermissions,
  roleAssignmentRefusal,
  type RoleAssignability,
} from './assignable-role';
import { RoleRepository } from './role.repository';
import { RoleService, sdkRbacSchema } from './role.service';

const OWN_ORG = 1;
const owner = { isSystemUser: false, isSuperUser: false, permissions: ['role:assign_permissions', 'user:create'] };
const staff = { isSystemUser: true, isSuperUser: true, permissions: ['admin:full_access'] };

const role = (over: Partial<RoleAssignability> = {}): RoleAssignability => ({
  id: 9,
  orgId: OWN_ORG,
  isSystemRole: false,
  hasPlatformPermission: false,
  ...over,
});

/** A database that answers the two lookups of loadRoleAssignability in order. */
function fakeDb(roleRow: unknown, platformRows: unknown[] = []) {
  let call = 0;
  const chain = (rows: unknown[]) => {
    const c: any = { from: () => c, innerJoin: () => c, where: () => c, limit: async () => rows };
    return c;
  };
  return { select: () => chain(call++ === 0 ? (roleRow ? [roleRow] : []) : platformRows) };
}

describe('isPlatformPermission', () => {
  it('covers the admin namespace and cross-org access, nothing else', () => {
    expect(isPlatformPermission('admin:full_access')).toBe(true);
    expect(isPlatformPermission('admin:role_management')).toBe(true);
    expect(isPlatformPermission('org:cross_org_access')).toBe(true);
    expect(isPlatformPermission('user:create')).toBe(false);
    expect(isPlatformPermission('connector_admin:view')).toBe(false);
  });
});

describe('roleAssignmentRefusal', () => {
  it('lets an org-level caller assign an own-org role and a shared role', () => {
    expect(roleAssignmentRefusal(owner, OWN_ORG, role())).toBeNull();
    expect(roleAssignmentRefusal(owner, OWN_ORG, role({ orgId: null }))).toBeNull();
  });

  it('refuses a system role, a role with a platform permission, another org’s role, an unseen role', () => {
    expect(roleAssignmentRefusal(owner, OWN_ORG, role({ orgId: null, isSystemRole: true }))).toMatch(/platform staff/);
    expect(roleAssignmentRefusal(owner, OWN_ORG, role({ hasPlatformPermission: true }))).toMatch(/platform staff/);
    expect(roleAssignmentRefusal(owner, OWN_ORG, role({ orgId: 2 }))).toBe('Role not found');
    expect(roleAssignmentRefusal(owner, OWN_ORG, null)).toBe('Role not found');
  });

  it('lets platform staff assign anything', () => {
    expect(roleAssignmentRefusal(staff, OWN_ORG, role({ orgId: null, isSystemRole: true }))).toBeNull();
    expect(roleAssignmentRefusal(staff, OWN_ORG, null)).toBeNull();
  });
});

describe('findRoleAssignmentRefusal', () => {
  it('reads the role and its platform permissions', async () => {
    await expect(
      findRoleAssignmentRefusal(fakeDb({ id: 9, orgId: OWN_ORG, isSystemRole: false }), owner, OWN_ORG, 9),
    ).resolves.toBeNull();
    await expect(
      findRoleAssignmentRefusal(fakeDb({ id: 9, orgId: OWN_ORG, isSystemRole: false }, [{ id: 1 }]), owner, OWN_ORG, 9),
    ).resolves.toMatch(/platform staff/);
    await expect(
      findRoleAssignmentRefusal(fakeDb({ id: 2, orgId: null, isSystemRole: true }), owner, OWN_ORG, 2),
    ).resolves.toMatch(/platform staff/);
  });

  it('refuses when the role is not visible or the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(findRoleAssignmentRefusal(fakeDb(null), owner, OWN_ORG, 9)).resolves.toBe('Role not found');
    await expect(findRoleAssignmentRefusal({}, owner, OWN_ORG, 9)).resolves.toBe('Role not found');
  });

  it('does not query for platform staff', async () => {
    const db = { select: vi.fn() };
    await expect(findRoleAssignmentRefusal(db, staff, OWN_ORG, 2)).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('RoleService.assignPermissions — platform permissions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(slugs: string[]) {
    vi.spyOn(RoleRepository.prototype, 'getById').mockResolvedValue({ id: 9, orgId: OWN_ORG, isSystemRole: false } as any);
    vi.spyOn(RoleRepository.prototype, 'getPermissionSlugs').mockResolvedValue(slugs);
    const write = vi.spyOn(RoleRepository.prototype, 'assignPermissions').mockResolvedValue(undefined);
    vi.spyOn(RoleService.prototype as any, 'broadcastPermissionUpdate').mockResolvedValue(undefined);
    return { service: new RoleService(sdkRbacSchema), write };
  }
  const ctx = (actor: any) => ({ db: {}, actor, orgId: OWN_ORG, userId: 7, permissions: actor.permissions, isSystemUser: !!actor.isSystemUser }) as any;

  it('refuses an org-level caller that puts a platform permission on its role, and writes nothing', async () => {
    const { service, write } = setup(['user:read', 'admin:full_access']);
    await expect(service.assignPermissions({ roleId: 9, permissionIds: [1, 2] }, ctx(owner))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses a caller that is "system" only through a lesser admin permission', async () => {
    // admin:role_management makes a caller a system user, but not one that may mint platform access.
    const lesser = { isSystemUser: true, isSuperUser: false, permissions: ['admin:role_management', 'role:assign_permissions'] };
    expect(mayGrantPlatformPermissions(lesser)).toBe(false);
    const { service, write } = setup(['admin:full_access']);
    await expect(service.assignPermissions({ roleId: 9, permissionIds: [2] }, ctx(lesser))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('lets an org-level caller assign ordinary permissions', async () => {
    const { service, write } = setup(['user:read', 'user:create']);
    await service.assignPermissions({ roleId: 9, permissionIds: [1, 3] }, ctx(owner));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('lets a caller with full platform access assign a platform permission', async () => {
    const { service, write } = setup(['admin:full_access']);
    await service.assignPermissions({ roleId: 9, permissionIds: [2] }, ctx(staff));
    expect(write).toHaveBeenCalledTimes(1);
  });
});

/**
 * Which roles and permissions an org-level caller may hand out.
 *
 * "Platform system user" is decided from what a user holds: a role flagged
 * `isSystemRole`, or any permission in the platform namespace. Both can reach
 * a user through ordinary org-level procedures (invite with a role id, assign
 * a role, put a permission on a role). So every such procedure checks here
 * first: only platform staff may hand out a platform role or permission.
 */
import { and, eq, inArray, like, or } from 'drizzle-orm';

import { permissions, rolePermissions, roles } from '../../db/schema';

/** Permissions that make their holder platform staff, or reach across orgs. */
export const PLATFORM_PERMISSION_PREFIX = 'admin:';
export const PLATFORM_PERMISSION_SLUGS = ['org:cross_org_access'] as const;

export function isPlatformPermission(slug: string): boolean {
  return (
    slug.startsWith(PLATFORM_PERMISSION_PREFIX) ||
    (PLATFORM_PERMISSION_SLUGS as readonly string[]).includes(slug)
  );
}

interface AssigningActor {
  isSystemUser?: boolean;
  isSuperUser?: boolean;
  permissions?: string[] | null;
}

/** Platform staff: may assign any role, in any org. */
export function isPlatformStaff(actor: AssigningActor | null | undefined): boolean {
  return actor?.isSystemUser === true;
}

/** May put a platform permission on a role: full platform access only. */
export function mayGrantPlatformPermissions(actor: AssigningActor | null | undefined): boolean {
  return actor?.isSuperUser === true || actor?.permissions?.includes('admin:full_access') === true;
}

export interface RoleAssignability {
  id: number;
  orgId: number | null;
  isSystemRole: boolean;
  /** The role carries at least one platform permission. */
  hasPlatformPermission: boolean;
}

/**
 * Read what decides whether a role may be assigned. Returns null when the
 * role does not exist or is not visible on this connection (row security
 * hides system roles and other orgs' roles from an org-level caller).
 */
export async function loadRoleAssignability(db: any, roleId: number): Promise<RoleAssignability | null> {
  const [role] = await db
    .select({ id: roles.id, orgId: roles.orgId, isSystemRole: roles.isSystemRole })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  if (!role) {
    return null;
  }

  const platform = await db
    .select({ id: permissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        or(
          like(permissions.slug, `${PLATFORM_PERMISSION_PREFIX}%`),
          inArray(permissions.slug, [...PLATFORM_PERMISSION_SLUGS]),
        ),
      ),
    )
    .limit(1);

  return {
    id: role.id,
    orgId: role.orgId ?? null,
    isSystemRole: role.isSystemRole === true,
    hasPlatformPermission: platform.length > 0,
  };
}

/**
 * Why `actor` may not assign `role` in `orgId`, or null when it may.
 *
 * Platform staff may assign anything. Everyone else may assign a role only
 * when it is visible, is not a system role, carries no platform permission,
 * and belongs to their own org or to no org (a shared role).
 */
export function roleAssignmentRefusal(
  actor: AssigningActor | null | undefined,
  orgId: number | null | undefined,
  role: RoleAssignability | null,
): string | null {
  if (isPlatformStaff(actor)) {
    return null;
  }
  if (!role) {
    return 'Role not found';
  }
  if (role.isSystemRole || role.hasPlatformPermission) {
    return 'This role can only be assigned by platform staff';
  }
  if (role.orgId !== null && role.orgId !== (orgId ?? null)) {
    return 'Role not found';
  }
  return null;
}

/**
 * Load and decide in one step. A lookup that fails counts as "may not".
 */
export async function findRoleAssignmentRefusal(
  db: any,
  actor: AssigningActor | null | undefined,
  orgId: number | null | undefined,
  roleId: number,
): Promise<string | null> {
  if (isPlatformStaff(actor)) {
    return null;
  }
  let role: RoleAssignability | null;
  try {
    role = await loadRoleAssignability(db, roleId);
  } catch (err) {
    console.error('[rbac] role assignability lookup failed:', err);
    return 'Role not found';
  }
  return roleAssignmentRefusal(actor, orgId, role);
}

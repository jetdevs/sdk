/**
 * Platform staff (system user) — ONE definition.
 *
 * Ported from engage-app `system-role.ts` + cadra-web
 * `src/server/api/assert-system-user.ts`. Platform staff = holds an active role
 * flagged `is_system_role`; never a role name. `is_global_role` marks a shared
 * template (Owner/Admin) and grants no platform access; holding `admin:*`
 * alone is NOT staff status, because the global Admin template carries it
 * (see rbac/system-user.test.ts). Platform FEATURES are then gated on an
 * `admin:*` permission on top of staff status (`assertPlatformPermission`).
 */
import { TRPCError } from '@trpc/server';

import { isPlatformPermission, isPlatformStaff } from '../assignable-role';
import { hasPlatformSystemRole } from '../utils';

export { isPlatformStaff };

export interface RoleFlags {
  isSystemRole?: boolean | null;
  isGlobalRole?: boolean | null;
}

export function isSystemRoleFlag(role: RoleFlags | null | undefined): boolean {
  return role?.isSystemRole === true;
}

export function hasSystemRole(roles: ReadonlyArray<RoleFlags | null | undefined> | null | undefined): boolean {
  return hasPlatformSystemRole((roles ?? []).filter((r): r is RoleFlags => r != null).map((r) => ({ isSystemRole: r.isSystemRole === true })));
}

export const PLATFORM_ADMIN_ONLY_MESSAGE = 'Only a platform administrator can do this';

/** Refuse a caller that is not a system user (FORBIDDEN). */
export function assertSystemUser(
  actor: { isSystemUser?: boolean } | null | undefined,
  message: string = PLATFORM_ADMIN_ONLY_MESSAGE,
): void {
  if (!isPlatformStaff(actor)) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
}

/**
 * Platform feature gate: system user AND holds the platform (`admin:*`)
 * permission. Throws at call time on a non-platform slug so a tenant
 * permission can never be used as a platform gate by mistake.
 */
export function assertPlatformPermission(
  actor: { isSystemUser?: boolean; permissions?: readonly string[] | null } | null | undefined,
  permission: string,
  message: string = PLATFORM_ADMIN_ONLY_MESSAGE,
): void {
  if (!isPlatformPermission(permission)) {
    throw new Error(`[rbac] ${permission} is not a platform permission`);
  }
  assertSystemUser(actor, message);
  if (!(actor?.permissions ?? []).includes(permission)) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
}

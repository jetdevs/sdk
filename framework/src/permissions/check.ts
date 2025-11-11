/**
 * Permission checking implementation
 * @internal
 */

import type { Permission, PermissionContext, PermissionCheckOptions } from './types';
import { internalCheckPermission, internalIsSuperUser } from './configure';

/**
 * Admin permission that bypasses all checks
 * @internal
 */
const ADMIN_FULL_ACCESS = 'admin:full_access';

/**
 * Check if user has a specific permission
 *
 * @param ctx - Permission context with user info and permissions
 * @param permission - Required permission string
 * @param options - Check options
 * @returns True if user has permission, false otherwise
 *
 * @example
 * ```typescript
 * const hasAccess = await checkPermission(ctx, 'campaign:create');
 * if (!hasAccess) {
 *   throw new Error('Access denied');
 * }
 * ```
 */
export async function checkPermission(
  ctx: PermissionContext,
  permission: Permission,
  options: PermissionCheckOptions = {}
): Promise<boolean> {
  const {
    throwOnDenied = true,
    errorMessage = `Permission required: ${permission}`,
  } = options;

  // Check if user is a super user (bypasses all checks)
  const isSuperUser = await internalIsSuperUser(ctx);
  if (isSuperUser) {
    return true;
  }

  // Use the configured permission checker
  const hasPermission = await internalCheckPermission(ctx, permission);

  if (!hasPermission && throwOnDenied) {
    throw new Error(errorMessage);
  }

  return hasPermission;
}

/**
 * Check if user has any of the specified permissions
 *
 * @param ctx - Permission context
 * @param permissions - Array of permissions (user needs at least one)
 * @param options - Check options
 * @returns True if user has any of the permissions
 */
export async function checkAnyPermission(
  ctx: PermissionContext,
  permissions: Permission[],
  options: PermissionCheckOptions = {}
): Promise<boolean> {
  const {
    throwOnDenied = true,
    errorMessage = `One of these permissions required: ${permissions.join(', ')}`,
  } = options;

  // Check if user is a super user (bypasses all checks)
  const isSuperUser = await internalIsSuperUser(ctx);
  if (isSuperUser) {
    return true;
  }

  // Check if user has any of the permissions using configured checker
  const checks = await Promise.all(
    permissions.map((perm) => internalCheckPermission(ctx, perm))
  );
  const hasAnyPermission = checks.some((hasPermission) => hasPermission);

  if (!hasAnyPermission && throwOnDenied) {
    throw new Error(errorMessage);
  }

  return hasAnyPermission;
}

/**
 * Check if user has all of the specified permissions
 *
 * @param ctx - Permission context
 * @param permissions - Array of permissions (user needs all)
 * @param options - Check options
 * @returns True if user has all permissions
 */
export async function checkAllPermissions(
  ctx: PermissionContext,
  permissions: Permission[],
  options: PermissionCheckOptions = {}
): Promise<boolean> {
  const {
    throwOnDenied = true,
    errorMessage = `All of these permissions required: ${permissions.join(', ')}`,
  } = options;

  // Check if user is a super user (bypasses all checks)
  const isSuperUser = await internalIsSuperUser(ctx);
  if (isSuperUser) {
    return true;
  }

  // Check if user has all permissions using configured checker
  const checks = await Promise.all(
    permissions.map((perm) => internalCheckPermission(ctx, perm))
  );
  const hasAllPermissions = checks.every((hasPermission) => hasPermission);

  if (!hasAllPermissions && throwOnDenied) {
    throw new Error(errorMessage);
  }

  return hasAllPermissions;
}

/**
 * Get list of missing permissions
 *
 * @param ctx - Permission context
 * @param requiredPermissions - Array of required permissions
 * @returns Array of missing permissions
 */
export async function getMissingPermissions(
  ctx: PermissionContext,
  requiredPermissions: Permission[]
): Promise<Permission[]> {
  // Check if user is a super user
  const isSuperUser = await internalIsSuperUser(ctx);
  if (isSuperUser) {
    return [];
  }

  // Check each permission using configured checker
  const checks = await Promise.all(
    requiredPermissions.map(async (perm) => ({
      permission: perm,
      hasPermission: await internalCheckPermission(ctx, perm),
    }))
  );

  // Return permissions that the user doesn't have
  return checks
    .filter(({ hasPermission }) => !hasPermission)
    .map(({ permission }) => permission);
}

/**
 * Permission system configuration
 *
 * Allows applications to configure how permissions are checked,
 * enabling integration with existing permission systems.
 */

import type { Permission, PermissionContext } from './types';

/**
 * Permission checker function type
 */
export type PermissionChecker = (
  ctx: any,
  permission: string
) => Promise<boolean> | boolean;

/**
 * Permission getter function type
 */
export type PermissionGetter = (
  ctx: any
) => Promise<string[]> | string[];

/**
 * Super user checker function type
 */
export type SuperUserChecker = (
  ctx: any
) => Promise<boolean> | boolean;

/**
 * Permission configuration options
 */
export interface PermissionConfig {
  /**
   * Function to check if a user has a specific permission
   */
  checkPermission: PermissionChecker;

  /**
   * Function to get all permissions for a user
   */
  getPermissions: PermissionGetter;

  /**
   * Function to check if a user is a super user
   * Super users bypass all permission checks
   */
  isSuperUser?: SuperUserChecker;

  /**
   * Admin permission that grants full access
   * Default: 'admin:full_access'
   */
  adminPermission?: string;
}

/**
 * Global permission configuration
 * @internal
 */
let permissionConfig: PermissionConfig | null = null;

/**
 * Configure the permission system
 *
 * This allows applications to integrate their existing permission
 * system with the framework.
 *
 * @param config - Permission configuration
 *
 * @example
 * ```typescript
 * import { configurePermissions } from '@yobo/framework/permissions';
 * import { hasPermission } from './auth';
 *
 * configurePermissions({
 *   checkPermission: async (ctx, permission) => {
 *     return hasPermission(ctx.user, permission);
 *   },
 *   getPermissions: async (ctx) => {
 *     return ctx.user.permissions || [];
 *   },
 *   isSuperUser: async (ctx) => {
 *     return ctx.user.role === 'super_admin';
 *   },
 * });
 * ```
 */
export function configurePermissions(config: PermissionConfig): void {
  if (permissionConfig) {
    console.warn('[Framework] Permission system already configured. Overwriting existing configuration.');
  }
  permissionConfig = config;
}

/**
 * Get the current permission configuration
 * @internal
 */
export function getPermissionConfig(): PermissionConfig | null {
  return permissionConfig;
}

/**
 * Check if permissions are configured
 * @internal
 */
export function isPermissionConfigured(): boolean {
  return permissionConfig !== null;
}

/**
 * Internal permission check that uses the configured checker
 * or falls back to checking the permissions array in context
 *
 * @internal
 */
export async function internalCheckPermission(
  ctx: any,
  permission: string
): Promise<boolean> {
  // If configured, use the custom checker
  if (permissionConfig?.checkPermission) {
    return await permissionConfig.checkPermission(ctx, permission);
  }

  // Fallback to checking permissions array in context
  // This supports the framework's built-in permission context
  if (ctx.permissions && Array.isArray(ctx.permissions)) {
    const adminPermission = permissionConfig?.adminPermission || 'admin:full_access';

    // Check for admin full access
    if (ctx.permissions.includes(adminPermission)) {
      return true;
    }

    // Check for specific permission
    return ctx.permissions.includes(permission);
  }

  // No permissions available
  return false;
}

/**
 * Internal function to get all permissions
 * @internal
 */
export async function internalGetPermissions(ctx: any): Promise<string[]> {
  // If configured, use the custom getter
  if (permissionConfig?.getPermissions) {
    return await permissionConfig.getPermissions(ctx);
  }

  // Fallback to permissions in context
  if (ctx.permissions && Array.isArray(ctx.permissions)) {
    return ctx.permissions;
  }

  return [];
}

/**
 * Internal function to check if user is super user
 * @internal
 */
export async function internalIsSuperUser(ctx: any): Promise<boolean> {
  // If configured, use the custom checker
  if (permissionConfig?.isSuperUser) {
    return await permissionConfig.isSuperUser(ctx);
  }

  // Fallback: check for common super user indicators
  if (ctx.user?.isSuperUser === true) {
    return true;
  }

  if (ctx.user?.role === 'super_admin' || ctx.user?.role === 'superuser') {
    return true;
  }

  return false;
}
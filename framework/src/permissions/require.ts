/**
 * Permission requirement decorators
 */

import type { Permission, PermissionContext, PermissionHandler } from './types';
import { checkPermission, checkAnyPermission, checkAllPermissions } from './check';

/**
 * Create a handler that requires a specific permission
 *
 * This is a decorator function that wraps your handler with permission checking.
 * The permission check is automatic and cannot be bypassed.
 *
 * @param permission - Required permission
 * @param handler - Handler function to wrap
 * @returns Wrapped handler with permission check
 *
 * @example
 * ```typescript
 * const deleteCampaign = requirePermission(
 *   'campaign:delete',
 *   async (ctx, input) => {
 *     // Permission already checked - safe to proceed
 *     return campaignRepo.delete(input.id);
 *   }
 * );
 * ```
 */
export function requirePermission<TInput = unknown, TOutput = unknown>(
  permission: Permission,
  handler: PermissionHandler<TInput, TOutput>
): PermissionHandler<TInput, TOutput> {
  return async (ctx: PermissionContext, input: TInput): Promise<TOutput> => {
    // Check permission first - throws if denied
    await checkPermission(ctx, permission);

    // Permission granted - execute handler
    return handler(ctx, input);
  };
}

/**
 * Create a handler that requires any of the specified permissions
 *
 * @param permissions - Array of permissions (user needs at least one)
 * @param handler - Handler function to wrap
 * @returns Wrapped handler with permission check
 *
 * @example
 * ```typescript
 * const viewCampaign = requireAnyPermission(
 *   ['campaign:read', 'campaign:manage'],
 *   async (ctx, input) => {
 *     return campaignRepo.findOne(input.id);
 *   }
 * );
 * ```
 */
export function requireAnyPermission<TInput = unknown, TOutput = unknown>(
  permissions: Permission[],
  handler: PermissionHandler<TInput, TOutput>
): PermissionHandler<TInput, TOutput> {
  return async (ctx: PermissionContext, input: TInput): Promise<TOutput> => {
    await checkAnyPermission(ctx, permissions);
    return handler(ctx, input);
  };
}

/**
 * Create a handler that requires all of the specified permissions
 *
 * @param permissions - Array of permissions (user needs all)
 * @param handler - Handler function to wrap
 * @returns Wrapped handler with permission check
 *
 * @example
 * ```typescript
 * const manageWorkflow = requireAllPermissions(
 *   ['workflow:update', 'workflow:execute'],
 *   async (ctx, input) => {
 *     // User has both permissions
 *     return workflowService.manageWorkflow(input);
 *   }
 * );
 * ```
 */
export function requireAllPermissions<TInput = unknown, TOutput = unknown>(
  permissions: Permission[],
  handler: PermissionHandler<TInput, TOutput>
): PermissionHandler<TInput, TOutput> {
  return async (ctx: PermissionContext, input: TInput): Promise<TOutput> => {
    await checkAllPermissions(ctx, permissions);
    return handler(ctx, input);
  };
}

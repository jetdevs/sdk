/**
 * Permission Module - Public API
 *
 * Provides declarative permission checking that cannot be bypassed
 *
 * @example
 * ```typescript
 * import { requirePermission, checkPermission } from '@jetdevs/framework/permissions';
 *
 * // Decorator pattern
 * const handler = requirePermission('campaign:create', async (ctx, input) => {
 *   // Permission already checked
 *   return createCampaign(input);
 * });
 *
 * // Imperative check
 * if (await checkPermission(ctx, 'campaign:delete')) {
 *   // User has permission
 * }
 * ```
 */

export {
    requireAllPermissions, requireAnyPermission, requirePermission
} from './require';

export {
    checkAllPermissions, checkAnyPermission, checkPermission, getMissingPermissions
} from './check';

export {
    configurePermissions, type PermissionChecker, type PermissionConfig, type PermissionGetter,
    type SuperUserChecker
} from './configure';

export type {
    Permission, PermissionCheckOptions, PermissionContext,
    PermissionHandler
} from './types';


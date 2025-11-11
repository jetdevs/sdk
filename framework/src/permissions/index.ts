/**
 * Permission Module - Public API
 *
 * Provides declarative permission checking that cannot be bypassed
 *
 * @example
 * ```typescript
 * import { requirePermission, checkPermission } from '@yobo/framework/permissions';
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
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from './require';

export {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  getMissingPermissions,
} from './check';

export {
  configurePermissions,
  type PermissionConfig,
  type PermissionChecker,
  type PermissionGetter,
  type SuperUserChecker,
} from './configure';

export type {
  Permission,
  PermissionContext,
  PermissionHandler,
  PermissionCheckOptions,
} from './types';

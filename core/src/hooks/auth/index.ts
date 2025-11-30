/**
 * Auth Hooks Module
 *
 * React hooks for authentication and permission checking.
 */

// =============================================================================
// AUTH SESSION HOOKS
// =============================================================================

export {
  createUseAuthSession,
  createUsePermission,
  createUsePermissions,
  createUseCurrentUser,
  AuthUtils,
} from './useAuthSession';

export type {
  AuthSessionData,
  UseAuthSessionResult,
  UsePermissionsResult,
  UseCurrentUserResult,
} from './useAuthSession';

// =============================================================================
// PERMISSION CHECK HOOKS
// =============================================================================

export {
  usePermissionSSE,
  createUsePermissionCheck,
  createUsePermissionConnectionStatus,
} from './usePermissionCheck';

export type {
  PermissionCheckOptions,
  SSEPermissionMessage,
  UsePermissionCheckResult,
} from './usePermissionCheck';

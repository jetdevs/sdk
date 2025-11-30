/**
 * Auth UI Components
 *
 * Permission-gated UI components for building secure interfaces.
 */

// =============================================================================
// PERMISSION CONTEXT
// =============================================================================

export {
  PermissionContext,
  PermissionProvider,
  usePermissionContext,
} from './PermissionContext';

export type {
  PermissionContextValue,
  PermissionProviderProps,
} from './PermissionContext';

// =============================================================================
// WITH PERMISSION
// =============================================================================

export {
  createUsePermissionGate,
  createWithPermission,
  createWithPermissionHOC,
} from './WithPermission';

export type {
  PermissionAction,
  WithPermissionConfig,
  WithPermissionProps,
  PermissionGateResult,
} from './WithPermission';

// =============================================================================
// SECURE COMPONENTS
// =============================================================================

export { createSecure, useFormDisabledContext } from './Secure';

export type {
  SecureAction,
  SecureConfig,
  SecureContainerProps,
  SecureButtonProps,
  SecureFormProps,
  SecureInputProps,
  SecureDropdownMenuItemProps,
} from './Secure';

// =============================================================================
// AUTH GUARD
// =============================================================================

export { createAuthGuard } from './AuthGuard';

export type { AuthGuardConfig, AuthGuardProps } from './AuthGuard';

// =============================================================================
// AUTH PROVIDER
// =============================================================================

export { createAuthProvider, SimpleAuthProvider } from './AuthProvider';

export type {
  AuthProviderConfig,
  AuthProviderProps,
  SimpleAuthProviderProps,
} from './AuthProvider';

// =============================================================================
// AUTH SKELETONS
// =============================================================================

export { createAuthSkeletons, SimpleAuthSkeletons } from './AuthSkeleton';

export type { AuthSkeletonProps, AuthSkeletonConfig } from './AuthSkeleton';

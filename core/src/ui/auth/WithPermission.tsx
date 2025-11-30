/**
 * WithPermission Component Factory
 *
 * Factory function to create permission-gated components.
 * The factory accepts dependencies (permission check function, user data)
 * and returns components that can be used in the app.
 */

'use client';

import * as React from 'react';
import { type ReactNode } from 'react';
import { usePermissionContext } from './PermissionContext';

// =============================================================================
// TYPES
// =============================================================================

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | string;

export interface WithPermissionConfig {
  /**
   * Function to check if user has a permission
   */
  hasPermission: (permission: string) => boolean;
  /**
   * Function to check if user has all permissions
   */
  hasAllPermissions?: (permissions: string[]) => boolean;
  /**
   * Function to check if user has any permission
   */
  hasAnyPermission?: (permissions: string[]) => boolean;
  /**
   * Function to check if user has a role
   */
  hasRole?: (role: string) => boolean;
  /**
   * Whether the permission system is loading
   */
  isLoading?: boolean;
  /**
   * Full admin permission that grants all access
   */
  adminPermission?: string;
}

export interface WithPermissionProps {
  /** Single permission slug required to show content */
  permission?: string;
  /** Permission action (combined with base permission from context) */
  action?: PermissionAction;
  /** Array of permission slugs - content shown if user has ALL permissions */
  permissions?: string[];
  /** Array of permission slugs - content shown if user has ANY permission */
  anyPermissions?: string[];
  /** Role name(s) required to show content */
  role?: string | string[];
  /** Content to render when user has required permissions */
  children: ReactNode;
  /** Content to render when user lacks permissions (optional) */
  fallback?: ReactNode;
  /** Whether to render nothing (null) instead of fallback when unauthorized */
  hideWhenUnauthorized?: boolean;
  /** Custom permission check function for complex logic */
  customCheck?: () => boolean;
  /** Additional class names for styling */
  className?: string;
  /** Loading component to show while checking */
  loadingComponent?: ReactNode;
  /** Whether to show loading state */
  showLoading?: boolean;
}

export interface PermissionGateResult {
  /** Whether user has access */
  hasAccess: boolean;
  /** Whether permissions are loading */
  isLoading: boolean;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a permission check hook
 *
 * @example
 * const usePermissionGate = createUsePermissionGate({
 *   hasPermission: (perm) => authStore.hasPermission(perm),
 *   hasAllPermissions: (perms) => perms.every(p => authStore.hasPermission(p)),
 *   isLoading: authStore.loading,
 * });
 *
 * // In a component:
 * const { hasAccess, isLoading } = usePermissionGate({ permission: 'workflow:create' });
 */
export function createUsePermissionGate(config: WithPermissionConfig) {
  return function usePermissionGate(
    props: Omit<WithPermissionProps, 'children' | 'fallback' | 'className' | 'loadingComponent' | 'showLoading' | 'hideWhenUnauthorized'>
  ): PermissionGateResult {
    const { basePermission, adminPermission: contextAdminPermission } = usePermissionContext();
    const {
      permission,
      action,
      permissions = [],
      anyPermissions = [],
      role,
      customCheck,
    } = props;

    const {
      hasPermission,
      hasAllPermissions = (perms) => perms.every(hasPermission),
      hasAnyPermission = (perms) => perms.some(hasPermission),
      hasRole = () => false,
      isLoading = false,
      adminPermission = contextAdminPermission,
    } = config;

    // Build the required permission
    const requiredPermission = React.useMemo(() => {
      if (permission) return permission;
      if (action && basePermission) return `${basePermission}:${action}`;
      if (basePermission) return `${basePermission}:read`;
      return '';
    }, [permission, action, basePermission]);

    // Check access
    const hasAccess = React.useMemo(() => {
      // If loading, deny access temporarily
      if (isLoading) return false;

      // Check for admin permission first
      if (adminPermission && hasPermission(adminPermission)) {
        return true;
      }

      // Custom check takes precedence
      if (customCheck) {
        return customCheck();
      }

      // Check single permission
      if (requiredPermission) {
        return hasPermission(requiredPermission);
      }

      // Check multiple permissions (ALL required)
      if (permissions.length > 0) {
        return hasAllPermissions(permissions);
      }

      // Check any permissions (ANY required)
      if (anyPermissions.length > 0) {
        return hasAnyPermission(anyPermissions);
      }

      // Check role(s)
      if (role) {
        const roles = Array.isArray(role) ? role : [role];
        return roles.some(hasRole);
      }

      // Default to true if no criteria specified
      return true;
    }, [
      isLoading,
      adminPermission,
      customCheck,
      requiredPermission,
      permissions,
      anyPermissions,
      role,
      hasPermission,
      hasAllPermissions,
      hasAnyPermission,
      hasRole,
    ]);

    return { hasAccess, isLoading };
  };
}

/**
 * Create a WithPermission component
 *
 * @example
 * const WithPermission = createWithPermission({
 *   hasPermission: (perm) => authStore.hasPermission(perm),
 *   hasAllPermissions: (perms) => perms.every(p => authStore.hasPermission(p)),
 *   isLoading: authStore.loading,
 * });
 *
 * // Usage:
 * <WithPermission permission="workflow:create">
 *   <CreateButton />
 * </WithPermission>
 */
export function createWithPermission(
  config: WithPermissionConfig
): React.FC<WithPermissionProps> {
  const usePermissionGate = createUsePermissionGate(config);

  return function WithPermission({
    children,
    fallback = null,
    hideWhenUnauthorized = false,
    className = '',
    loadingComponent = <div className="animate-pulse">Loading...</div>,
    showLoading = false,
    ...props
  }: WithPermissionProps) {
    const { hasAccess, isLoading } = usePermissionGate(props);

    // Show loading state
    if (isLoading && showLoading) {
      return <div className={className}>{loadingComponent}</div>;
    }

    // User has access
    if (hasAccess) {
      return className ? <div className={className}>{children}</div> : <>{children}</>;
    }

    // User lacks access
    if (hideWhenUnauthorized) {
      return null;
    }

    return fallback ? (
      <div className={className}>{fallback}</div>
    ) : null;
  };
}

/**
 * Create a higher-order component for permission gating
 *
 * @example
 * const withPermission = createWithPermissionHOC(config);
 * const ProtectedPage = withPermission(MyPage, { permission: 'admin:access' });
 */
export function createWithPermissionHOC(config: WithPermissionConfig) {
  const WithPermission = createWithPermission(config);

  return function withPermission<P extends object>(
    Component: React.ComponentType<P>,
    permissionProps: Omit<WithPermissionProps, 'children'>
  ) {
    return function WrappedComponent(props: P) {
      return (
        <WithPermission {...permissionProps}>
          <Component {...props} />
        </WithPermission>
      );
    };
  };
}

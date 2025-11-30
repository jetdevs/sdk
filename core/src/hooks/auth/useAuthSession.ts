/**
 * Auth Session Hook
 *
 * Generic auth session hook that works with the auth store.
 * Applications should wrap this with their specific session provider (e.g., NextAuth).
 */

'use client';

import { useMemo } from 'react';
import type { AuthState, UserProfile, UserRole, PermissionObject } from '../../stores/types';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthSessionData {
  user: UserProfile | null;
  roles: UserRole[];
  permissions: PermissionObject[];
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

export interface UseAuthSessionResult {
  isLoading: boolean;
  isAuthenticated: boolean;
  isUnauthenticated: boolean;
  user: UserProfile | null;
  roles: UserRole[];
  primaryRole: UserRole | null;
  permissions: PermissionObject[];
  session: AuthSessionData | null;
  sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
  hasPermission: (slug: string) => boolean;
  hasAnyPermission: (slugs: string[]) => boolean;
  hasAllPermissions: (slugs: string[]) => boolean;
  hasRole: (roleName: string) => boolean;
  // Alias methods
  checkPermission: (slug: string) => boolean;
  checkMultiplePermissions: (slugs: string[]) => boolean;
  checkAnyPermission: (slugs: string[]) => boolean;
}

// =============================================================================
// HOOK FACTORY
// =============================================================================

/**
 * Create a useAuthSession hook bound to a specific auth state getter
 *
 * @example
 * // Create the hook with your auth store
 * const useAuthSession = createUseAuthSession(() => ({
 *   user: authStore.user,
 *   roles: authStore.roles,
 *   permissions: authStore.permissions,
 *   status: authStore.loading ? 'loading' : authStore.authenticated ? 'authenticated' : 'unauthenticated',
 * }));
 */
export function createUseAuthSession(
  useAuthState: () => AuthSessionData
): () => UseAuthSessionResult {
  return function useAuthSession(): UseAuthSessionResult {
    const sessionData = useAuthState();

    const computedValues = useMemo(() => {
      const { user, roles, permissions, status } = sessionData;

      const isLoading = status === 'loading';
      const isAuthenticated = status === 'authenticated' && !!user;
      const primaryRole = roles[0] || null;

      // Permission checking functions
      const hasPermission = (slug: string): boolean => {
        return permissions.some((p) => p.slug === slug);
      };

      const hasAnyPermission = (slugs: string[]): boolean => {
        return slugs.some((slug) => hasPermission(slug));
      };

      const hasAllPermissions = (slugs: string[]): boolean => {
        return slugs.every((slug) => hasPermission(slug));
      };

      const hasRole = (roleName: string): boolean => {
        return roles.some(
          (role) => role.name.toLowerCase() === roleName.toLowerCase()
        );
      };

      return {
        isLoading,
        isAuthenticated,
        isUnauthenticated: status === 'unauthenticated' || !isAuthenticated,
        user,
        roles,
        primaryRole,
        permissions,
        session: sessionData,
        sessionStatus: status,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        hasRole,
        // Convenience methods (aliases)
        checkPermission: hasPermission,
        checkMultiplePermissions: hasAllPermissions,
        checkAnyPermission: hasAnyPermission,
      };
    }, [sessionData]);

    return computedValues;
  };
}

// =============================================================================
// PERMISSION HOOK
// =============================================================================

/**
 * Create a usePermission hook for checking a single permission
 *
 * @example
 * const usePermission = createUsePermission(useAuthSession);
 *
 * // In a component:
 * const canCreate = usePermission('workflow:create');
 * if (canCreate === null) return <Skeleton />; // Loading
 * if (!canCreate) return null; // No access
 */
export function createUsePermission(
  useAuthSession: () => UseAuthSessionResult
): (slug: string) => boolean | null {
  return function usePermission(slug: string): boolean | null {
    const { hasPermission, isLoading } = useAuthSession();

    // Return null during loading state for skeleton support
    if (isLoading) return null;

    return hasPermission(slug);
  };
}

// =============================================================================
// PERMISSIONS HOOK
// =============================================================================

export interface UsePermissionsResult {
  permissions: Record<string, boolean>;
  hasAll: boolean;
  hasAny: boolean;
  hasNone: boolean;
  userPermissions: PermissionObject[];
}

/**
 * Create a usePermissions hook for checking multiple permissions
 *
 * @example
 * const usePermissions = createUsePermissions(useAuthSession);
 *
 * // In a component:
 * const { hasAll, hasAny, permissions } = usePermissions([
 *   'admin:full_access',
 *   'admin:role_management',
 * ]);
 */
export function createUsePermissions(
  useAuthSession: () => UseAuthSessionResult
): (slugs: string[]) => UsePermissionsResult {
  return function usePermissions(slugs: string[]): UsePermissionsResult {
    const { hasPermission, permissions: userPermissions } = useAuthSession();

    return useMemo(() => {
      const permissions = slugs.reduce(
        (acc, slug) => {
          acc[slug] = hasPermission(slug);
          return acc;
        },
        {} as Record<string, boolean>
      );

      const hasAll = slugs.every((slug) => hasPermission(slug));
      const hasAny = slugs.some((slug) => hasPermission(slug));
      const hasNone = !hasAny;

      return {
        permissions,
        hasAll,
        hasAny,
        hasNone,
        userPermissions,
      };
    }, [slugs, hasPermission, userPermissions]);
  };
}

// =============================================================================
// CURRENT USER HOOK
// =============================================================================

export interface UseCurrentUserResult {
  user: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Create a useCurrentUser hook for getting current user data
 *
 * @example
 * const useCurrentUser = createUseCurrentUser(useAuthSession);
 *
 * // In a component:
 * const { user, role, isLoading } = useCurrentUser();
 */
export function createUseCurrentUser(
  useAuthSession: () => UseAuthSessionResult
): () => UseCurrentUserResult {
  return function useCurrentUser(): UseCurrentUserResult {
    const { user, primaryRole, isLoading, isAuthenticated } = useAuthSession();

    return {
      user,
      role: primaryRole,
      isLoading,
      isAuthenticated,
    };
  };
}

// =============================================================================
// AUTH UTILS
// =============================================================================

/**
 * Utility functions for server-side or imperative access to session data
 */
export const AuthUtils = {
  /**
   * Extract permission slugs from a session
   */
  getPermissionsFromSession: (session: AuthSessionData | null): string[] => {
    if (!session?.permissions) return [];
    return session.permissions.map((p) => p.slug);
  },

  /**
   * Check if session has a specific permission
   */
  sessionHasPermission: (
    session: AuthSessionData | null,
    slug: string
  ): boolean => {
    const permissions = AuthUtils.getPermissionsFromSession(session);
    return permissions.includes(slug);
  },

  /**
   * Check if session has any of the provided permissions
   */
  sessionHasAnyPermission: (
    session: AuthSessionData | null,
    slugs: string[]
  ): boolean => {
    const permissions = AuthUtils.getPermissionsFromSession(session);
    return slugs.some((slug) => permissions.includes(slug));
  },

  /**
   * Check if session has all of the provided permissions
   */
  sessionHasAllPermissions: (
    session: AuthSessionData | null,
    slugs: string[]
  ): boolean => {
    const permissions = AuthUtils.getPermissionsFromSession(session);
    return slugs.every((slug) => permissions.includes(slug));
  },

  /**
   * Check if session has a specific role
   */
  sessionHasRole: (session: AuthSessionData | null, roleName: string): boolean => {
    if (!session?.roles) return false;
    return session.roles.some(
      (role) => role.name.toLowerCase() === roleName.toLowerCase()
    );
  },
};

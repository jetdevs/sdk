/**
 * Auth Store
 *
 * Zustand store for authentication state management.
 * This is a generic implementation that can be extended by apps.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  AuthState,
  AuthActions,
  AuthStore,
  UserProfile,
  UserRole,
  PermissionObject,
  SessionInfo,
} from './types';

// =============================================================================
// STORE FACTORY
// =============================================================================

/**
 * Create an auth store with optional configuration
 */
export function createAuthStore(options?: {
  name?: string;
  onLogout?: () => void;
}) {
  const { name = 'auth-store', onLogout } = options ?? {};

  return create<AuthStore>()(
    devtools(
      (set, get) => ({
        // Initial state
        authenticated: false,
        loading: true,
        signingOut: false,
        user: null,
        role: null,
        permissions: [],

        // Actions
        setAuthState: (newState) => {
          set((state) => ({ ...state, ...newState }), false, 'setAuthState');
        },

        logout: () => {
          // Call custom logout handler if provided
          onLogout?.();

          set(
            () => ({
              authenticated: false,
              loading: false,
              signingOut: false,
              user: null,
              role: null,
              permissions: [],
            }),
            false,
            'logout'
          );
        },

        hasPermission: (permission: string) => {
          const { permissions } = get();
          return permissions.some((p) => p.slug === permission);
        },

        hasAnyPermission: (permissions: string[]) => {
          const { hasPermission } = get();
          return permissions.some((permission) => hasPermission(permission));
        },

        hasRole: (roleName: string) => {
          const { role } = get();
          return role?.name.toLowerCase() === roleName.toLowerCase();
        },

        updatePermissions: (newPermissions: string[], sessionInfo?: SessionInfo) => {
          // Skip if signing out
          if (get().signingOut) {
            return;
          }

          // Check session validity if info provided
          if (sessionInfo && !sessionInfo.shouldMaintainSession) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Session should not be maintained:', sessionInfo);
            }
            return;
          }

          // Convert permission strings to Permission objects
          const permissions: PermissionObject[] = newPermissions.map((permissionSlug, index) => ({
            id: `realtime-${index}`,
            slug: permissionSlug,
            name: permissionSlug
              .replace(/[_:]/g, ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase()),
            category: permissionSlug.split(':')[0] || 'general',
          }));

          set((state) => ({ ...state, permissions }), false, 'updatePermissions');

          if (process.env.NODE_ENV === 'development') {
            console.log('Permissions updated:', {
              count: permissions.length,
              sample: newPermissions.slice(0, 5),
            });
          }
        },
      }),
      { name }
    )
  );
}

// =============================================================================
// DEFAULT STORE INSTANCE
// =============================================================================

/**
 * Default auth store instance
 */
export const useAuthStore = createAuthStore();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => useAuthStore.getState().authenticated;

/**
 * Check if user is signing out
 */
export const isSigningOut = () => useAuthStore.getState().signingOut;

/**
 * Check if user has a specific permission
 */
export const hasPermission = (slug: string) => useAuthStore.getState().hasPermission(slug);

/**
 * Get all user permissions as slugs
 */
export const getUserPermissions = () => useAuthStore.getState().permissions.map((p) => p.slug);

/**
 * Get current user profile
 */
export const getCurrentUser = () => useAuthStore.getState().user;

/**
 * Get current user role
 */
export const getCurrentRole = () => useAuthStore.getState().role;

// =============================================================================
// TYPES RE-EXPORT
// =============================================================================

export type {
  AuthState,
  AuthActions,
  AuthStore,
  UserProfile,
  UserRole,
  PermissionObject,
  SessionInfo,
};

/**
 * Permission Store
 *
 * Zustand store for client-side permission caching.
 * Provides fast, reactive permission checking without network requests.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { PermissionState, PermissionActions, PermissionStore, UserRole } from './types';

// =============================================================================
// STORE FACTORY
// =============================================================================

/**
 * Create a permission store with optional configuration
 */
export function createPermissionStore(options?: {
  name?: string;
  cacheTimeout?: number;
  storage?: 'session' | 'local';
}): UseBoundStore<StoreApi<PermissionStore>> {
  const {
    name = 'permission-cache',
    cacheTimeout = 5 * 60 * 1000, // 5 minutes default
    storage = 'session',
  } = options ?? {};

  const storageProvider =
    typeof window !== 'undefined'
      ? storage === 'session'
        ? sessionStorage
        : localStorage
      : undefined;

  return create<PermissionStore>()(
    persist(
      immer((set, get) => ({
        // Initial state
        permissions: [],
        roles: [],
        lastFetched: null,
        isLoading: false,
        error: null,
        cacheTimeout,

        // Actions
        setPermissions: (permissions) =>
          set((state) => {
            state.permissions = permissions;
            state.error = null;
          }),

        setRoles: (roles) =>
          set((state) => {
            state.roles = roles;
            state.error = null;
          }),

        setLoading: (isLoading) =>
          set((state) => {
            state.isLoading = isLoading;
          }),

        setError: (error) =>
          set((state) => {
            state.error = error;
            state.isLoading = false;
          }),

        hasPermission: (permission) => {
          const state = get();
          return state.permissions.includes(permission);
        },

        hasAnyPermission: (permissions) => {
          const state = get();
          return permissions.some((p) => state.permissions.includes(p));
        },

        hasAllPermissions: (permissions) => {
          const state = get();
          return permissions.every((p) => state.permissions.includes(p));
        },

        invalidateCache: () =>
          set((state) => {
            state.lastFetched = null;
            state.permissions = [];
            state.roles = [];
            state.error = null;
            state.isLoading = false;
          }),

        shouldRefetch: () => {
          const state = get();
          // Always refetch if we have no data
          if (!state.lastFetched || state.permissions.length === 0) return true;
          // Check if cache has expired
          return Date.now() - state.lastFetched > state.cacheTimeout;
        },

        updateFromServer: (data) =>
          set((state) => {
            state.permissions = data.permissions;
            state.roles = data.roles;
            state.lastFetched = Date.now();
            state.isLoading = false;
            state.error = null;
          }),
      })),
      {
        name,
        storage: storageProvider ? createJSONStorage(() => storageProvider) : undefined,
        partialize: (state) => ({
          permissions: state.permissions,
          roles: state.roles,
          lastFetched: state.lastFetched,
        }),
      }
    )
  );
}

// =============================================================================
// DEFAULT STORE INSTANCE
// =============================================================================

/**
 * Default permission store instance using sessionStorage
 */
export const usePermissionStore: UseBoundStore<StoreApi<PermissionStore>> = createPermissionStore();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Update the cached org ID for permission cache invalidation
 */
export function updatePermissionCacheOrg(orgId: number | string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('permission-cache-org', String(orgId));
    sessionStorage.setItem('current-org-id', String(orgId));
  }
}

/**
 * Clear all permission data (for logout)
 */
export function clearPermissionCache() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('permission-cache');
    sessionStorage.removeItem('permission-cache-org');
    sessionStorage.removeItem('current-org-id');
  }
  usePermissionStore.getState().invalidateCache();
}

/**
 * Get current permissions as array
 */
export function getPermissions(): string[] {
  return usePermissionStore.getState().permissions;
}

/**
 * Get current roles
 */
export function getRoles(): UserRole[] {
  return usePermissionStore.getState().roles;
}

/**
 * Check if a permission exists
 */
export function checkPermission(permission: string): boolean {
  return usePermissionStore.getState().hasPermission(permission);
}

/**
 * Check if any of the permissions exist
 */
export function checkAnyPermission(permissions: string[]): boolean {
  return usePermissionStore.getState().hasAnyPermission(permissions);
}

/**
 * Check if all permissions exist
 */
export function checkAllPermissions(permissions: string[]): boolean {
  return usePermissionStore.getState().hasAllPermissions(permissions);
}

// =============================================================================
// TYPES RE-EXPORT
// =============================================================================

export type { PermissionState, PermissionActions, PermissionStore, UserRole };

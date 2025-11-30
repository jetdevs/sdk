/**
 * Store Types
 *
 * Type definitions for state management stores.
 */

// =============================================================================
// USER & AUTH TYPES
// =============================================================================

/**
 * User profile information
 */
export interface UserProfile {
  id: string | number;
  email: string;
  name?: string;
  image?: string;
  orgId?: number | string;
}

/**
 * User role with metadata
 */
export interface UserRole {
  id: string | number;
  name: string;
  description?: string | null;
  orgId?: number | null;
  isSystemRole?: boolean;
  isGlobalRole?: boolean;
}

/**
 * Permission object with metadata
 */
export interface PermissionObject {
  id: string;
  slug: string;
  name: string;
  category: string;
}

// =============================================================================
// AUTH STORE TYPES
// =============================================================================

/**
 * Auth store state
 */
export interface AuthState {
  authenticated: boolean;
  loading: boolean;
  signingOut: boolean;
  user: UserProfile | null;
  role: UserRole | null;
  permissions: PermissionObject[];
}

/**
 * Auth store actions
 */
export interface AuthActions {
  setAuthState: (state: Partial<AuthState>) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasRole: (roleName: string) => boolean;
  updatePermissions: (newPermissions: string[], sessionInfo?: SessionInfo) => void;
}

/**
 * Session info from real-time updates
 */
export interface SessionInfo {
  isUserActive: boolean;
  orgAccess: boolean;
  activeOrganizations: number[];
  shouldMaintainSession: boolean;
}

/**
 * Full auth store type
 */
export type AuthStore = AuthState & AuthActions;

// =============================================================================
// PERMISSION STORE TYPES
// =============================================================================

/**
 * Permission store state
 */
export interface PermissionState {
  permissions: string[];
  roles: UserRole[];
  lastFetched: number | null;
  isLoading: boolean;
  error: string | null;
  cacheTimeout: number;
}

/**
 * Permission store actions
 */
export interface PermissionActions {
  setPermissions: (permissions: string[]) => void;
  setRoles: (roles: UserRole[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  invalidateCache: () => void;
  shouldRefetch: () => boolean;
  updateFromServer: (data: { permissions: string[]; roles: UserRole[] }) => void;
}

/**
 * Full permission store type
 */
export type PermissionStore = PermissionState & PermissionActions;

// =============================================================================
// UI STORE TYPES
// =============================================================================

/**
 * UI store state
 */
export interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
}

/**
 * UI store actions
 */
export interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

/**
 * Full UI store type
 */
export type UIStore = UIState & UIActions;

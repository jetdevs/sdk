/**
 * State Stores Module
 *
 * Zustand stores for client-side state management.
 */

// =============================================================================
// AUTH STORE
// =============================================================================

export {
  createAuthStore,
  useAuthStore,
  isAuthenticated,
  isSigningOut,
  hasPermission,
  getUserPermissions,
  getCurrentUser,
  getCurrentRole,
} from './auth.store';

export type {
  AuthState,
  AuthActions,
  AuthStore,
  UserProfile,
  UserRole,
  PermissionObject,
  SessionInfo,
} from './auth.store';

// =============================================================================
// PERMISSION STORE
// =============================================================================

export {
  createPermissionStore,
  usePermissionStore,
  updatePermissionCacheOrg,
  clearPermissionCache,
  getPermissions,
  getRoles,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
} from './permission.store';

export type {
  PermissionState,
  PermissionActions,
  PermissionStore,
} from './permission.store';

// =============================================================================
// UI STORE
// =============================================================================

export {
  createUIStore,
  useUIStore,
  isSidebarOpen,
  getTheme,
  toggleSidebar,
  setTheme,
} from './ui.store';

export type {
  UIState,
  UIActions,
  UIStore,
} from './ui.store';

// =============================================================================
// THEME STORE
// =============================================================================

export {
  createThemeStore,
  useThemeStore,
  getThemePreference,
  setThemePreference,
} from './theme.store';

export type { ThemeState, ThemeActions, ThemeStore } from './theme.store';

// =============================================================================
// ORG SWITCH STORE
// =============================================================================

export {
  createOrgSwitchStore,
  useOrgSwitchStore,
  isOrgSwitching,
  getTargetOrgName,
  startOrgSwitch,
  endOrgSwitch,
} from './org-switch.store';

export type {
  OrgSwitchState,
  OrgSwitchActions,
  OrgSwitchStore,
} from './org-switch.store';

// =============================================================================
// TYPES
// =============================================================================

export type * from './types';

/**
 * @yobo/core
 *
 * Core SaaS platform package providing:
 * - Multi-tenant database schema
 * - Permission system with RBAC
 * - Row-Level Security (RLS) management
 * - tRPC router infrastructure
 * - Extension system
 *
 * @example
 * ```ts
 * import { defineSaasConfig, corePermissions, createDbClient } from '@yobo/core';
 *
 * const config = defineSaasConfig({
 *   app: { name: 'My App' },
 *   auth: { providers: ['credentials'] },
 *   database: { url: process.env.DATABASE_URL! },
 *   extensions: [],
 * });
 * ```
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  defineSaasConfig,
  defineExtension,
  loadExtensions,
  runExtensionHooks,
  runExtensionSeeds,
} from './config';

export type {
  SaasConfig,
  Extension,
  AuthConfig,
  DatabaseConfig,
  UIConfig,
  FeaturesConfig,
  LoadedExtensions,
} from './config';

// =============================================================================
// DATABASE
// =============================================================================

export {
  createDbClient,
  createExtendedDbClient,
  createRawClient,
} from './db';

export type {
  DbConfig,
  DbClient,
} from './db';

export * as schema from './db/schema';

// =============================================================================
// PERMISSIONS
// =============================================================================

export {
  corePermissions,
  mergePermissions,
  mergePermissionsWithResult,
  validatePermissionNamespacing,
  getAllPermissions,
  getPermissionsByCategory,
  getPermissionsByModule,
  getPermissionBySlug,
  isValidPermissionSlug,
  getAllPermissionSlugs,
  getCriticalPermissions,
  getOrgRequiredPermissions,
  getRegistrySummary,
} from './modules/permissions';

export type {
  PermissionCategory,
  PermissionDefinition,
  PermissionModule,
  PermissionRegistry,
  PermissionSlug,
  MergeOptions,
  MergeResult,
} from './modules/permissions';

// =============================================================================
// RLS (Row-Level Security)
// =============================================================================

export {
  coreRlsTables,
  createRlsRegistry,
  mergeRlsRegistries,
  getAllTableNames,
  getTablesByIsolation,
  getOrgIsolatedTables,
  getPublicTables,
  getTablesWithRLS,
  getTablesWithOrgId,
  getTablesWithWorkspaceId,
  validateTableConfig,
  validateRegistry,
  getRegistryStats,
  setRlsContext,
  clearRlsContext,
  withRlsContext,
  hasRlsContext,
  getRlsContext,
  RLS_ORG_VAR,
  RLS_USER_VAR,
} from './rls';

export type {
  RlsIsolation,
  RlsPolicy,
  RlsTableConfig,
  RlsRegistry,
  TableValidationResult,
  RlsRegistryStats,
} from './rls';

// =============================================================================
// tRPC
// =============================================================================

// NOTE: tRPC server utilities (router, middleware, procedures, createRouterWithActor, etc.)
// are NOT exported from the main entry point to prevent them from being bundled
// into client-side code. Import them from '@yobolabs/core/trpc' instead.
//
// For example:
//   import { router, createRouterWithActor } from '@yobolabs/core/trpc';
//
// Only context utilities and types that don't pull in @trpc/server are exported here.

// Re-export only types (these don't pull in runtime code)
export type {
  Actor,
  Session,
  TRPCContext,
  AuthenticatedContext,
  CreateContextOptions,
  RouterProcedureConfig,
  ExtensionRouter,
} from './trpc';

// =============================================================================
// AUTH
// =============================================================================

export {
  createAuthConfig,
  tokenBlacklist,
  getTokenId,
  blacklistToken,
  blacklistUserTokens,
  isTokenValid,
  BLACKLIST_REASONS,
} from './modules/auth';

export type {
  AuthConfig as CoreAuthConfig,
  BlacklistReason,
  JWTTokenLike,
} from './modules/auth';

// =============================================================================
// UTILITIES
// =============================================================================

export {
  cn,
  generateId,
  sleep,
  logger,
  // Formatters
  formatDate,
  formatISODate,
  formatLocalDate,
  formatLocalDateTime,
  formatRelativeTime,
  formatNumber,
  formatCurrency,
  formatPercent,
  formatBytes,
  truncate,
  toTitleCase,
  slugToTitle,
  toKebabCase,
  toCamelCase,
  pluralize,
  // ID Generation
  generateUniqueId,
  generatePrefixedId,
  generateShortId,
  generateNanoId,
  // Country Codes
  countryCodes,
  getCountryByCode,
  getCountryByISO,
  getDefaultCountry,
  formatPhoneWithCountry,
  parsePhoneNumber,
  // Theme Manager
  getStoredTheme,
  setStoredTheme,
  applyTheme,
  initializeTheme,
  getThemePreloadScript,
} from './lib';

export type { CountryCode } from './lib';

// =============================================================================
// STORES (Re-export from stores module)
// =============================================================================

export {
  // Auth Store
  createAuthStore,
  useAuthStore,
  isAuthenticated as isAuthStoreAuthenticated,
  isSigningOut,
  hasPermission as authStoreHasPermission,
  getUserPermissions,
  getCurrentUser,
  getCurrentRole,
  // Permission Store
  createPermissionStore,
  usePermissionStore,
  updatePermissionCacheOrg,
  clearPermissionCache,
  getPermissions,
  getRoles,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  // UI Store
  createUIStore,
  useUIStore,
  isSidebarOpen,
  getTheme,
  toggleSidebar,
  setTheme,
  // Theme Store
  createThemeStore,
  useThemeStore,
  getThemePreference,
  setThemePreference,
} from './stores';

export type {
  AuthState,
  AuthActions,
  AuthStore,
  UserProfile,
  UserRole,
  PermissionObject,
  SessionInfo,
  PermissionState,
  PermissionActions,
  PermissionStore,
  UIState,
  UIActions,
  UIStore,
  ThemeState,
  ThemeActions,
  ThemeStore,
} from './stores';

// =============================================================================
// HOOKS (Re-export from hooks module)
// =============================================================================

export {
  // Auth hook factories
  createUseAuthSession,
  createUsePermission,
  createUsePermissions,
  createUseCurrentUser,
  createUsePermissionCheck,
  createUsePermissionConnectionStatus,
  usePermissionSSE,
  AuthUtils,
  // Utility hooks
  useIsClient,
  useModalState,
  // Table hooks
  useTable,
  useTableSelection,
  useTableFilter,
  useTableSearch,
  useTableVisibility,
  useTableExport,
  useTableSort,
  useTableState,
} from './hooks';

export type {
  AuthSessionData,
  UseAuthSessionResult,
  UsePermissionsResult,
  UseCurrentUserResult,
  PermissionCheckOptions,
  SSEPermissionMessage,
  UsePermissionCheckResult,
  ModalState,
  UseModalStateReturn,
  SortingState,
  UseTableProps,
  UseTableReturn,
  UseTableSelectionProps,
  UseTableSelectionReturn,
  UseTableFilterProps,
  UseTableFilterReturn,
  UseTableSearchProps,
  UseTableSearchReturn,
  UseTableVisibilityProps,
  UseTableVisibilityReturn,
  UseTableExportProps,
  UseTableExportReturn,
  SortDirection,
  SortConfig,
  UseTableSortProps,
  UseTableSortReturn,
  UseTableStateProps,
  UseTableStateReturn,
} from './hooks';

// =============================================================================
// PROVIDERS (Re-export from providers module)
// =============================================================================

export {
  // Theme Providers
  ThemeProvider,
  useTheme,
  UserThemeProvider,
  useUserTheme,
  // tRPC Provider Factory
  createTRPCProvider,
  createTRPCQueryClient,
  getBaseUrl,
  getTRPCUrl,
} from './providers';

export type {
  ThemeMode,
  ThemeContextValue,
  ThemeProviderProps,
  UserThemeProviderProps,
  TRPCProviderConfig,
  QueryClientConfig,
  TRPCProviderProps,
} from './providers';

// =============================================================================
// UI COMPONENTS (Re-export from ui module)
// =============================================================================

export {
  // Permission Context
  PermissionContext,
  PermissionProvider,
  usePermissionContext,
  // WithPermission factories
  createUsePermissionGate,
  createWithPermission,
  createWithPermissionHOC,
  // Secure component factory
  createSecure,
  useFormDisabledContext,
  // Theme components
  ThemeToggle,
  ThemeToggleThreeState,
  // Admin page factories
  createThemeManagementPage,
  createPermissionManagementPage,
  // Role dialog factories
  createDeleteRoleDialogFactory,
  createBulkDeleteDialogFactory,
  createCreateRoleDialogFactory,
} from './ui';

export type {
  PermissionContextValue,
  PermissionProviderProps,
  PermissionAction,
  WithPermissionConfig,
  WithPermissionProps,
  PermissionGateResult,
  SecureAction,
  SecureConfig,
  SecureContainerProps,
  SecureButtonProps,
  SecureFormProps,
  SecureInputProps,
  SecureDropdownMenuItemProps,
  ThemeToggleProps,
  // Theme Management admin page types
  Theme,
  ThemeFormData,
  ThemeApi,
  ThemeManagementUIComponents,
  ThemeManagementPageProps,
  ThemeManagementPageFactoryConfig,
  // Permission Management admin page types
  Permission,
  PermissionRoleRef,
  CategoryCount,
  PermissionStats,
  PermissionApi,
  PermissionManagementUIComponents,
  PermissionManagementPageProps,
  PermissionManagementPageFactoryConfig,
  // Role dialog types
  RoleWithStats,
  ToastInterface,
  DeleteRoleDialogUIComponents,
  DeleteRoleDialogApi,
  DeleteRoleDialogFactoryConfig,
  DeleteRoleDialogProps,
  BulkDeleteDialogUIComponents,
  BulkDeleteDialogFactoryConfig,
  BulkDeleteDialogProps,
  CreateRoleDialogUIComponents,
  CreateRoleDialogApi,
  CreateRoleDialogFactoryConfig,
  CreateRoleDialogProps,
} from './ui';

// =============================================================================
// DATABASE CLIENT FACTORY
// =============================================================================

export {
  createDbClients,
  createDbClientsFromEnv,
} from './db';

export type {
  PoolConfig,
  DbClientFactoryConfig,
  DbClients,
} from './db';

// =============================================================================
// CLI (exported separately via @yobo/core/cli)
// =============================================================================

// CLI utilities are available via '@yobo/core/cli' import path
// See packages/core/src/cli/index.ts for available exports

// =============================================================================
// USER-ORG MODULE (exported separately via @yobo/core/user-org)
// =============================================================================

// User-organization relationship management is available via '@yobo/core/user-org'
// See packages/core/src/user-org/index.ts for available exports
//
// Key exports:
// - createUserOrgRepository: Factory for creating user-org repositories
// - createUserOrgRouterConfig: Router configuration for createRouterWithActor
// - Types: UserOrgContext, UserOrgMembership, RoleAssignmentData, etc.
// - Schemas: switchOrgSchema, assignRoleSchema, etc.

// =============================================================================
// SECURITY MIDDLEWARE (exported separately via @yobo/core/middleware)
// =============================================================================

// Security middleware factories are available via '@yobo/core/middleware'
// See packages/core/src/middleware/index.ts for available exports
//
// Key exports:
// - createSecurityMiddleware: Low-level middleware factory
// - createNextSecurityMiddleware: Next.js middleware wrapper
// - defaultMiddlewareConfig: Default Next.js middleware config

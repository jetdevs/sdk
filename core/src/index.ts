/**
 * @jetdevs/core
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
 * import { defineSaasConfig, corePermissions, createDbClient } from '@jetdevs/core';
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
    defineExtension, defineSaasConfig, loadExtensions,
    runExtensionHooks,
    runExtensionSeeds
} from './config';

export type {
    AuthConfig,
    DatabaseConfig, Extension, FeaturesConfig,
    LoadedExtensions, SaasConfig, UIConfig
} from './config';

// =============================================================================
// DATABASE
// =============================================================================

export {
    createDbClient,
    createExtendedDbClient,
    createRawClient
} from './db';

export type {
    DbClient, DbConfig
} from './db';

export * as schema from './db/schema';

// =============================================================================
// PERMISSIONS
// =============================================================================

export {
    corePermissions, getAllPermissionSlugs, getAllPermissions, getCriticalPermissions,
    getOrgRequiredPermissions, getPermissionBySlug, getPermissionsByCategory,
    getPermissionsByModule, getRegistrySummary, isValidPermissionSlug, mergePermissions,
    mergePermissionsWithResult,
    validatePermissionNamespacing
} from './modules/permissions';

export type {
    MergeOptions,
    MergeResult, PermissionCategory,
    PermissionDefinition,
    PermissionModule,
    PermissionRegistry,
    PermissionSlug
} from './modules/permissions';

// =============================================================================
// RLS (Row-Level Security)
// =============================================================================

export {
    RLS_ORG_VAR,
    RLS_USER_VAR, clearRlsContext, coreRlsTables,
    createRlsRegistry, getAllTableNames, getOrgIsolatedTables,
    getPublicTables, getRegistryStats, getRlsContext, getTablesByIsolation, getTablesWithOrgId, getTablesWithRLS, getTablesWithWorkspaceId, hasRlsContext, mergeRlsRegistries, setRlsContext, validateRegistry, validateTableConfig, withRlsContext
} from './rls';

export type {
    RlsIsolation,
    RlsPolicy, RlsRegistry, RlsRegistryStats, RlsTableConfig, TableValidationResult
} from './rls';

// =============================================================================
// tRPC
// =============================================================================

// NOTE: tRPC server utilities (router, middleware, procedures, createRouterWithActor, etc.)
// are NOT exported from the main entry point to prevent them from being bundled
// into client-side code. Import them from '@jetdevs/core/trpc' instead.
//
// For example:
//   import { router, createRouterWithActor } from '@jetdevs/core/trpc';
//
// Only context utilities and types that don't pull in @trpc/server are exported here.

// Re-export only types (these don't pull in runtime code)
export type {
    Actor, AuthenticatedContext,
    CreateContextOptions, ExtensionRouter, RouterProcedureConfig, Session,
    TRPCContext
} from './trpc';

// =============================================================================
// AUTH
// =============================================================================

export {
    BLACKLIST_REASONS, blacklistToken,
    blacklistUserTokens, createAuthConfig, getTokenId, isTokenValid, tokenBlacklist
} from './modules/auth';

export type {
    BlacklistReason, AuthConfig as CoreAuthConfig, JWTTokenLike
} from './modules/auth';

// =============================================================================
// UTILITIES
// =============================================================================

export {
    applyTheme, cn,
    // Country Codes
    countryCodes, formatBytes, formatCurrency,
    // Formatters
    formatDate,
    formatISODate,
    formatLocalDate,
    formatLocalDateTime, formatNumber, formatPercent, formatPhoneWithCountry, formatRelativeTime, generateId, generateNanoId, generatePrefixedId,
    generateShortId,
    // ID Generation
    generateUniqueId, getCountryByCode,
    getCountryByISO,
    getDefaultCountry,
    // Theme Manager
    getStoredTheme, getThemePreloadScript, initializeTheme, logger, parsePhoneNumber, pluralize, setStoredTheme, sleep, slugToTitle, toCamelCase, toKebabCase, toTitleCase, truncate
} from './lib';

export type { CountryCode } from './lib';

// =============================================================================
// STORES (Re-export from stores module)
// =============================================================================

export {
    hasPermission as authStoreHasPermission, checkAllPermissions, checkAnyPermission, checkPermission, clearPermissionCache,
    // Auth Store
    createAuthStore,
    // Permission Store
    createPermissionStore,
    // Theme Store
    createThemeStore,
    // UI Store
    createUIStore, getCurrentRole, getCurrentUser, getPermissions,
    getRoles, getTheme, getThemePreference, getUserPermissions, isAuthenticated as isAuthStoreAuthenticated, isSidebarOpen, isSigningOut, setTheme, setThemePreference, toggleSidebar, updatePermissionCacheOrg, useAuthStore, usePermissionStore, useThemeStore, useUIStore
} from './stores';

export type {
    AuthActions, AuthState, AuthStore, PermissionActions, PermissionObject, PermissionState, PermissionStore, SessionInfo, ThemeActions, ThemeState, ThemeStore, UIActions, UIState, UIStore, UserProfile,
    UserRole
} from './stores';

// =============================================================================
// HOOKS (Re-export from hooks module)
// =============================================================================

export {
    AuthUtils,
    // Auth hook factories
    createUseAuthSession, createUseCurrentUser, createUsePermission, createUsePermissionCheck,
    createUsePermissionConnectionStatus, createUsePermissions,
    // Utility hooks
    useIsClient,
    useModalState, usePermissionSSE,
    // Table hooks
    useTable, useTableExport, useTableFilter,
    useTableSearch, useTableSelection, useTableSort,
    useTableState, useTableVisibility
} from './hooks';

export type {
    AuthSessionData, ModalState, PermissionCheckOptions,
    SSEPermissionMessage, SortConfig, SortDirection, SortingState, UseAuthSessionResult, UseCurrentUserResult, UseModalStateReturn, UsePermissionCheckResult, UsePermissionsResult, UseTableExportProps,
    UseTableExportReturn, UseTableFilterProps,
    UseTableFilterReturn, UseTableProps,
    UseTableReturn, UseTableSearchProps,
    UseTableSearchReturn, UseTableSelectionProps,
    UseTableSelectionReturn, UseTableSortProps,
    UseTableSortReturn,
    UseTableStateProps,
    UseTableStateReturn, UseTableVisibilityProps,
    UseTableVisibilityReturn
} from './hooks';

// =============================================================================
// PROVIDERS (Re-export from providers module)
// =============================================================================

export {
    // Theme Providers
    ThemeProvider, UserThemeProvider,
    // tRPC Provider Factory
    createTRPCProvider,
    createTRPCQueryClient,
    getBaseUrl,
    getTRPCUrl, useTheme, useUserTheme
} from './providers';

export type {
    QueryClientConfig, TRPCProviderConfig, TRPCProviderProps, ThemeContextValue, ThemeMode, ThemeProviderProps,
    UserThemeProviderProps
} from './providers';

// =============================================================================
// UI COMPONENTS (Re-export from ui module)
// =============================================================================

export {
    // Permission Context
    PermissionContext,
    PermissionProvider,
    // Theme components
    ThemeToggle,
    ThemeToggleThreeState, createBulkDeleteDialogFactory,
    createCreateRoleDialogFactory,
    // Role dialog factories
    createDeleteRoleDialogFactory, createPermissionManagementPage,
    // Secure component factory
    createSecure,
    // Admin page factories
    createThemeManagementPage,
    // WithPermission factories
    createUsePermissionGate,
    createWithPermission,
    createWithPermissionHOC, useFormDisabledContext, usePermissionContext
} from './ui';

export type {
    BulkDeleteDialogFactoryConfig,
    BulkDeleteDialogProps, BulkDeleteDialogUIComponents, CategoryCount, CreateRoleDialogApi,
    CreateRoleDialogFactoryConfig,
    CreateRoleDialogProps, CreateRoleDialogUIComponents, DeleteRoleDialogApi,
    DeleteRoleDialogFactoryConfig,
    DeleteRoleDialogProps, DeleteRoleDialogUIComponents,
    // Permission Management admin page types
    Permission, PermissionAction, PermissionApi, PermissionContextValue, PermissionGateResult, PermissionManagementPageFactoryConfig, PermissionManagementPageProps, PermissionManagementUIComponents, PermissionProviderProps, PermissionRoleRef, PermissionStats,
    // Role dialog types
    RoleWithStats, SecureAction, SecureButtonProps, SecureConfig,
    SecureContainerProps, SecureDropdownMenuItemProps, SecureFormProps,
    SecureInputProps,
    // Theme Management admin page types
    Theme, ThemeApi, ThemeFormData, ThemeManagementPageFactoryConfig, ThemeManagementPageProps, ThemeManagementUIComponents, ThemeToggleProps, ToastInterface, WithPermissionConfig,
    WithPermissionProps
} from './ui';

// =============================================================================
// DATABASE CLIENT FACTORY
// =============================================================================

export {
    createDbClients,
    createDbClientsFromEnv
} from './db';

export type {
    DbClientFactoryConfig,
    DbClients, PoolConfig
} from './db';

// =============================================================================
// CLI (exported separately via @jetdevs/core/cli)
// =============================================================================

// CLI utilities are available via '@jetdevs/core/cli' import path
// See packages/core/src/cli/index.ts for available exports

// =============================================================================
// USER-ORG MODULE (exported separately via @jetdevs/core/user-org)
// =============================================================================

// User-organization relationship management is available via '@jetdevs/core/user-org'
// See packages/core/src/user-org/index.ts for available exports
//
// Key exports:
// - createUserOrgRepository: Factory for creating user-org repositories
// - createUserOrgRouterConfig: Router configuration for createRouterWithActor
// - Types: UserOrgContext, UserOrgMembership, RoleAssignmentData, etc.
// - Schemas: switchOrgSchema, assignRoleSchema, etc.

// =============================================================================
// SECURITY MIDDLEWARE (exported separately via @jetdevs/core/middleware)
// =============================================================================

// Security middleware factories are available via '@jetdevs/core/middleware'
// See packages/core/src/middleware/index.ts for available exports
//
// Key exports:
// - createSecurityMiddleware: Low-level middleware factory
// - createNextSecurityMiddleware: Next.js middleware wrapper
// - defaultMiddlewareConfig: Default Next.js middleware config

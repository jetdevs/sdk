/**
 * UI Components Module
 *
 * This module provides factory functions to create UI components with injected
 * dependencies. Apps provide their own Shadcn or custom UI components.
 *
 * IMPORTANT: Shadcn primitives are no longer included in the core package.
 * Apps should install and configure Shadcn UI directly, then inject the
 * components into the factory functions.
 */

// =============================================================================
// AUTH COMPONENTS
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
  // AuthGuard factory
  createAuthGuard,
  // AuthProvider factory
  createAuthProvider,
  SimpleAuthProvider,
  // AuthSkeleton factory
  createAuthSkeletons,
  SimpleAuthSkeletons,
} from './auth';

export type {
  // Permission Context types
  PermissionContextValue,
  PermissionProviderProps,
  // WithPermission types
  PermissionAction,
  WithPermissionConfig,
  WithPermissionProps,
  PermissionGateResult,
  // Secure component types
  SecureAction,
  SecureConfig,
  SecureContainerProps,
  SecureButtonProps,
  SecureFormProps,
  SecureInputProps,
  SecureDropdownMenuItemProps,
  // AuthGuard types
  AuthGuardConfig,
  AuthGuardProps,
  // AuthProvider types
  AuthProviderConfig,
  AuthProviderProps,
  SimpleAuthProviderProps,
  // AuthSkeleton types
  AuthSkeletonProps,
  AuthSkeletonConfig,
} from './auth';

// =============================================================================
// UI PRIMITIVES - DEPRECATED
// =============================================================================

// NOTE: Shadcn primitives have been removed from core.
// Apps should install Shadcn UI directly and inject components into factories.
// The primitives module is now empty.

// =============================================================================
// DATA TABLE COMPONENTS - FACTORY PATTERN
// =============================================================================

export {
  // Factory functions
  createBaseListTable,
  createDataTableColumnHeader,
  createDataTablePagination,
  createDataTableWithToolbar,
} from './data-table';

export type {
  // UI component interfaces for dependency injection
  DataTableUIComponents,
  ColumnHeaderUIComponents,
  PaginationUIComponents,
  DataTableWithToolbarUIComponents,
  // Props interfaces
  StatusOption,
  ListToolbarProps,
  PaginationConfig,
  BaseListTableProps,
  DataTableColumnHeaderProps,
  DataTablePaginationProps,
  // DataTableWithToolbar types
  FilterColumnConfig,
  BulkAction,
  DataTableWithToolbarConfig,
  DataTableWithToolbarProps,
  DataTableWithToolbarFactoryConfig,
} from './data-table';

// =============================================================================
// LAYOUT COMPONENTS - FACTORY PATTERN
// =============================================================================

export { createAppSkeleton } from './layout';

export type { LayoutUIComponents } from './layout';

// =============================================================================
// FEEDBACK COMPONENTS
// =============================================================================

export {
  // Empty state - no factory needed (pure component)
  EmptyState,
  // Error display - factory and simple versions
  createErrorDisplay,
  SimpleErrorDisplay,
  // Circular progress - no factory needed (pure component)
  CircularProgress,
  // Color variants
  CIRCULAR_PROGRESS_COLOR_VARIANTS,
} from './feedback';

export type {
  EmptyStateProps,
  ErrorDisplayUIComponents,
  ErrorDisplayProps,
  CircularProgressProps,
  CircularProgressColor,
} from './feedback';

// =============================================================================
// DISPLAY COMPONENTS
// =============================================================================

export {
  // Metadata grid - no factory needed (pure component)
  MetadataGrid,
  // Breadcrumbs - factory and simple versions
  createBreadcrumbs,
  SimpleBreadcrumbs,
} from './display';

export type {
  MetadataItem,
  MetadataGridProps,
  BreadcrumbItem,
  BreadcrumbsUIComponents,
  BreadcrumbsProps,
  BreadcrumbsFactoryConfig,
} from './display';

// =============================================================================
// SKELETON COMPONENTS
// =============================================================================

export {
  // Table skeleton - factory and simple versions
  createTableSkeleton,
  SimpleTableSkeleton,
  // Card skeleton - factory and simple versions
  createCardSkeleton,
  SimpleCardSkeleton,
  // Full screen loading - no factory needed (pure component)
  FullScreenLoading,
  CenteredSpinner,
} from './skeletons';

export type {
  SkeletonUIComponents,
  TableSkeletonUIComponents,
  CardSkeletonUIComponents,
  TableSkeletonProps,
  CardSkeletonProps,
  FullScreenLoadingProps,
} from './skeletons';

// =============================================================================
// THEME COMPONENTS
// =============================================================================

export {
  ThemeToggle,
  ThemeToggleThreeState,
} from './theme';

export type {
  ThemeToggleProps,
} from './theme';

// =============================================================================
// ADMIN COMPONENTS
// =============================================================================

export {
  createThemeManagementPage,
  createPermissionManagementPage,
  // Role Dialogs
  createDeleteRoleDialogFactory,
  createBulkDeleteDialogFactory,
  createCreateRoleDialogFactory,
  // Permission Matrix and Dialog
  createManagePermissionsMatrix,
  createManagePermissionsDialog,
} from './admin';

export type {
  // Theme Management
  Theme,
  ThemeFormData,
  ThemeApi,
  ThemeManagementUIComponents,
  ThemeManagementPageProps,
  ThemeManagementPageFactoryConfig,
  // Permission Management
  Permission,
  PermissionRoleRef,
  CategoryCount,
  PermissionStats,
  PermissionApi,
  PermissionManagementUIComponents,
  PermissionManagementPageProps,
  PermissionManagementPageFactoryConfig,
  // Role Dialogs
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
  // Permission Matrix
  PermissionDefinition,
  PermissionModule,
  PermissionRegistry,
  ManagePermissionsMatrixDbPermission,
  RoleWithStatsForMatrix,
  ManagePermissionsMatrixRoleWithPermissions,
  ManagePermissionsMatrixUIComponents,
  ManagePermissionsMatrixApi,
  ManagePermissionsMatrixConfig,
  ManagePermissionsMatrixProps,
  ManagePermissionsMatrixFactoryConfig,
  // Permission Dialog
  ManagePermissionsDialogDbPermission,
  ManagePermissionsDialogCategoryCount,
  RoleWithStatsForDialog,
  ManagePermissionsDialogRoleWithPermissions,
  ManagePermissionsDialogUIComponents,
  ManagePermissionsDialogApi,
  ManagePermissionsDialogProps,
  ManagePermissionsDialogFactoryConfig,
} from './admin';

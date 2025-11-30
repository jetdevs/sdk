/**
 * Admin UI Components Module
 *
 * Provides drop-in admin pages for common SaaS functionality.
 * Apps create components using factory functions that accept their tRPC client and UI components.
 *
 * @module @yobolabs/core/ui/admin
 *
 * @example
 * ```typescript
 * // Create theme management page
 * import { createThemeManagementPage } from '@yobolabs/core/ui/admin';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const ThemeManagementPage = createThemeManagementPage({
 *   api,
 *   ui: {
 *     ...UI,
 *     toast,
 *   },
 * });
 *
 * // Create permission management page
 * import { createPermissionManagementPage } from '@yobolabs/core/ui/admin';
 *
 * export const PermissionManagementPage = createPermissionManagementPage({
 *   api,
 *   ui: { ...UI, Secure },
 * });
 * ```
 */

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

export {
  createThemeManagementPage,
} from './ThemeManagementPage';

export type {
  Theme,
  ThemeFormData,
  ThemeApi,
  ThemeManagementUIComponents,
  ThemeManagementPageProps,
  ThemeManagementPageFactoryConfig,
} from './ThemeManagementPage';

// =============================================================================
// PERMISSION MANAGEMENT
// =============================================================================

export {
  createPermissionManagementPage,
} from './PermissionManagementPage';

export type {
  Permission,
  PermissionRoleRef,
  CategoryCount,
  PermissionStats,
  PermissionApi,
  PermissionManagementUIComponents,
  PermissionManagementPageProps,
  PermissionManagementPageFactoryConfig,
} from './PermissionManagementPage';

// =============================================================================
// ROLE DIALOGS
// =============================================================================

export {
  createDeleteRoleDialogFactory,
  createBulkDeleteDialogFactory,
  createCreateRoleDialogFactory,
} from './RoleDialogs';

export type {
  RoleWithStats,
  ToastInterface,
  // Delete Role Dialog
  DeleteRoleDialogUIComponents,
  DeleteRoleDialogApi,
  DeleteRoleDialogFactoryConfig,
  DeleteRoleDialogProps,
  // Bulk Delete Dialog
  BulkDeleteDialogUIComponents,
  BulkDeleteDialogFactoryConfig,
  BulkDeleteDialogProps,
  // Create Role Dialog
  CreateRoleDialogUIComponents,
  CreateRoleDialogApi,
  CreateRoleDialogFactoryConfig,
  CreateRoleDialogProps,
} from './RoleDialogs';

// =============================================================================
// PERMISSION MATRIX (CRUD Matrix for Role Permissions)
// =============================================================================

export {
  createManagePermissionsMatrix,
} from './ManagePermissionsMatrix';

export type {
  PermissionDefinition,
  PermissionModule,
  PermissionRegistry,
  DbPermission as ManagePermissionsMatrixDbPermission,
  RoleWithStatsForMatrix,
  RoleWithPermissions as ManagePermissionsMatrixRoleWithPermissions,
  ManagePermissionsMatrixUIComponents,
  ManagePermissionsMatrixApi,
  ManagePermissionsMatrixConfig,
  ManagePermissionsMatrixProps,
  ManagePermissionsMatrixFactoryConfig,
} from './ManagePermissionsMatrix';

// =============================================================================
// PERMISSION DIALOG (Simple Permission Management)
// =============================================================================

export {
  createManagePermissionsDialog,
} from './ManagePermissionsDialog';

export type {
  DbPermission as ManagePermissionsDialogDbPermission,
  CategoryCount as ManagePermissionsDialogCategoryCount,
  RoleWithStatsForDialog,
  RoleWithPermissions as ManagePermissionsDialogRoleWithPermissions,
  ManagePermissionsDialogUIComponents,
  ManagePermissionsDialogApi,
  ManagePermissionsDialogProps,
  ManagePermissionsDialogFactoryConfig,
} from './ManagePermissionsDialog';

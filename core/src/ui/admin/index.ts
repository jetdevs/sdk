/**
 * Admin UI Components Module
 *
 * Provides drop-in admin pages for common SaaS functionality.
 * Apps create components using factory functions that accept their tRPC client and UI components.
 *
 * @module @jetdevs/core/ui/admin
 *
 * @example
 * ```typescript
 * // Create theme management page
 * import { createThemeManagementPage } from '@jetdevs/core/ui/admin';
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
 * import { createPermissionManagementPage } from '@jetdevs/core/ui/admin';
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
    createThemeManagementPage
} from './ThemeManagementPage';

export type {
    Theme, ThemeApi, ThemeFormData, ThemeManagementPageFactoryConfig, ThemeManagementPageProps, ThemeManagementUIComponents
} from './ThemeManagementPage';

// =============================================================================
// PERMISSION MANAGEMENT
// =============================================================================

export {
    createPermissionManagementPage
} from './PermissionManagementPage';

export type {
    CategoryCount, Permission, PermissionApi, PermissionManagementPageFactoryConfig, PermissionManagementPageProps, PermissionManagementUIComponents, PermissionRoleRef, PermissionStats
} from './PermissionManagementPage';

// =============================================================================
// ROLE DIALOGS
// =============================================================================

export {
    createBulkDeleteDialogFactory,
    createCreateRoleDialogFactory, createDeleteRoleDialogFactory
} from './RoleDialogs';

export type {
    BulkDeleteDialogFactoryConfig,
    BulkDeleteDialogProps,
    // Bulk Delete Dialog
    BulkDeleteDialogUIComponents, CreateRoleDialogApi,
    CreateRoleDialogFactoryConfig,
    CreateRoleDialogProps,
    // Create Role Dialog
    CreateRoleDialogUIComponents, DeleteRoleDialogApi,
    DeleteRoleDialogFactoryConfig,
    DeleteRoleDialogProps,
    // Delete Role Dialog
    DeleteRoleDialogUIComponents, RoleWithStats,
    ToastInterface
} from './RoleDialogs';

// =============================================================================
// PERMISSION MATRIX (CRUD Matrix for Role Permissions)
// =============================================================================

export {
    createManagePermissionsMatrix
} from './ManagePermissionsMatrix';

export type {
    ManagePermissionsMatrixApi,
    ManagePermissionsMatrixConfig, DbPermission as ManagePermissionsMatrixDbPermission, ManagePermissionsMatrixFactoryConfig, ManagePermissionsMatrixProps, RoleWithPermissions as ManagePermissionsMatrixRoleWithPermissions,
    ManagePermissionsMatrixUIComponents, PermissionDefinition,
    PermissionModule,
    PermissionRegistry, RoleWithStatsForMatrix
} from './ManagePermissionsMatrix';

// =============================================================================
// PERMISSION DIALOG (Simple Permission Management)
// =============================================================================

export {
    createManagePermissionsDialog
} from './ManagePermissionsDialog';

export type {
    ManagePermissionsDialogApi, CategoryCount as ManagePermissionsDialogCategoryCount, DbPermission as ManagePermissionsDialogDbPermission, ManagePermissionsDialogFactoryConfig, ManagePermissionsDialogProps, RoleWithPermissions as ManagePermissionsDialogRoleWithPermissions,
    ManagePermissionsDialogUIComponents, RoleWithStatsForDialog
} from './ManagePermissionsDialog';


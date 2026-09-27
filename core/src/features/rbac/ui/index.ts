/**
 * RBAC UI Module
 *
 * Client-side role-based access control components.
 * Re-exports existing factory functions from ui/admin.
 *
 * @module @jetdevs/core/features/rbac/ui
 */

// Re-export existing factories from ui/admin
export {
  createDeleteRoleDialogFactory,
  createBulkDeleteDialogFactory,
  createCreateRoleDialogFactory,
  type RoleWithStats,
  type ToastInterface,
  type DeleteRoleDialogUIComponents,
  type DeleteRoleDialogApi,
  type DeleteRoleDialogFactoryConfig,
  type DeleteRoleDialogProps,
  type BulkDeleteDialogUIComponents,
  type BulkDeleteDialogFactoryConfig,
  type BulkDeleteDialogProps,
  type CreateRoleDialogUIComponents,
  type CreateRoleDialogApi,
  type CreateRoleDialogFactoryConfig,
  type CreateRoleDialogProps,
} from "../../../ui/admin/RoleDialogs";

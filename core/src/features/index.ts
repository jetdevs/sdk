/**
 * Features Module
 *
 * Feature-based exports for SDK component migration.
 * Each feature contains:
 * - backend/ - Server-side logic (repositories, services, routers)
 * - ui/ - Client-side logic (hooks, factories)
 *
 * @module @jetdevs/core/features
 */

// Re-export all features
export * from "./users";
export * from "./organizations";
export * from "./themes";
export * from "./api-keys";

// Export rbac without ToastInterface to avoid conflict with shared types
export {
  createDeleteRoleDialogFactory,
  createBulkDeleteDialogFactory,
  createCreateRoleDialogFactory,
  type RoleWithStats,
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
} from "./rbac";

// Shared types (canonical ToastInterface and other standard interfaces)
export * from "./shared";

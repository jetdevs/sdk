/**
 * RBAC Module
 *
 * Role-Based Access Control system for SaaS applications.
 * Provides repositories, services, utilities, and validation schemas.
 *
 * @module @yobolabs/core/rbac
 *
 * @example
 * ```typescript
 * import {
 *   RoleRepository,
 *   RoleService,
 *   PermissionRepository,
 *   hasSystemAccess,
 *   createRoleSchema,
 * } from '@yobolabs/core/rbac';
 *
 * // Create repository with schema injection
 * const roleRepo = new RoleRepository(db, {
 *   roles,
 *   permissions,
 *   rolePermissions,
 *   userRoles,
 * });
 *
 * // Create service with hooks
 * const roleService = new RoleService(schema, {
 *   onPermissionsChanged: async (roleId, userIds) => {
 *     // Broadcast real-time updates
 *   }
 * });
 *
 * // Use utilities
 * if (hasSystemAccess(user.permissions)) {
 *   // User has admin access
 * }
 *
 * // Validate input
 * const validatedData = createRoleSchema.parse(input);
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Role types
  Role,
  RoleWithStats,
  RoleStats,
  RolePermission,
  RoleFilters,
  RoleListOptions,
  RoleListResult,
  RoleCreateData,
  RoleUpdateData,
  RolePermissionAssignment,
  UserRoleStats,
  RolePermissionStats,
  // Permission types
  Permission,
  PermissionWithUsage,
  PermissionCreateData,
  PermissionUpdateData,
  CategoryCount,
  PermissionStats,
  // Service context types
  Actor,
  RbacServiceContext,
  // Service params types
  RoleListParams,
  RoleGetByIdParams,
  RoleCreateParams,
  RoleUpdateParams,
  RoleDeleteParams,
  RoleAssignPermissionsParams,
  RoleRemovePermissionsParams,
  RoleBulkUpdateParams,
  RoleBulkDeleteParams,
} from "./types";

// =============================================================================
// REPOSITORIES
// =============================================================================

export {
  RoleRepository,
  SDKRoleRepository,
  sdkRoleRepositorySchema,
} from "./role.repository";
export {
  PermissionRepository,
  SDKPermissionRepository,
} from "./permission.repository";

// =============================================================================
// SERVICES
// =============================================================================

export {
  RoleService,
  RbacError,
  // Factory functions
  createRoleService,
  createSDKRoleService,
  // Pre-built instances
  SDKRoleService,
  sdkRbacSchema,
  // Constants
  ADMIN_FULL_ACCESS_PERMISSION,
} from "./role.service";

export type {
  RoleServiceHooks,
  RoleServiceSchema,
} from "./role.service";

// =============================================================================
// UTILITIES
// =============================================================================

export {
  // Modern role checks
  hasSystemAccess,
  isSystemRole,
  isGlobalRole,
  isOrgSpecificRole,
  hasPlatformSystemRole,
  hasBackofficeAccess,
  canManageRoles,
  canViewRoles,
  canAssignPermissions,
  // Legacy exports (deprecated)
  SYSTEM_ROLES,
  ORG_ROLES,
  isSystemRoleName,
  isOrgRoleName,
  isGlobalRoleName,
  isPlatformSystemRole,
} from "./utils";

export type {
  SystemRoleName,
  OrgRoleName,
  RoleName,
} from "./utils";

// =============================================================================
// SCHEMAS
// =============================================================================

export {
  // Role schemas
  createRoleSchema,
  updateRoleSchema,
  roleFiltersSchema,
  getRoleByIdSchema,
  getRoleWithPermissionsSchema,
  assignPermissionsSchema,
  removePermissionsSchema,
  bulkUpdateRolesSchema,
  bulkDeleteRolesSchema,
  deleteRoleSchema,
  copyRoleSchema,
  // Permission schemas
  createPermissionSchema,
  updatePermissionSchema,
  permissionFiltersSchema,
  getPermissionByIdSchema,
  getPermissionBySlugSchema,
} from "./schemas";

export type {
  CreateRoleInput,
  UpdateRoleInput,
  RoleFiltersInput,
  GetRoleByIdInput,
  GetRoleWithPermissionsInput,
  AssignPermissionsInput,
  RemovePermissionsInput,
  BulkUpdateRolesInput,
  BulkDeleteRolesInput,
  CopyRoleInput,
  CreatePermissionInput,
  UpdatePermissionInput,
  PermissionFiltersInput,
  GetPermissionByIdInput,
  GetPermissionBySlugInput,
} from "./schemas";

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
  createRoleRouterConfig,
  roleRouterConfig,
  defaultCreateServiceContext,
} from "./router-config";

export type {
  CreateRoleRouterConfigOptions,
  CreateServiceContext,
} from "./router-config";

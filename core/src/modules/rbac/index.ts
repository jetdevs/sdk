/**
 * RBAC Module
 *
 * Role-Based Access Control system for SaaS applications.
 * Provides repositories, services, utilities, and validation schemas.
 *
 * @module @jetdevs/core/rbac
 *
 * @example
 * ```typescript
 * import {
 *   RoleRepository,
 *   RoleService,
 *   PermissionRepository,
 *   hasSystemAccess,
 *   createRoleSchema,
 * } from '@jetdevs/core/rbac';
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
    // Service context types
    Actor, CategoryCount,
    // Permission types
    Permission, PermissionCreateData, PermissionStats, PermissionUpdateData, PermissionWithUsage, RbacServiceContext,
    // Role types
    Role, RoleAssignPermissionsParams, RoleBulkDeleteParams, RoleBulkUpdateParams, RoleCreateData, RoleCreateParams, RoleDeleteParams, RoleFilters, RoleGetByIdParams, RoleListOptions,
    // Service params types
    RoleListParams, RoleListResult, RolePermission, RolePermissionAssignment, RolePermissionStats, RoleRemovePermissionsParams, RoleStats, RoleUpdateData, RoleUpdateParams, RoleWithStats, UserRoleStats
} from "./types";

// =============================================================================
// REPOSITORIES
// =============================================================================

export {
    PermissionRepository,
    SDKPermissionRepository
} from "./permission.repository";
export {
    RoleRepository,
    SDKRoleRepository,
    sdkRoleRepositorySchema
} from "./role.repository";

// =============================================================================
// SERVICES
// =============================================================================

export {
    // Constants
    ADMIN_FULL_ACCESS_PERMISSION, RbacError, RoleService,
    // Pre-built instances
    SDKRoleService,
    // Factory functions
    createRoleService,
    createSDKRoleService, sdkRbacSchema
} from "./role.service";

export type {
    RoleServiceHooks,
    RoleServiceSchema
} from "./role.service";

// =============================================================================
// UTILITIES
// =============================================================================

export {
    ORG_ROLES,
    // Legacy exports (deprecated)
    SYSTEM_ROLES, canAssignPermissions, canManageRoles,
    canViewRoles, hasBackofficeAccess, hasPlatformSystemRole,
    // Modern role checks
    hasSystemAccess, isGlobalRole, isGlobalRoleName, isOrgRoleName, isOrgSpecificRole, isPlatformSystemRole, isSystemRole, isSystemRoleName
} from "./utils";

export type {
    OrgRoleName,
    RoleName, SystemRoleName
} from "./utils";

// =============================================================================
// SCHEMAS
// =============================================================================

export {
    assignPermissionsSchema, bulkDeleteRolesSchema, bulkUpdateRolesSchema, copyRoleSchema,
    // Permission schemas
    createPermissionSchema,
    // Role schemas
    createRoleSchema, deleteRoleSchema, getPermissionByIdSchema,
    getPermissionBySlugSchema, getRoleByIdSchema,
    getRoleWithPermissionsSchema, permissionFiltersSchema, removePermissionsSchema, roleFiltersSchema, updatePermissionSchema, updateRoleSchema
} from "./schemas";

export type {
    AssignPermissionsInput, BulkDeleteRolesInput, BulkUpdateRolesInput, CopyRoleInput,
    CreatePermissionInput, CreateRoleInput, GetPermissionByIdInput,
    GetPermissionBySlugInput, GetRoleByIdInput,
    GetRoleWithPermissionsInput, PermissionFiltersInput, RemovePermissionsInput, RoleFiltersInput, UpdatePermissionInput, UpdateRoleInput
} from "./schemas";

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
    createRoleRouterConfig, defaultCreateServiceContext, roleRouterConfig
} from "./router-config";

export type {
    CreateRoleRouterConfigOptions,
    CreateServiceContext
} from "./router-config";


/**
 * User Management Module
 *
 * Provides user management infrastructure including:
 * - Type definitions for users, roles, and permissions
 * - Zod validation schemas for API input
 * - Repository factory for database operations
 * - Router configuration factory for tRPC integration
 *
 * @module @jetdevs/core/users
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
    BulkOperationResult,

    // UI-specific types
    User, UserBulkActions,
    // Input data
    UserCreateData,
    // Filter and options
    UserFilters, UserFormData, UserListOptions,
    // Results
    UserListResult,
    // Permission types
    UserPermission,
    UserPermissionsData,
    // User records
    UserRecord,
    // Role types
    UserRole,
    UserRoleAssignment, UserTableColumn, UserUpdateData, UserWithRoles,
    UserWithStats
} from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export {

    // Role assignment schemas
    assignRoleSchema,
    // User settings schemas
    changePasswordSchema,
    // Utility schemas
    checkUsernameSchema, removeFromOrgSchema, removeRoleSchema, updateSessionPreferenceSchema,
    updateThemePreferenceSchema, userBulkDeleteSchema,
    // Bulk operation schemas
    userBulkUpdateSchema,
    // Create/Update schemas
    userCreateSchema,
    // Filter schemas
    userFiltersSchema, userUpdateSchema
} from './schemas';

export type {
    AssignRoleInput, ChangePasswordInput, CheckUsernameInput, RemoveFromOrgInput, RemoveRoleInput, UpdateSessionPreferenceInput,
    UpdateThemePreferenceInput, UserBulkDeleteInput, UserBulkUpdateInput, UserCreateInput, UserFiltersInput, UserUpdateInput
} from './schemas';

// =============================================================================
// REPOSITORY
// =============================================================================

export {
    createUserRepositoryClass
} from './repository';

export type {
    IUserRepository, UserRepositorySchema
} from './repository';

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
    // Pre-built SDK exports
    SDKUserRepository, UserRouterError, createUserRouterConfig, userRouterConfig
} from './router-config';

export type {
    UserServiceContext as RouterServiceContext,
    UserHandlerContext, UserRouterDeps
} from './router-config';

// =============================================================================
// SERVICE
// =============================================================================

export {
    UserServiceError, createDefaultUserService, createUserService
} from './service';

export type {
    ChangePasswordParams, CheckUsernameParams,
    // Service interface
    IUserService,
    // Hook parameter types
    InvitationEmailParams,
    RoleOperationParams, UpdateSessionPreferenceParams,
    UpdateThemePreferenceParams, UserBulkDeleteParams, UserBulkUpdateParams, UserGetByIdParams,
    UserInviteParams,
    // Service parameter types
    UserListParams, UserOrgRemoveParams, UserRoleAssignParams,
    UserRoleRemoveParams,
    // Service context
    UserServiceContext, UserServiceDeps,
    UserServiceHooks, UserUpdateParams
} from './service';


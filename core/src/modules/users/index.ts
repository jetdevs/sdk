/**
 * User Management Module
 *
 * Provides user management infrastructure including:
 * - Type definitions for users, roles, and permissions
 * - Zod validation schemas for API input
 * - Repository factory for database operations
 * - Router configuration factory for tRPC integration
 *
 * @module @yobolabs/core/users
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // User records
  UserRecord,
  UserWithRoles,
  UserWithStats,

  // Role types
  UserRole,
  UserRoleAssignment,

  // Permission types
  UserPermission,
  UserPermissionsData,

  // Filter and options
  UserFilters,
  UserListOptions,

  // Input data
  UserCreateData,
  UserUpdateData,

  // Results
  UserListResult,
  BulkOperationResult,

  // UI-specific types
  User,
  UserTableColumn,
  UserFormData,
  UserBulkActions,
} from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export {
  // Filter schemas
  userFiltersSchema,

  // Create/Update schemas
  userCreateSchema,
  userUpdateSchema,

  // Role assignment schemas
  assignRoleSchema,
  removeRoleSchema,
  removeFromOrgSchema,

  // User settings schemas
  changePasswordSchema,
  updateSessionPreferenceSchema,
  updateThemePreferenceSchema,

  // Utility schemas
  checkUsernameSchema,

  // Bulk operation schemas
  userBulkUpdateSchema,
  userBulkDeleteSchema,
} from './schemas';

export type {
  UserFiltersInput,
  UserCreateInput,
  UserUpdateInput,
  AssignRoleInput,
  RemoveRoleInput,
  RemoveFromOrgInput,
  ChangePasswordInput,
  UpdateSessionPreferenceInput,
  UpdateThemePreferenceInput,
  CheckUsernameInput,
  UserBulkUpdateInput,
  UserBulkDeleteInput,
} from './schemas';

// =============================================================================
// REPOSITORY
// =============================================================================

export {
  createUserRepositoryClass,
} from './repository';

export type {
  UserRepositorySchema,
  IUserRepository,
} from './repository';

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
  createUserRouterConfig,
  UserRouterError,
  // Pre-built SDK exports
  SDKUserRepository,
  userRouterConfig,
} from './router-config';

export type {
  UserRouterDeps,
  UserServiceContext as RouterServiceContext,
  UserHandlerContext,
} from './router-config';

// =============================================================================
// SERVICE
// =============================================================================

export {
  createUserService,
  createDefaultUserService,
  UserServiceError,
} from './service';

export type {
  // Service interface
  IUserService,
  UserServiceDeps,
  UserServiceHooks,

  // Service context
  UserServiceContext,

  // Service parameter types
  UserListParams,
  UserGetByIdParams,
  UserInviteParams,
  UserUpdateParams,
  UserBulkUpdateParams,
  UserBulkDeleteParams,
  UserRoleAssignParams,
  UserRoleRemoveParams,
  UserOrgRemoveParams,
  CheckUsernameParams,
  UpdateSessionPreferenceParams,
  UpdateThemePreferenceParams,
  ChangePasswordParams,

  // Hook parameter types
  InvitationEmailParams,
  RoleOperationParams,
} from './service';

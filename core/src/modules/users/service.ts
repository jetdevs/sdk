/**
 * User Service Factory
 *
 * Creates a user service with injected dependencies for app-specific behaviors.
 * This factory pattern allows apps to provide their own implementations for:
 * - Email services (sending invitation emails)
 * - WebSocket broadcasts (real-time permission updates)
 * - Role templates (copying default roles for new orgs)
 * - Privileged database access (cross-org operations)
 *
 * @module @jetdevs/core/users
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { IUserRepository } from './repository';
import type {
    UserPermissionsData,
    UserRecord,
    UserWithRoles,
    UserWithStats
} from './types';

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Service context provided by the calling application
 * Contains the authenticated user's session information
 */
export interface UserServiceContext {
  /** Current database connection */
  db: PostgresJsDatabase<any>;
  /** Current user's ID */
  userId: number;
  /** Current organization ID (null for system-wide operations) */
  orgId: number | null;
  /** Whether the current user is a system-level user */
  isSystemUser: boolean;
  /** Current user's permissions */
  permissions: string[];
}

/**
 * Parameters for listing users
 */
export interface UserListParams {
  limit: number;
  offset: number;
  search?: string;
  isActive?: boolean;
  roleId?: number;
  orgId?: number;
}

/**
 * Parameters for getting a user by ID
 */
export interface UserGetByIdParams {
  id: number;
  includeRoles?: boolean;
  includePermissions?: boolean;
}

/**
 * Parameters for inviting a user
 */
export interface UserInviteParams {
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  username?: string;
  password?: string;
  isActive?: boolean;
  avatar?: string;
  sessionTimeoutPreference?: number;
}

/**
 * Parameters for updating a user
 */
export interface UserUpdateParams {
  id: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  username?: string;
  password?: string;
  isActive?: boolean;
  avatar?: string;
  sessionTimeoutPreference?: number;
  themePreference?: string;
}

/**
 * Parameters for bulk update operations
 */
export interface UserBulkUpdateParams {
  userIds: number[];
  action: 'activate' | 'deactivate';
}

/**
 * Parameters for bulk delete operations
 */
export interface UserBulkDeleteParams {
  userIds: number[];
}

/**
 * Parameters for role assignment
 */
export interface UserRoleAssignParams {
  userId: number;
  roleId: number;
  orgId: number;
  assignedBy: number;
}

/**
 * Parameters for role removal
 */
export interface UserRoleRemoveParams {
  userId: number;
  roleId: number;
  orgId: number;
}

/**
 * Parameters for removing user from organization
 */
export interface UserOrgRemoveParams {
  userId: number;
  orgId: number;
}

/**
 * Parameters for checking username availability
 */
export interface CheckUsernameParams {
  username: string;
  currentUserId?: number;
}

/**
 * Parameters for updating session timeout preference
 */
export interface UpdateSessionPreferenceParams {
  userId: number;
  sessionTimeoutMinutes: number;
}

/**
 * Parameters for updating theme preference
 */
export interface UpdateThemePreferenceParams {
  userId: number;
  theme: string;
}

/**
 * Parameters for changing password
 */
export interface ChangePasswordParams {
  userId: number;
  currentPassword: string;
  newPassword: string;
}

// =============================================================================
// HOOKS INTERFACE
// =============================================================================

/**
 * Invitation email parameters
 */
export interface InvitationEmailParams {
  user: UserRecord;
  orgId: number;
  inviterId: number;
  isNewUser: boolean;
}

/**
 * Role operation parameters for centralized helper
 */
export interface RoleOperationParams {
  userId: number;
  orgId: number;
  roleId?: number;
  assignedBy?: number;
}

/**
 * Hooks that allow apps to inject app-specific behaviors into the user service.
 * All hooks are optional except withPrivilegedDb which is required for cross-org operations.
 */
export interface UserServiceHooks {
  /**
   * Execute a function with privileged database access (bypasses RLS).
   * Required for cross-org operations like listing all users.
   *
   * @example
   * ```typescript
   * withPrivilegedDb: async (fn) => {
   *   return await withPrivilegedDb(fn);
   * }
   * ```
   */
  withPrivilegedDb: <T>(fn: (db: PostgresJsDatabase<any>) => Promise<T>) => Promise<T>;

  /**
   * Send an invitation email to a user.
   * If not provided, invitation emails will be skipped.
   *
   * @example
   * ```typescript
   * sendInvitationEmail: async (params) => {
   *   await emailService.sendEmail({
   *     to: params.user.email,
   *     template: params.isNewUser ? 'new-user-invite' : 'existing-user-invite',
   *     data: { orgId: params.orgId },
   *   });
   * }
   * ```
   */
  sendInvitationEmail?: (params: InvitationEmailParams) => Promise<void>;

  /**
   * Broadcast permission updates via WebSocket.
   * If not provided, broadcasts will be skipped.
   *
   * @example
   * ```typescript
   * broadcastPermissionUpdate: async (userIds) => {
   *   await ws.broadcast('permission:update', { userIds });
   * }
   * ```
   */
  broadcastPermissionUpdate?: (userIds: number[]) => Promise<void>;

  /**
   * Copy organization role templates for a new organization.
   * Used when creating the first user in an org to ensure default roles exist.
   *
   * @example
   * ```typescript
   * copyOrgRoleTemplates: async (orgId) => {
   *   await seedDefaultRoles(orgId);
   * }
   * ```
   */
  copyOrgRoleTemplates?: (orgId: number) => Promise<void>;

  /**
   * Centralized role assignment operation.
   * If provided, will be used instead of the repository's assignRole.
   */
  assignUserRole?: (params: RoleOperationParams) => Promise<void>;

  /**
   * Centralized role removal operation.
   * If provided, will be used instead of the repository's removeRole.
   */
  removeUserRole?: (params: RoleOperationParams) => Promise<any[]>;

  /**
   * Hash a password for storage.
   * Required for user creation and password changes.
   */
  hashPassword: (password: string, rounds?: number) => Promise<string>;

  /**
   * Compare a password with a hash.
   * Required for password verification.
   */
  comparePassword: (password: string, hash: string) => Promise<boolean>;
}

/**
 * Dependencies required to create a user service
 */
export interface UserServiceDeps {
  /** App-specific hooks for customizing behavior */
  hooks: UserServiceHooks;
  /** Repository instance (optional - will be created if not provided) */
  repository?: IUserRepository;
  /** Repository class constructor (used if repository not provided) */
  RepositoryClass?: new (db?: any) => IUserRepository;
}

// =============================================================================
// SERVICE ERROR CLASS
// =============================================================================

/**
 * Error class for user service operations
 */
export class UserServiceError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * Interface for the User Service
 */
export interface IUserService {
  // User listing & retrieval
  getAllWithStats(params: UserListParams, ctx: UserServiceContext): Promise<{
    users: UserWithStats[];
    totalCount: number;
    hasMore: boolean;
  }>;
  getAll(ctx: UserServiceContext): Promise<UserWithRoles[]>;
  getAllUsersSystem(params: UserListParams, ctx: UserServiceContext): Promise<{
    users: UserWithStats[];
    totalCount: number;
    hasMore: boolean;
  }>;
  getById(params: UserGetByIdParams, ctx: UserServiceContext): Promise<UserWithStats>;

  // User creation & invitation
  invite(params: UserInviteParams, ctx: UserServiceContext): Promise<UserWithRoles & { isNewUser: boolean; message: string }>;

  // User updates
  update(params: UserUpdateParams, ctx: UserServiceContext): Promise<UserWithRoles>;
  delete(id: number, ctx: UserServiceContext): Promise<UserWithRoles>;

  // Bulk operations
  bulkUpdate(params: UserBulkUpdateParams, ctx: UserServiceContext): Promise<{
    success: boolean;
    updatedCount: number;
    users: UserWithRoles[];
  }>;
  bulkDelete(params: UserBulkDeleteParams, ctx: UserServiceContext): Promise<{
    success: boolean;
    deletedCount: number;
    users: UserWithRoles[];
  }>;

  // Role management
  assignRole(params: UserRoleAssignParams, ctx: UserServiceContext): Promise<{ success: boolean }>;
  removeRole(params: UserRoleRemoveParams, ctx: UserServiceContext): Promise<{ success: boolean; removed: number }>;
  removeFromOrg(params: UserOrgRemoveParams, ctx: UserServiceContext): Promise<{ success: boolean; removed: number }>;

  // Preferences & settings
  updateSessionPreference(params: UpdateSessionPreferenceParams, ctx: UserServiceContext): Promise<{
    success: boolean;
    sessionTimeoutPreference: number | null;
  }>;
  updateThemePreference(params: UpdateThemePreferenceParams, ctx: UserServiceContext): Promise<{
    success: boolean;
    themePreference: string | null;
  }>;
  changePassword(params: ChangePasswordParams, ctx: UserServiceContext): Promise<{ success: boolean; message?: string }>;
  getCurrentUserSettings(userId: number, ctx: UserServiceContext): Promise<any>;

  // Username operations
  checkUsername(params: CheckUsernameParams, ctx: UserServiceContext): Promise<{
    isAvailable: boolean;
    username: string;
    suggestions: string[];
  }>;

  // Permissions
  getMyPermissions(userId: number, ctx: UserServiceContext): Promise<UserPermissionsData>;
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

/**
 * Create a User Service with injected dependencies.
 *
 * This factory creates a service class that handles all user management
 * business logic while delegating app-specific behaviors to hooks.
 *
 * @example
 * ```typescript
 * import { createUserService, SDKUserRepository } from '@jetdevs/core/users';
 * import { withPrivilegedDb } from '@/db/clients';
 * import { emailService } from '@/lib/email';
 * import bcrypt from 'bcrypt';
 *
 * const userService = createUserService({
 *   hooks: {
 *     withPrivilegedDb,
 *     sendInvitationEmail: async (params) => {
 *       await emailService.sendInvitation(params);
 *     },
 *     hashPassword: (p) => bcrypt.hash(p, 12),
 *     comparePassword: bcrypt.compare,
 *   },
 *   RepositoryClass: SDKUserRepository,
 * });
 *
 * // Use the service
 * const users = await userService.getAllWithStats(params, ctx);
 * ```
 */
export function createUserService(deps: UserServiceDeps): IUserService {
  const { hooks, repository, RepositoryClass } = deps;

  // Helper to get repository instance
  function getRepo(db: PostgresJsDatabase<any>): IUserRepository {
    if (repository) return repository;
    if (RepositoryClass) return new RepositoryClass(db);
    throw new UserServiceError('BAD_REQUEST', 'No repository provided to user service');
  }

  return {
    // =========================================================================
    // USER LISTING & RETRIEVAL
    // =========================================================================

    /**
     * Get all users with stats and role information
     */
    async getAllWithStats(params: UserListParams, ctx: UserServiceContext) {
      const { limit, offset, search, isActive, roleId, orgId } = params;
      const currentOrgId = ctx.orgId;

      if (!currentOrgId) {
        return { users: [], totalCount: 0, hasMore: false };
      }

      // Get users in current org
      const usersInCurrentOrg = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findByOrgId(db, currentOrgId);
      });

      if (usersInCurrentOrg.length === 0) {
        return { users: [], totalCount: 0, hasMore: false };
      }

      // Get users with filtering
      const users = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findAll(db, {
          limit,
          offset,
          filters: {
            search,
            isActive,
            roleId,
            orgId: currentOrgId,
          },
        });
      });

      // Get roles for all users
      const userIds = users.map(u => u.id);
      const rolesByUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.getUserRolesBatch(db, userIds, currentOrgId);
      });

      // Map users with stats
      const usersWithStats: UserWithStats[] = users.map(user => {
        const userRoles = rolesByUser.get(user.id) || [];
        const activeRoles = userRoles.filter(r => r.isActive);
        const hasRoleInCurrentOrg = userRoles.length > 0;

        return {
          ...user,
          roleCount: activeRoles.length,
          orgCount: hasRoleInCurrentOrg ? 1 : 0,
          activeOrgCount: activeRoles.length > 0 ? 1 : 0,
          lastLoginAt: null,
          currentOrgId: currentOrgId,
          roles: userRoles,
          _count: {
            orgs: hasRoleInCurrentOrg ? 1 : 0,
            activeOrgs: activeRoles.length > 0 ? 1 : 0,
            roles: activeRoles.length,
          },
        };
      });

      // Get total count
      const totalCount = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.count(db, {
          search,
          isActive,
        });
      });

      return {
        users: usersWithStats,
        totalCount,
        hasMore: offset + limit < totalCount,
      };
    },

    /**
     * Get all active users
     */
    async getAll(ctx: UserServiceContext) {
      const users = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findAll(db, {
          limit: 1000,
          offset: 0,
          filters: { isActive: true },
          sortBy: 'name',
          sortOrder: 'asc',
        });
      });

      if (users.length === 0) {
        return [];
      }

      // Get roles for all users
      const userIds = users.map(u => u.id);
      const rolesByUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.getUserRolesBatch(db, userIds);
      });

      // Map users with roles
      return users.map(user => ({
        ...user,
        roles: rolesByUser.get(user.id) || [],
      }));
    },

    /**
     * Get all users across all organizations (system-wide)
     */
    async getAllUsersSystem(params: UserListParams, ctx: UserServiceContext) {
      if (!ctx.isSystemUser) {
        throw new UserServiceError(
          'FORBIDDEN',
          'System role required for cross-organization access'
        );
      }

      const { limit, offset, search, isActive, roleId, orgId } = params;

      // Get users
      const users = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findAll(db, {
          limit,
          offset,
          filters: { search, isActive },
        });
      });

      // Get total count
      const totalCount = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.count(db, { search, isActive });
      });

      if (users.length === 0) {
        return { users: [], totalCount, hasMore: false };
      }

      // Get roles for all users
      const userIds = users.map(u => u.id);
      const allUserRoles = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.getUserRolesBatch(db, userIds, orgId);
      });

      // Filter by role if provided
      let rolesByUser = allUserRoles;
      if (roleId) {
        rolesByUser = new Map();
        allUserRoles.forEach((roles, userId) => {
          const filteredRoles = roles.filter(r => r.roleId === roleId);
          if (filteredRoles.length > 0) {
            rolesByUser.set(userId, filteredRoles);
          }
        });
      }

      // Map users with stats
      const usersWithStats: UserWithStats[] = users.map(user => {
        const userRoles = rolesByUser.get(user.id) || [];
        const activeRoles = userRoles.filter(r => r.isActive);
        const uniqueOrgIds = new Set(userRoles.map(r => r.orgId));
        const uniqueActiveOrgIds = new Set(activeRoles.map(r => r.orgId));

        return {
          ...user,
          roleCount: activeRoles.length,
          orgCount: uniqueOrgIds.size,
          activeOrgCount: uniqueActiveOrgIds.size,
          lastLoginAt: null,
          roles: userRoles,
          _count: {
            orgs: uniqueOrgIds.size,
            activeOrgs: uniqueActiveOrgIds.size,
            roles: activeRoles.length,
          },
        };
      });

      return {
        users: usersWithStats,
        totalCount,
        hasMore: offset + limit < totalCount,
      };
    },

    /**
     * Get user by ID
     */
    async getById(params: UserGetByIdParams, ctx: UserServiceContext) {
      const user = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findById(db, params.id);
      });

      if (!user) {
        throw new UserServiceError(
          'NOT_FOUND',
          `User with ID ${params.id} not found`
        );
      }

      // Get user roles
      const userRoles = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.getUserRoles(db, params.id);
      });

      const activeRoles = userRoles.filter(r => r.isActive);
      const uniqueOrgIds = new Set(userRoles.map(r => r.orgId));
      const uniqueActiveOrgIds = new Set(activeRoles.map(r => r.orgId));

      return {
        ...user,
        roles: userRoles,
        currentOrgId: null,
        roleCount: activeRoles.length,
        orgCount: uniqueOrgIds.size,
        activeOrgCount: uniqueActiveOrgIds.size,
        lastLoginAt: null,
        _count: {
          roles: activeRoles.length,
          orgs: uniqueOrgIds.size,
          activeOrgs: uniqueActiveOrgIds.size,
        },
      };
    },

    // =========================================================================
    // USER CREATION & INVITATION
    // =========================================================================

    /**
     * Invite user (create or add existing to org)
     */
    async invite(params: UserInviteParams, ctx: UserServiceContext) {
      const sessionOrgId = ctx.orgId;

      // For system users, org context is not required for user creation
      if (!sessionOrgId && !ctx.isSystemUser) {
        throw new UserServiceError(
          'BAD_REQUEST',
          'Current organization context is required'
        );
      }

      // Check if user already exists
      const existingUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findByEmail(db, params.email);
      });

      let userId: number;
      let newUser = false;

      if (existingUser) {
        // For system users, skip org membership check
        if (sessionOrgId && !ctx.isSystemUser) {
          // Check if user is already in this org
          const hasRoleInOrg = await hooks.withPrivilegedDb(async (db) => {
            const repo = getRepo(db);
            const roles = await repo.getUserRoles(db, existingUser.id, sessionOrgId);
            return roles.length > 0;
          });

          if (hasRoleInOrg) {
            throw new UserServiceError(
              'CONFLICT',
              'User is already a member of this organization'
            );
          }
        }

        userId = existingUser.id;
      } else {
        // Create new user
        newUser = true;

        // Check username availability if provided
        if (params.username) {
          const usernameAvailable = await hooks.withPrivilegedDb(async (db) => {
            const repo = getRepo(db);
            return await repo.isUsernameAvailable(db, params.username!);
          });

          if (!usernameAvailable) {
            throw new UserServiceError(
              'CONFLICT',
              'A user with this username already exists'
            );
          }
        }

        // Hash password if provided
        let hashedPassword: string | null = null;
        if (params.password) {
          hashedPassword = await hooks.hashPassword(params.password, 12);
        }

        const createdUser = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          return await repo.create(db, {
            ...params,
            password: hashedPassword,
            currentOrgId: sessionOrgId,
          });
        });

        userId = createdUser.id;
      }

      // Assign Standard User role
      if (sessionOrgId) {
        await this.assignStandardUserRole(userId, sessionOrgId, ctx.userId, hooks);
      }

      // Get final user data
      const invitedUser = existingUser || await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findById(db, userId);
      });

      if (!invitedUser) {
        throw new UserServiceError(
          'INTERNAL_SERVER_ERROR',
          'Failed to retrieve invited user'
        );
      }

      // Send invitation email if org context and hook provided
      if (sessionOrgId && hooks.sendInvitationEmail) {
        try {
          await hooks.sendInvitationEmail({
            user: invitedUser as UserRecord,
            orgId: sessionOrgId,
            inviterId: ctx.userId,
            isNewUser: newUser,
          });
        } catch (error) {
          console.error('Failed to send invitation email:', error);
          // Don't fail the invite if email fails
        }
      }

      return {
        ...invitedUser,
        isNewUser: newUser,
        message: sessionOrgId
          ? (newUser
              ? 'New user account created and invited to organization. Invitation email sent.'
              : 'Existing user invited to organization. Invitation email sent.')
          : (newUser
              ? 'New user account created successfully.'
              : 'User updated successfully.'),
      };
    },

    // =========================================================================
    // USER UPDATES
    // =========================================================================

    /**
     * Update user
     */
    async update(params: UserUpdateParams, ctx: UserServiceContext) {
      const { id, password, ...updateData } = params;
      const currentUserId = Number(ctx.userId);
      const isSelfUpdate = id === currentUserId;
      const hasAdminPermission = ctx.permissions.includes('user.update') || ctx.permissions.includes('user:update');
      const isSystemUser = ctx.isSystemUser;

      if (!isSelfUpdate && !hasAdminPermission && !isSystemUser) {
        throw new UserServiceError(
          'FORBIDDEN',
          'You can only update your own profile or need user management permissions'
        );
      }

      // Check if user exists
      const existingUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findById(db, id);
      });

      if (!existingUser) {
        throw new UserServiceError('NOT_FOUND', 'User not found');
      }

      // Check email uniqueness if email is being updated
      if (updateData.email && updateData.email !== existingUser.email) {
        const emailAvailable = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          const user = await repo.findByEmail(db, updateData.email!);
          return !user || user.id === id;
        });

        if (!emailAvailable) {
          throw new UserServiceError(
            'CONFLICT',
            'A user with this email already exists'
          );
        }
      }

      // Check username uniqueness if username is being updated
      if (updateData.username && updateData.username !== existingUser.username) {
        const usernameAvailable = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          return await repo.isUsernameAvailable(db, updateData.username!, id);
        });

        if (!usernameAvailable) {
          throw new UserServiceError(
            'CONFLICT',
            'A user with this username already exists'
          );
        }
      }

      // Hash password if provided
      let hashedPassword: string | undefined;
      if (password) {
        hashedPassword = await hooks.hashPassword(password, 12);
      }

      const updatedUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.update(db, id, {
          ...updateData,
          ...(hashedPassword && { password: hashedPassword }),
        });
      });

      // Broadcast permission update if activation status changed
      if (updateData.isActive !== undefined && hooks.broadcastPermissionUpdate) {
        try {
          await hooks.broadcastPermissionUpdate([id]);
        } catch (error) {
          console.error('Error broadcasting permission update:', error);
        }
      }

      return updatedUser;
    },

    /**
     * Delete user (soft delete)
     */
    async delete(id: number, ctx: UserServiceContext) {
      // Check if user exists
      const existingUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findById(db, id);
      });

      if (!existingUser) {
        throw new UserServiceError('NOT_FOUND', 'User not found');
      }

      // Prevent self-deletion
      if (ctx.userId === id) {
        throw new UserServiceError(
          'FORBIDDEN',
          'Cannot delete your own account'
        );
      }

      const deletedUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.softDelete(db, id);
      });

      // Broadcast permission update
      if (hooks.broadcastPermissionUpdate) {
        try {
          await hooks.broadcastPermissionUpdate([id]);
        } catch (error) {
          console.error('Error broadcasting permission update:', error);
        }
      }

      return deletedUser;
    },

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    /**
     * Bulk update users
     */
    async bulkUpdate(params: UserBulkUpdateParams, ctx: UserServiceContext) {
      const { userIds, action } = params;

      if (userIds.length === 0) {
        throw new UserServiceError(
          'BAD_REQUEST',
          'No user IDs provided'
        );
      }

      const isActive = action === 'activate';

      const updatedUsers = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.bulkUpdate(db, userIds, { isActive });
      });

      // Broadcast permission updates
      if (hooks.broadcastPermissionUpdate) {
        try {
          await hooks.broadcastPermissionUpdate(userIds);
        } catch (error) {
          console.error('Error broadcasting permission updates:', error);
        }
      }

      return {
        success: true,
        updatedCount: updatedUsers.length,
        users: updatedUsers,
      };
    },

    /**
     * Bulk delete users
     */
    async bulkDelete(params: UserBulkDeleteParams, ctx: UserServiceContext) {
      const { userIds } = params;

      if (userIds.length === 0) {
        throw new UserServiceError(
          'BAD_REQUEST',
          'No user IDs provided'
        );
      }

      // Check for self-deletion attempt
      if (userIds.includes(ctx.userId)) {
        throw new UserServiceError(
          'FORBIDDEN',
          'Cannot delete your own account'
        );
      }

      const deletedUsers = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.bulkUpdate(db, userIds, { isActive: false });
      });

      return {
        success: true,
        deletedCount: deletedUsers.length,
        users: deletedUsers,
      };
    },

    // =========================================================================
    // ROLE MANAGEMENT
    // =========================================================================

    /**
     * Assign role to user
     */
    async assignRole(params: UserRoleAssignParams, ctx: UserServiceContext) {
      if (hooks.assignUserRole) {
        // Use centralized helper if provided
        await hooks.assignUserRole({
          userId: params.userId,
          orgId: params.orgId,
          roleId: params.roleId,
          assignedBy: params.assignedBy,
        });
      } else {
        // Use repository directly
        await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          await repo.assignRole(db, {
            userId: params.userId,
            roleId: params.roleId,
            orgId: params.orgId,
            isActive: true,
            assignedBy: params.assignedBy,
            assignedAt: new Date(),
          });
        });
      }

      return { success: true };
    },

    /**
     * Remove role from user
     */
    async removeRole(params: UserRoleRemoveParams, ctx: UserServiceContext) {
      let removedCount: number;

      if (hooks.removeUserRole) {
        // Use centralized helper if provided
        const result = await hooks.removeUserRole({
          userId: params.userId,
          orgId: params.orgId,
          roleId: params.roleId,
        });
        removedCount = result.length;
      } else {
        // Use repository directly
        removedCount = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          return await repo.removeRole(db, params.userId, params.roleId, params.orgId);
        });
      }

      if (removedCount === 0) {
        throw new UserServiceError(
          'NOT_FOUND',
          'User role assignment not found'
        );
      }

      return { success: true, removed: removedCount };
    },

    /**
     * Remove user from organization
     */
    async removeFromOrg(params: UserOrgRemoveParams, ctx: UserServiceContext) {
      let removedCount: number;

      if (hooks.removeUserRole) {
        // Use centralized helper if provided
        const result = await hooks.removeUserRole({
          userId: params.userId,
          orgId: params.orgId,
        });
        removedCount = result.length;
      } else {
        // Use repository directly
        removedCount = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          return await repo.removeAllRolesInOrg(db, params.userId, params.orgId);
        });
      }

      return { success: true, removed: removedCount };
    },

    // =========================================================================
    // PREFERENCES & SETTINGS
    // =========================================================================

    /**
     * Update session timeout preference
     */
    async updateSessionPreference(params: UpdateSessionPreferenceParams, ctx: UserServiceContext) {
      const updatedUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.updateSessionTimeout(db, params.userId, params.sessionTimeoutMinutes);
      });

      if (!updatedUser) {
        throw new UserServiceError('NOT_FOUND', 'User not found');
      }

      return {
        success: true,
        sessionTimeoutPreference: updatedUser.sessionTimeoutPreference ?? null,
      };
    },

    /**
     * Update theme preference
     */
    async updateThemePreference(params: UpdateThemePreferenceParams, ctx: UserServiceContext) {
      const updatedUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.updateThemePreference(db, params.userId, params.theme);
      });

      if (!updatedUser) {
        throw new UserServiceError('NOT_FOUND', 'User not found');
      }

      return {
        success: true,
        themePreference: updatedUser.themePreference ?? null,
      };
    },

    /**
     * Change password for the authenticated user
     */
    async changePassword(params: ChangePasswordParams, ctx: UserServiceContext) {
      const { userId, currentPassword, newPassword } = params;

      const user = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.findById(db, userId);
      });

      if (!user) {
        throw new UserServiceError('NOT_FOUND', 'User not found');
      }

      if (!user.password) {
        throw new UserServiceError(
          'BAD_REQUEST',
          'Password login is not enabled for this account. Please use password recovery instead.'
        );
      }

      const isCurrentPasswordValid = await hooks.comparePassword(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        throw new UserServiceError(
          'UNAUTHORIZED',
          'Current password is incorrect'
        );
      }

      if (currentPassword === newPassword) {
        throw new UserServiceError(
          'BAD_REQUEST',
          'New password must be different from your current password'
        );
      }

      const hashedPassword = await hooks.hashPassword(newPassword, 12);

      const updatedUser = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.updatePassword(db, userId, hashedPassword);
      });

      if (!updatedUser) {
        throw new UserServiceError(
          'INTERNAL_SERVER_ERROR',
          'Failed to update password'
        );
      }

      return { success: true, message: 'Password changed successfully' };
    },

    /**
     * Get current user settings
     */
    async getCurrentUserSettings(userId: number, ctx: UserServiceContext) {
      const settings = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.getUserSettings(db, userId);
      });

      if (!settings) {
        throw new UserServiceError('NOT_FOUND', 'User not found');
      }

      return settings;
    },

    // =========================================================================
    // USERNAME OPERATIONS
    // =========================================================================

    /**
     * Check username availability
     */
    async checkUsername(params: CheckUsernameParams, ctx: UserServiceContext) {
      const isAvailable = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.isUsernameAvailable(db, params.username, params.currentUserId);
      });

      let suggestions: string[] = [];
      if (!isAvailable) {
        suggestions = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          return await repo.generateUsernameSuggestions(db, params.username);
        });
      }

      return {
        isAvailable,
        username: params.username,
        suggestions,
      };
    },

    // =========================================================================
    // PERMISSIONS
    // =========================================================================

    /**
     * Get user permissions
     */
    async getMyPermissions(userId: number, ctx: UserServiceContext) {
      const currentOrgId = ctx.orgId;

      if (!currentOrgId) {
        return {
          permissions: [],
          roles: [],
        };
      }

      const result = await hooks.withPrivilegedDb(async (db) => {
        const repo = getRepo(db);
        return await repo.getUserPermissions(db, userId, currentOrgId);
      });

      return result;
    },

    // =========================================================================
    // PRIVATE HELPERS (exposed as methods for internal use)
    // =========================================================================

    /**
     * Assign standard user role to a user (private helper)
     */
    async assignStandardUserRole(
      userId: number,
      orgId: number,
      assignedBy: number,
      hooks: UserServiceHooks
    ) {
      try {
        // Find Standard User role for this org
        let standardUserRole = await hooks.withPrivilegedDb(async (db) => {
          const repo = getRepo(db);
          // Try to find Standard User role by querying roles in org
          // This is a simplified version - apps may want to provide their own implementation
          const roles = await repo.getUserRoles(db, userId, orgId);
          return roles.find(r => r.name === 'Standard User');
        });

        // If role doesn't exist and we have the copy templates hook, use it
        if (!standardUserRole && hooks.copyOrgRoleTemplates) {
          await hooks.copyOrgRoleTemplates(orgId);
        }

        // Try to assign the role using the hook if provided
        if (hooks.assignUserRole) {
          await hooks.assignUserRole({
            userId,
            orgId,
            assignedBy,
          });
        }
      } catch (error) {
        console.error('Error assigning default role:', error);
        // Don't fail the invite if role assignment fails
      }
    },
  } as IUserService & {
    assignStandardUserRole: (
      userId: number,
      orgId: number,
      assignedBy: number,
      hooks: UserServiceHooks
    ) => Promise<void>;
  };
}

// =============================================================================
// PRE-BUILT SDK SERVICE
// =============================================================================

import { SDKUserRepository } from './router-config';

/**
 * Default password hasher using simple approach
 * Apps should provide their own bcrypt implementation for production
 */
async function defaultHashPassword(password: string, _rounds?: number): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Default password comparator
 */
async function defaultComparePassword(password: string, hash: string): Promise<boolean> {
  const hashed = await defaultHashPassword(password);
  return hashed === hash;
}

/**
 * Create a default user service with minimal configuration.
 *
 * NOTE: This creates a service with basic password hashing (SHA-256).
 * For production, you should use createUserService with proper bcrypt:
 *
 * @example
 * ```typescript
 * import { createUserService, SDKUserRepository } from '@jetdevs/core/users';
 * import { withPrivilegedDb } from '@/db/clients';
 * import bcrypt from 'bcrypt';
 *
 * const userService = createUserService({
 *   hooks: {
 *     withPrivilegedDb,
 *     hashPassword: (p) => bcrypt.hash(p, 12),
 *     comparePassword: bcrypt.compare,
 *   },
 *   RepositoryClass: SDKUserRepository,
 * });
 * ```
 *
 * @param withPrivilegedDb - Function to execute queries with privileged database access
 */
export function createDefaultUserService(
  withPrivilegedDb: <T>(fn: (db: PostgresJsDatabase<any>) => Promise<T>) => Promise<T>
): IUserService {
  return createUserService({
    hooks: {
      withPrivilegedDb,
      hashPassword: defaultHashPassword,
      comparePassword: defaultComparePassword,
    },
    RepositoryClass: SDKUserRepository,
  });
}

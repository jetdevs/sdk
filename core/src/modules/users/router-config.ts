/**
 * User Router Configuration Factory
 *
 * Creates user router configuration for use with createRouterWithActor.
 * This factory pattern allows apps to inject their own dependencies while
 * reusing the core user management logic.
 *
 * @module @yobolabs/core/users
 */

import { z } from 'zod';
import { and, ilike, isNull } from 'drizzle-orm';
import {
  userFiltersSchema,
  userCreateSchema,
  userUpdateSchema,
  assignRoleSchema,
  removeRoleSchema,
  removeFromOrgSchema,
  changePasswordSchema,
  updateSessionPreferenceSchema,
  updateThemePreferenceSchema,
  checkUsernameSchema,
  userBulkUpdateSchema,
  userBulkDeleteSchema,
} from './schemas';
import type { IUserRepository } from './repository';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dependencies that must be provided by the consuming app
 */
export interface UserRouterDeps {
  /**
   * Repository class constructor - will be instantiated by createRouterWithActor
   */
  Repository: new (db: any) => IUserRepository;

  /**
   * Password hashing function (e.g., bcrypt.hash)
   */
  hashPassword: (password: string, rounds?: number) => Promise<string>;

  /**
   * Password comparison function (e.g., bcrypt.compare)
   */
  comparePassword: (password: string, hash: string) => Promise<boolean>;

  /**
   * Execute a function with privileged database access (bypasses RLS).
   * Required for operations like finding default roles across orgs.
   * Optional - if not provided, RLS-enabled db will be used.
   */
  withPrivilegedDb?: <T>(fn: (db: any) => Promise<T>) => Promise<T>;
}

/**
 * Service context from createRouterWithActor
 */
export interface UserServiceContext {
  db: any;
  orgId: number;
  userId: string;
}

/**
 * Handler context from createRouterWithActor
 */
export interface UserHandlerContext<TInput = any> {
  input: TInput;
  service: UserServiceContext;
  actor: any;
  db: any;
  repo: IUserRepository;
  ctx: any;
}

/**
 * Error class for user operations
 */
export class UserRouterError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'UserRouterError';
  }
}

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

/**
 * Create user router configuration for use with createRouterWithActor.
 *
 * This factory creates a configuration object that can be passed to
 * createRouterWithActor. It handles all common user management operations.
 *
 * @example
 * ```typescript
 * import { createUserRouterConfig } from '@yobolabs/core/users';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 * import { UserRepository } from '@/server/repos/user.repository';
 * import bcrypt from 'bcrypt';
 *
 * const userRouterConfig = createUserRouterConfig({
 *   Repository: UserRepository,
 *   hashPassword: (password) => bcrypt.hash(password, 10),
 *   comparePassword: bcrypt.compare,
 * });
 *
 * export const userRouter = createRouterWithActor(userRouterConfig);
 * ```
 */
export function createUserRouterConfig(deps: UserRouterDeps) {
  return {
    // -------------------------------------------------------------------------
    // GET ALL USERS WITH STATS (org-scoped)
    // -------------------------------------------------------------------------
    getAllWithStats: {
      type: 'query' as const,
      permission: 'user:read',
      input: userFiltersSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userFiltersSchema>>) => {
        const users = await repo.findAll(db, {
          limit: input.limit,
          offset: input.offset,
          filters: {
            search: input.search,
            isActive: input.isActive,
            roleId: input.roleId,
            orgId: input.orgId || service.orgId,
          },
        });

        const totalCount = await repo.count(db, {
          search: input.search,
          isActive: input.isActive,
          roleId: input.roleId,
          orgId: input.orgId || service.orgId,
        });

        // Get roles for users
        const userIds = users.map(u => u.id);
        const rolesByUser = await repo.getUserRolesBatch(db, userIds, service.orgId);

        const usersWithRoles = users.map(user => ({
          ...user,
          roles: rolesByUser.get(user.id) || [],
        }));

        return {
          users: usersWithRoles,
          totalCount,
          hasMore: input.offset + input.limit < totalCount,
        };
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL USERS (simple list)
    // -------------------------------------------------------------------------
    getAll: {
      type: 'query' as const,
      permission: 'user:read',
      repository: deps.Repository,
      handler: async ({ service, repo, db }: UserHandlerContext) => {
        return repo.findAll(db, {
          limit: 100,
          offset: 0,
          filters: { isActive: true, orgId: service.orgId },
        });
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL USERS SYSTEM-WIDE (admin only)
    // -------------------------------------------------------------------------
    getAllUsersSystem: {
      type: 'query' as const,
      permission: 'admin:manage',
      input: userFiltersSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userFiltersSchema>>) => {
        const users = await repo.findAll(db, {
          limit: input.limit,
          offset: input.offset,
          filters: {
            search: input.search,
            isActive: input.isActive,
            roleId: input.roleId,
            orgId: input.orgId,
          },
        });

        const totalCount = await repo.count(db, {
          search: input.search,
          isActive: input.isActive,
          roleId: input.roleId,
          orgId: input.orgId,
        });

        // Get roles for users (no org filter for system-wide)
        const userIds = users.map(u => u.id);
        const rolesByUser = await repo.getUserRolesBatch(db, userIds);

        const usersWithRoles = users.map(user => ({
          ...user,
          roles: rolesByUser.get(user.id) || [],
        }));

        return {
          users: usersWithRoles,
          totalCount,
          hasMore: input.offset + input.limit < totalCount,
        };
      },
    },

    // -------------------------------------------------------------------------
    // GET USER BY ID
    // -------------------------------------------------------------------------
    getById: {
      type: 'query' as const,
      permission: 'user:read',
      input: z.number(),
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<number>) => {
        const user = await repo.findById(db, input);
        if (!user) {
          throw new UserRouterError('NOT_FOUND', `User with ID ${input} not found`);
        }

        const roles = await repo.getUserRoles(db, input, service.orgId);
        return { ...user, roles };
      },
    },

    // -------------------------------------------------------------------------
    // INVITE USER (create or add existing to org)
    // -------------------------------------------------------------------------
    invite: {
      permission: 'user:create',
      input: userCreateSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userCreateSchema>>) => {
        /**
         * Find the global "Standard User" role.
         *
         * The "Standard User" role is a GLOBAL role with org_id = NULL.
         * Uses privileged db connection to bypass RLS since global roles
         * have org_id = NULL and would be filtered out by RLS policies.
         *
         * NO fallback logic - returns undefined if not found.
         */
        const findDefaultRoleId = async (): Promise<number | undefined> => {
          try {
            // Import roles table lazily to avoid circular dependencies
            const { roles } = await import('../../db/schema');

            // Query for the global "Standard User" role (org_id IS NULL)
            const queryGlobalRole = async (queryDb: any) => {
              const [defaultRole] = await queryDb
                .select({ id: roles.id })
                .from(roles)
                .where(and(
                  ilike(roles.name, 'Standard User'),
                  isNull(roles.orgId)  // GLOBAL role - org_id IS NULL
                ))
                .limit(1);

              return defaultRole;
            };

            // MUST use privileged db to bypass RLS (global roles have org_id = NULL)
            if (!deps.withPrivilegedDb) {
              console.warn('withPrivilegedDb not provided - cannot look up global Standard User role');
              return undefined;
            }

            const defaultRole = await deps.withPrivilegedDb(queryGlobalRole);
            return defaultRole?.id;
          } catch (error) {
            console.error('Error finding global Standard User role:', error);
            return undefined;
          }
        };

        // Check if user with email already exists
        const existing = await repo.findByEmail(db, input.email);

        if (existing) {
          // User exists - add to org with role
          // Use provided roleId or find global "Standard User" role
          let roleIdToAssign = input.roleId;
          if (!roleIdToAssign) {
            roleIdToAssign = await findDefaultRoleId();
          }

          if (roleIdToAssign && service.orgId) {
            const hasRole = await repo.hasRoleInOrg(db, existing.id, roleIdToAssign, service.orgId);
            if (!hasRole) {
              await repo.assignRole(db, {
                userId: existing.id,
                roleId: roleIdToAssign,
                orgId: service.orgId,
                assignedBy: parseInt(service.userId),
              });
            }
          }
          return existing;
        }

        // Create new user
        const newUser = await repo.create(db, {
          name: input.name,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          username: input.username,
          password: input.password,
          isActive: input.isActive,
          currentOrgId: service.orgId,
        });

        // Assign role - use provided roleId or find global "Standard User" role
        let roleIdToAssign = input.roleId;
        if (!roleIdToAssign) {
          roleIdToAssign = await findDefaultRoleId();
        }

        if (roleIdToAssign && service.orgId) {
          await repo.assignRole(db, {
            userId: newUser.id,
            roleId: roleIdToAssign,
            orgId: service.orgId,
            assignedBy: parseInt(service.userId),
          });
        }

        return newUser;
      },
    },

    // -------------------------------------------------------------------------
    // CREATE USER (system-wide admin)
    // -------------------------------------------------------------------------
    create: {
      permission: 'admin:manage',
      input: userCreateSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userCreateSchema>>) => {
        // Check if user with email already exists
        const existing = await repo.findByEmail(db, input.email);
        if (existing) {
          throw new UserRouterError('CONFLICT', 'User with this email already exists');
        }

        // Create new user
        const newUser = await repo.create(db, {
          name: input.name,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          username: input.username,
          password: input.password,
          isActive: input.isActive,
          currentOrgId: input.orgId,
        });

        // Assign role if provided
        if (input.roleId && input.orgId) {
          await repo.assignRole(db, {
            userId: newUser.id,
            roleId: input.roleId,
            orgId: input.orgId,
            assignedBy: parseInt(service.userId),
          });
        }

        return newUser;
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE USER
    // -------------------------------------------------------------------------
    update: {
      input: userUpdateSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userUpdateSchema>>) => {
        const { id, ...updateData } = input;

        // Verify user exists
        const existing = await repo.findById(db, id);
        if (!existing) {
          throw new UserRouterError('NOT_FOUND', `User with ID ${id} not found`);
        }

        return repo.update(db, id, updateData);
      },
    },

    // -------------------------------------------------------------------------
    // DELETE USER (soft delete)
    // -------------------------------------------------------------------------
    delete: {
      permission: 'user:delete',
      input: z.number(),
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<number>) => {
        // Verify user exists
        const existing = await repo.findById(db, input);
        if (!existing) {
          throw new UserRouterError('NOT_FOUND', `User with ID ${input} not found`);
        }

        // Prevent self-deletion
        if (input === parseInt(service.userId)) {
          throw new UserRouterError('FORBIDDEN', 'Cannot delete your own account');
        }

        return repo.softDelete(db, input);
      },
    },

    // -------------------------------------------------------------------------
    // BULK UPDATE USERS
    // -------------------------------------------------------------------------
    bulkUpdate: {
      permission: 'user:update',
      input: userBulkUpdateSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, repo, db }: UserHandlerContext<z.infer<typeof userBulkUpdateSchema>>) => {
        if (input.userIds.length === 0) {
          return { updated: 0 };
        }

        const updated = await repo.bulkUpdate(db, input.userIds, {
          isActive: input.isActive,
        });

        return { updated: updated.length };
      },
    },

    // -------------------------------------------------------------------------
    // BULK DELETE USERS
    // -------------------------------------------------------------------------
    bulkDelete: {
      permission: 'user:delete',
      input: userBulkDeleteSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userBulkDeleteSchema>>) => {
        // Filter out self-deletion
        const userIds = input.userIds.filter(id => id !== parseInt(service.userId));

        if (userIds.length === 0) {
          return { deleted: 0 };
        }

        const deleted = await repo.bulkUpdate(db, userIds, { isActive: false });
        return { deleted: deleted.length };
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE SESSION PREFERENCE
    // -------------------------------------------------------------------------
    updateSessionPreference: {
      input: updateSessionPreferenceSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof updateSessionPreferenceSchema>>) => {
        const userId = parseInt(service.userId);
        return repo.updateSessionTimeout(db, userId, input.sessionTimeoutMinutes);
      },
    },

    // -------------------------------------------------------------------------
    // CHANGE PASSWORD
    // -------------------------------------------------------------------------
    changePassword: {
      input: changePasswordSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof changePasswordSchema>>) => {
        const userId = parseInt(service.userId);
        const user = await repo.findById(db, userId);

        if (!user) {
          throw new UserRouterError('NOT_FOUND', 'User not found');
        }

        // Verify current password
        const isValid = user.password
          ? await deps.comparePassword(input.currentPassword, user.password)
          : false;

        if (!isValid) {
          throw new UserRouterError('UNAUTHORIZED', 'Current password is incorrect');
        }

        // Hash and update new password
        const hashedPassword = await deps.hashPassword(input.newPassword, 10);
        await repo.updatePassword(db, userId, hashedPassword);

        return { success: true };
      },
    },

    // -------------------------------------------------------------------------
    // GET CURRENT USER SETTINGS
    // -------------------------------------------------------------------------
    getCurrentUserSettings: {
      type: 'query' as const,
      repository: deps.Repository,
      handler: async ({ service, repo, db }: UserHandlerContext) => {
        const userId = parseInt(service.userId);
        const settings = await repo.getUserSettings(db, userId);

        if (!settings) {
          throw new UserRouterError('NOT_FOUND', 'User settings not found');
        }

        return settings;
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE THEME PREFERENCE
    // -------------------------------------------------------------------------
    updateThemePreference: {
      input: updateThemePreferenceSchema,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof updateThemePreferenceSchema>>) => {
        const userId = parseInt(service.userId);
        return repo.updateThemePreference(db, userId, input.theme);
      },
    },

    // -------------------------------------------------------------------------
    // CHECK USERNAME AVAILABILITY
    // -------------------------------------------------------------------------
    checkUsername: {
      type: 'query' as const,
      input: checkUsernameSchema,
      repository: deps.Repository,
      handler: async ({ input, repo, db }: UserHandlerContext<z.infer<typeof checkUsernameSchema>>) => {
        const isAvailable = await repo.isUsernameAvailable(db, input.username, input.excludeUserId);

        if (isAvailable) {
          return { available: true, suggestions: [] };
        }

        const suggestions = await repo.generateUsernameSuggestions(db, input.username, 3);
        return { available: false, suggestions };
      },
    },

    // -------------------------------------------------------------------------
    // GET MY PERMISSIONS
    // -------------------------------------------------------------------------
    getMyPermissions: {
      type: 'query' as const,
      repository: deps.Repository,
      handler: async ({ service, repo, db }: UserHandlerContext) => {
        const userId = parseInt(service.userId);
        return repo.getUserPermissions(db, userId, service.orgId);
      },
    },

    // -------------------------------------------------------------------------
    // ASSIGN ROLE
    // -------------------------------------------------------------------------
    assignRole: {
      permission: 'admin:role_management',
      input: assignRoleSchema,
      invalidates: ['users', 'roles'],
      entityType: 'user_role',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof assignRoleSchema>>) => {
        const orgId = input.orgId || service.orgId;

        if (!orgId) {
          throw new UserRouterError('BAD_REQUEST', 'Organization context required for role assignment');
        }

        // Check if already has role
        const hasRole = await repo.hasRoleInOrg(db, input.userId, input.roleId, orgId);
        if (hasRole) {
          throw new UserRouterError('CONFLICT', 'User already has this role in this organization');
        }

        await repo.assignRole(db, {
          userId: input.userId,
          roleId: input.roleId,
          orgId,
          assignedBy: parseInt(service.userId),
        });

        return { success: true };
      },
    },

    // -------------------------------------------------------------------------
    // REMOVE ROLE
    // -------------------------------------------------------------------------
    removeRole: {
      permission: 'admin:role_management',
      input: removeRoleSchema,
      invalidates: ['users', 'roles'],
      entityType: 'user_role',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof removeRoleSchema>>) => {
        const orgId = input.orgId || service.orgId;

        if (!orgId) {
          throw new UserRouterError('BAD_REQUEST', 'Organization context required for role removal');
        }

        const removed = await repo.removeRole(db, input.userId, input.roleId, orgId);

        if (removed === 0) {
          throw new UserRouterError('NOT_FOUND', 'Role assignment not found');
        }

        return { success: true };
      },
    },

    // -------------------------------------------------------------------------
    // REMOVE FROM ORGANIZATION
    // -------------------------------------------------------------------------
    removeFromOrg: {
      permission: 'admin:role_management',
      input: removeFromOrgSchema,
      invalidates: ['users', 'roles'],
      entityType: 'user_role',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof removeFromOrgSchema>>) => {
        const orgId = input.orgId || service.orgId;

        if (!orgId) {
          throw new UserRouterError('BAD_REQUEST', 'Organization context required for user removal');
        }

        const removed = await repo.removeAllRolesInOrg(db, input.userId, orgId);
        return { removed };
      },
    },
  };
}

// =============================================================================
// SDK PRE-BUILT REPOSITORY
// =============================================================================

import { createUserRepositoryClass } from './repository';
import {
  users,
  userRoles,
  roles,
  orgs,
  permissions,
  rolePermissions,
} from '../../db/schema';

/**
 * SDK User Repository
 *
 * A repository class configured with the SDK's own schema tables.
 * Useful for apps that don't need to customize the schema.
 *
 * @example
 * ```typescript
 * import { SDKUserRepository } from '@yobolabs/core/users';
 *
 * // Create repository instance
 * const repo = new SDKUserRepository(db);
 * const user = await repo.findById(db, userId);
 * ```
 */
export const SDKUserRepository = createUserRepositoryClass({
  users,
  userRoles,
  roles,
  orgs,
  permissions,
  rolePermissions,
});

// =============================================================================
// PRE-BUILT ROUTER CONFIG
// =============================================================================

/**
 * Default password hasher using simple approach
 * Apps should provide their own bcrypt implementation for production
 */
async function defaultHashPassword(password: string, _rounds?: number): Promise<string> {
  // Simple hash for development - apps should override with bcrypt
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
 * Pre-built user router configuration
 *
 * Uses the SDK's own UserRepository and schema.
 * Apps can use this directly without creating their own repository.
 *
 * NOTE: This uses a simple SHA-256 hash for passwords. For production,
 * you should use createUserRouterConfig with bcrypt:
 *
 * @example
 * ```typescript
 * // Option 1: Simple usage with SDK defaults (development only)
 * import { userRouterConfig } from '@yobolabs/core/users';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * export const userRouter = createRouterWithActor(userRouterConfig);
 *
 * // Option 2: Production usage with bcrypt
 * import { createUserRouterConfig, SDKUserRepository } from '@yobolabs/core/users';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 * import bcrypt from 'bcrypt';
 *
 * const userRouterConfig = createUserRouterConfig({
 *   Repository: SDKUserRepository,
 *   hashPassword: (password) => bcrypt.hash(password, 10),
 *   comparePassword: bcrypt.compare,
 * });
 *
 * export const userRouter = createRouterWithActor(userRouterConfig);
 * ```
 */
export const userRouterConfig = createUserRouterConfig({
  Repository: SDKUserRepository,
  hashPassword: defaultHashPassword,
  comparePassword: defaultComparePassword,
});

/**
 * User Router Configuration Factory
 *
 * Creates user router configuration for use with createRouterWithActor.
 * This factory pattern allows apps to inject their own dependencies while
 * reusing the core user management logic.
 *
 * @module @jetdevs/core/users
 */

import { and, ilike, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { IUserRepository } from './repository';
import {
    assignRoleSchema,
    changePasswordSchema,
    checkUsernameSchema,
    removeFromOrgSchema,
    removeRoleSchema,
    updateSessionPreferenceSchema,
    updateThemePreferenceSchema,
    userBulkDeleteSchema,
    userBulkUpdateSchema,
    userCreateSchema,
    userFiltersSchema,
    userUpdateSchema,
} from './schemas';

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
 * orgId can be null for system users accessing global data
 */
export interface UserServiceContext {
  db: any;
  orgId: number | null;
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
 * import { createUserRouterConfig } from '@jetdevs/core/users';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
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
            // Convert null to undefined for repository compatibility
            orgId: input.orgId ?? (service.orgId ?? undefined),
          },
        });

        const totalCount = await repo.count(db, {
          search: input.search,
          isActive: input.isActive,
          roleId: input.roleId,
          orgId: input.orgId ?? (service.orgId ?? undefined),
        });

        // Get roles for users
        const userIds = users.map(u => u.id);
        // Convert null to undefined for repository compatibility
        const rolesByUser = await repo.getUserRolesBatch(db, userIds, service.orgId ?? undefined);

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
          // Convert null to undefined for repository compatibility
          filters: { isActive: true, orgId: service.orgId ?? undefined },
        });
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL USERS SYSTEM-WIDE (admin only)
    // -------------------------------------------------------------------------
    getAllUsersSystem: {
      type: 'query' as const,
      permission: 'admin:manage',
      crossOrg: true, // Required to see user roles across ALL organizations, not just current org
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

        // Convert null to undefined for repository compatibility
        const roles = await repo.getUserRoles(db, input, service.orgId ?? undefined);
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

        // Hash password before storing
        const hashedPassword = input.password
          ? await deps.hashPassword(input.password, 10)
          : undefined;

        // Derive name from firstName/lastName if not provided
        const derivedName = input.name ||
          [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
          input.email.split('@')[0];  // Fallback to email username

        // Create new user
        const newUser = await repo.create(db, {
          name: derivedName,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          username: input.username,
          password: hashedPassword,
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
      crossOrg: true,
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

        // Hash password before storing
        const hashedPassword = input.password
          ? await deps.hashPassword(input.password, 10)
          : undefined;

        // Derive name from firstName/lastName if not provided
        const derivedName = input.name ||
          [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
          input.email.split('@')[0];  // Fallback to email username

        // Create new user
        const newUser = await repo.create(db, {
          name: derivedName,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          username: input.username,
          password: hashedPassword,
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
      crossOrg: true,
      invalidates: ['users'],
      entityType: 'user',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: UserHandlerContext<z.infer<typeof userUpdateSchema>>) => {
        // DEBUG: Log incoming input to trace password flow
        console.log('[SDK User Update] Input received:', JSON.stringify({
          id: input.id,
          hasPassword: !!input.password,
          passwordLength: input.password?.length,
          allKeys: Object.keys(input),
        }));

        const { id, password, ...updateData } = input;

        // DEBUG: Log after destructuring
        console.log('[SDK User Update] After destructuring:', JSON.stringify({
          hasPassword: !!password,
          passwordLength: password?.length,
          updateDataKeys: Object.keys(updateData),
        }));

        // Verify user exists
        const existing = await repo.findById(db, id);
        if (!existing) {
          throw new UserRouterError('NOT_FOUND', `User with ID ${id} not found`);
        }

        // Hash password if provided
        const finalUpdateData = { ...updateData } as typeof updateData & { password?: string };
        if (password) {
          finalUpdateData.password = await deps.hashPassword(password, 10);
          console.log('[SDK User Update] Password hashed and added to finalUpdateData');
        }

        // DEBUG: Log final update data
        console.log('[SDK User Update] Final update data:', JSON.stringify({
          hasPassword: !!finalUpdateData.password,
          allKeys: Object.keys(finalUpdateData),
        }));

        return repo.update(db, id, finalUpdateData);
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
        // Convert null to undefined for repository compatibility
        return repo.getUserPermissions(db, userId, service.orgId ?? undefined);
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

import {
    orgs,
    permissions,
    rolePermissions,
    roles,
    userRoles,
    users,
} from '../../db/schema';
import { createUserRepositoryClass } from './repository';

/**
 * SDK User Repository
 *
 * A repository class configured with the SDK's own schema tables.
 * Useful for apps that don't need to customize the schema.
 *
 * @example
 * ```typescript
 * import { SDKUserRepository } from '@jetdevs/core/users';
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
 * Default password hasher - THROWS ERROR in production
 *
 * This function exists only to prevent runtime crashes when apps don't configure
 * password hashing. It will throw an error to force apps to provide proper bcrypt.
 *
 * @deprecated Always provide your own bcrypt implementation via createUserRouterConfig
 */
async function defaultHashPassword(password: string, _rounds?: number): Promise<string> {
  // SECURITY: Throw error to prevent weak password hashing
  // Apps MUST provide bcrypt implementation
  throw new Error(
    '[SECURITY ERROR] Password hashing not configured! ' +
    'You must provide hashPassword and comparePassword functions using bcrypt. ' +
    'Example: createUserRouterConfig({ hashPassword: (p) => bcrypt.hash(p, 10), comparePassword: bcrypt.compare })'
  );
}

/**
 * Default password comparator - THROWS ERROR in production
 *
 * @deprecated Always provide your own bcrypt implementation via createUserRouterConfig
 */
async function defaultComparePassword(password: string, hash: string): Promise<boolean> {
  // SECURITY: Throw error to prevent weak password comparison
  // Apps MUST provide bcrypt implementation
  throw new Error(
    '[SECURITY ERROR] Password comparison not configured! ' +
    'You must provide hashPassword and comparePassword functions using bcrypt. ' +
    'Example: createUserRouterConfig({ hashPassword: (p) => bcrypt.hash(p, 10), comparePassword: bcrypt.compare })'
  );
}

/**
 * Pre-built user router configuration
 *
 * @deprecated DO NOT USE IN PRODUCTION - This will throw an error when password
 * operations are attempted. Always use createUserRouterConfig with bcrypt.
 *
 * Uses the SDK's own UserRepository and schema but has NO password hashing
 * configured. Any password operation will throw a security error.
 *
 * @example
 * ```typescript
 * // REQUIRED: Production usage with bcrypt
 * import { createUserRouterConfig, SDKUserRepository } from '@jetdevs/core/users';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
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

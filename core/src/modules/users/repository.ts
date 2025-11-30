/**
 * User Repository Factory
 *
 * Creates a user repository class with injected schema dependencies.
 * This factory pattern allows apps to inject their own schema while
 * reusing the repository logic from core.
 *
 * @module @yobolabs/core/users
 */

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  like,
  not,
  or,
  count,
  type SQL,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgTable } from 'drizzle-orm/pg-core';

import type {
  UserWithRoles,
  UserRole,
  UserFilters,
  UserListOptions,
  UserCreateData,
  UserUpdateData,
  UserRoleAssignment,
  UserPermissionsData,
} from './types';

// =============================================================================
// SCHEMA INTERFACE
// =============================================================================

/**
 * Schema dependencies required by the user repository
 */
export interface UserRepositorySchema {
  users: PgTable & {
    id: any;
    uuid: any;
    name: any;
    firstName: any;
    lastName: any;
    email: any;
    phone: any;
    username: any;
    password: any;
    isActive: any;
    avatar: any;
    sessionTimeoutPreference: any;
    themePreference: any;
    currentOrgId: any;
    createdAt: any;
    updatedAt: any;
  };
  userRoles: PgTable & {
    id: any;
    userId: any;
    roleId: any;
    orgId: any;
    isActive: any;
    assignedBy: any;
    assignedAt: any;
  };
  roles: PgTable & {
    id: any;
    uuid: any;
    name: any;
    description: any;
    orgId: any;
    isSystemRole: any;
    isGlobalRole: any;
  };
  orgs: PgTable & {
    id: any;
    name: any;
  };
  permissions: PgTable & {
    id: any;
    slug: any;
    isActive: any;
  };
  rolePermissions: PgTable & {
    roleId: any;
    permissionId: any;
  };
}

// =============================================================================
// REPOSITORY INTERFACE
// =============================================================================

/**
 * Interface for the User Repository
 */
export interface IUserRepository {
  // CRUD operations
  findAll(db: any, options: UserListOptions): Promise<UserWithRoles[]>;
  findByOrgId(db: any, orgId: number): Promise<number[]>;
  count(db: any, filters: UserFilters): Promise<number>;
  findById(db: any, id: number): Promise<UserWithRoles | null>;
  findByEmail(db: any, email: string): Promise<UserWithRoles | null>;
  findByUsername(db: any, username: string): Promise<UserWithRoles | null>;
  create(db: any, data: UserCreateData): Promise<UserWithRoles>;
  update(db: any, id: number, data: UserUpdateData): Promise<UserWithRoles>;
  softDelete(db: any, id: number): Promise<UserWithRoles>;
  bulkUpdate(db: any, userIds: number[], data: Partial<UserUpdateData>): Promise<UserWithRoles[]>;

  // Role operations
  getUserRoles(db: any, userId: number, orgId?: number): Promise<UserRole[]>;
  getUserRolesBatch(db: any, userIds: number[], orgId?: number): Promise<Map<number, UserRole[]>>;
  assignRole(db: any, assignment: UserRoleAssignment): Promise<void>;
  removeRole(db: any, userId: number, roleId: number, orgId: number): Promise<number>;
  removeAllRolesInOrg(db: any, userId: number, orgId: number): Promise<number>;
  hasRoleInOrg(db: any, userId: number, roleId: number, orgId: number): Promise<boolean>;

  // Permission operations
  getUserPermissions(db: any, userId: number, orgId?: number): Promise<UserPermissionsData>;

  // Username operations
  isUsernameAvailable(db: any, username: string, excludeUserId?: number): Promise<boolean>;
  generateUsernameSuggestions(db: any, baseUsername: string, count?: number): Promise<string[]>;

  // Settings operations
  updatePassword(db: any, userId: number, hashedPassword: string): Promise<UserWithRoles | null>;
  updateSessionTimeout(db: any, userId: number, timeoutMinutes: number): Promise<UserWithRoles>;
  updateThemePreference(db: any, userId: number, theme: string): Promise<UserWithRoles>;
  getUserSettings(db: any, userId: number): Promise<any>;
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Create a User Repository class with injected schema dependencies.
 *
 * @example
 * ```typescript
 * import { createUserRepositoryClass } from '@yobolabs/core/users';
 * import { users, userRoles, roles, orgs, permissions, rolePermissions } from '@/db/schema';
 *
 * const UserRepositoryBase = createUserRepositoryClass({
 *   users, userRoles, roles, orgs, permissions, rolePermissions
 * });
 *
 * // Extend with app-specific methods if needed
 * export class UserRepository extends UserRepositoryBase {
 *   async getWithOrgData(db: any, id: number) {
 *     // App-specific implementation
 *   }
 * }
 * ```
 */
export function createUserRepositoryClass(schema: UserRepositorySchema) {
  const { users, userRoles, roles, orgs, permissions, rolePermissions } = schema;

  return class UserRepository implements IUserRepository {
    // -------------------------------------------------------------------------
    // USER CRUD OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get all users with filtering and pagination
     */
    async findAll(db: PostgresJsDatabase<any>, options: UserListOptions): Promise<UserWithRoles[]> {
      const { limit, offset, filters, sortBy = 'createdAt', sortOrder = 'desc' } = options;

      // Build where conditions
      const whereConditions: SQL<unknown>[] = [];

      if (filters.search) {
        const searchCondition = or(
          like(users.name, `%${filters.search}%`),
          like(users.email, `%${filters.search}%`),
          like(users.firstName, `%${filters.search}%`),
          like(users.lastName, `%${filters.search}%`)
        );
        if (searchCondition) whereConditions.push(searchCondition);
      }

      if (typeof filters.isActive === 'boolean') {
        whereConditions.push(eq(users.isActive, filters.isActive));
      }

      if (filters.excludeUserId) {
        whereConditions.push(not(eq(users.id, filters.excludeUserId)));
      }

      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      // Build order by
      const orderByColumn =
        sortBy === 'name' ? users.name :
        sortBy === 'email' ? users.email :
        users.createdAt;
      const orderByClause = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);

      const result = await db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);

      return result as unknown as UserWithRoles[];
    }

    /**
     * Get user IDs by organization ID
     */
    async findByOrgId(db: PostgresJsDatabase<any>, orgId: number): Promise<number[]> {
      const result = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.orgId, orgId))
        .groupBy(userRoles.userId);

      return result.map((r: any) => r.userId);
    }

    /**
     * Count total users matching filters
     */
    async count(db: PostgresJsDatabase<any>, filters: UserFilters): Promise<number> {
      const whereConditions: SQL<unknown>[] = [];

      if (filters.search) {
        const searchCondition = or(
          like(users.name, `%${filters.search}%`),
          like(users.email, `%${filters.search}%`),
          like(users.firstName, `%${filters.search}%`),
          like(users.lastName, `%${filters.search}%`)
        );
        if (searchCondition) whereConditions.push(searchCondition);
      }

      if (typeof filters.isActive === 'boolean') {
        whereConditions.push(eq(users.isActive, filters.isActive));
      }

      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      const result = await db
        .select({ count: count() })
        .from(users)
        .where(whereClause);

      return (result[0]?.count as number) || 0;
    }

    /**
     * Get user by ID
     */
    async findById(db: PostgresJsDatabase<any>, id: number): Promise<UserWithRoles | null> {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return (result[0] as unknown as UserWithRoles) || null;
    }

    /**
     * Get user by email
     */
    async findByEmail(db: PostgresJsDatabase<any>, email: string): Promise<UserWithRoles | null> {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return (result[0] as unknown as UserWithRoles) || null;
    }

    /**
     * Get user by username
     */
    async findByUsername(db: PostgresJsDatabase<any>, username: string): Promise<UserWithRoles | null> {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      return (result[0] as unknown as UserWithRoles) || null;
    }

    /**
     * Create new user
     */
    async create(db: PostgresJsDatabase<any>, data: UserCreateData): Promise<UserWithRoles> {
      const result = await db
        .insert(users)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();

      return result[0] as unknown as UserWithRoles;
    }

    /**
     * Update user
     */
    async update(db: PostgresJsDatabase<any>, id: number, data: UserUpdateData): Promise<UserWithRoles> {
      const result = await db
        .update(users)
        .set({
          ...data,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, id))
        .returning();

      return result[0] as unknown as UserWithRoles;
    }

    /**
     * Soft delete user (set isActive = false)
     */
    async softDelete(db: PostgresJsDatabase<any>, id: number): Promise<UserWithRoles> {
      const result = await db
        .update(users)
        .set({
          isActive: false,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, id))
        .returning();

      return result[0] as unknown as UserWithRoles;
    }

    /**
     * Bulk update users
     */
    async bulkUpdate(db: PostgresJsDatabase<any>, userIds: number[], data: Partial<UserUpdateData>): Promise<UserWithRoles[]> {
      const result = await db
        .update(users)
        .set({
          ...data,
          updatedAt: new Date(),
        } as any)
        .where(inArray(users.id, userIds))
        .returning();

      return result as unknown as UserWithRoles[];
    }

    // -------------------------------------------------------------------------
    // USER ROLE OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get user roles for a specific user
     */
    async getUserRoles(db: PostgresJsDatabase<any>, userId: number, orgId?: number): Promise<UserRole[]> {
      const whereConditions: SQL<unknown>[] = [eq(userRoles.userId, userId)];

      if (orgId) {
        whereConditions.push(eq(userRoles.orgId, orgId));
      }

      const result = await db
        .select({
          roleId: userRoles.roleId,
          roleName: roles.name,
          roleDescription: roles.description,
          orgId: userRoles.orgId,
          orgName: orgs.name,
          isActive: userRoles.isActive,
          assignedAt: userRoles.assignedAt,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .innerJoin(orgs, eq(userRoles.orgId, orgs.id))
        .where(and(...whereConditions));

      return result.map((r: any) => ({
        id: r.roleId,
        roleId: r.roleId,
        name: r.roleName,
        description: r.roleDescription,
        orgId: r.orgId,
        orgName: r.orgName,
        isActive: r.isActive,
        joinedAt: r.assignedAt,
      }));
    }

    /**
     * Get user roles for multiple users (batch operation)
     */
    async getUserRolesBatch(db: PostgresJsDatabase<any>, userIds: number[], orgId?: number): Promise<Map<number, UserRole[]>> {
      const whereConditions: SQL<unknown>[] = [inArray(userRoles.userId, userIds)];

      if (orgId) {
        // Include both org-scoped roles AND system roles (org_id IS NULL)
        const orgCondition = or(
          eq(userRoles.orgId, orgId),
          isNull(userRoles.orgId)
        );
        if (orgCondition) whereConditions.push(orgCondition);
      }

      const result = await db
        .select({
          userId: userRoles.userId,
          roleId: userRoles.roleId,
          roleName: roles.name,
          roleDescription: roles.description,
          orgId: userRoles.orgId,
          orgName: orgs.name,
          isActive: userRoles.isActive,
          assignedAt: userRoles.assignedAt,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .leftJoin(orgs, eq(userRoles.orgId, orgs.id)) // Use leftJoin for system roles
        .where(and(...whereConditions));

      // Group roles by user
      const rolesByUser = new Map<number, UserRole[]>();

      result.forEach((r: any) => {
        if (!rolesByUser.has(r.userId)) {
          rolesByUser.set(r.userId, []);
        }

        rolesByUser.get(r.userId)!.push({
          id: r.roleId,
          roleId: r.roleId,
          name: r.roleName,
          description: r.roleDescription,
          orgId: r.orgId,
          orgName: r.orgName,
          isActive: r.isActive,
          joinedAt: r.assignedAt,
        });
      });

      return rolesByUser;
    }

    /**
     * Assign role to user
     */
    async assignRole(db: PostgresJsDatabase<any>, assignment: UserRoleAssignment): Promise<void> {
      await db.insert(userRoles).values({
        userId: assignment.userId,
        roleId: assignment.roleId,
        orgId: assignment.orgId,
        isActive: assignment.isActive ?? true,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt ?? new Date(),
      } as any);
    }

    /**
     * Remove role from user
     */
    async removeRole(db: PostgresJsDatabase<any>, userId: number, roleId: number, orgId: number): Promise<number> {
      const result = await db
        .delete(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.orgId, orgId)
        ))
        .returning();

      return result.length;
    }

    /**
     * Remove all roles for a user in an organization
     */
    async removeAllRolesInOrg(db: PostgresJsDatabase<any>, userId: number, orgId: number): Promise<number> {
      const result = await db
        .delete(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.orgId, orgId)
        ))
        .returning();

      return result.length;
    }

    /**
     * Check if user has role in organization
     */
    async hasRoleInOrg(db: PostgresJsDatabase<any>, userId: number, roleId: number, orgId: number): Promise<boolean> {
      const result = await db
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.orgId, orgId),
          eq(userRoles.isActive, true)
        ))
        .limit(1);

      return result.length > 0;
    }

    // -------------------------------------------------------------------------
    // USER PERMISSION OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get user permissions
     */
    async getUserPermissions(db: PostgresJsDatabase<any>, userId: number, orgId?: number): Promise<UserPermissionsData> {
      // Get user roles
      const userRolesList = await db
        .select({
          roleId: userRoles.roleId,
          orgId: userRoles.orgId,
          roleName: roles.name,
          roleDescription: roles.description,
          roleUuid: roles.uuid,
          isSystemRole: roles.isSystemRole,
          isGlobalRole: roles.isGlobalRole,
          roleOrgId: roles.orgId,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.isActive, true)
        ));

      // Filter roles based on org context
      const relevantRoles = userRolesList.filter((ur: any) => {
        if (orgId && ur.orgId === orgId) return true;
        if (ur.isSystemRole && (ur.roleOrgId === null || ur.roleOrgId === -1)) return true;
        if (ur.isGlobalRole && ur.roleOrgId === null) return true;
        return false;
      });

      // Get permissions for all relevant roles
      let userPermissions: string[] = [];
      const roleIds = relevantRoles.map((r: any) => r.roleId);

      if (roleIds.length > 0) {
        const rolePerms = await db
          .select({ slug: permissions.slug })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(and(
            inArray(rolePermissions.roleId, roleIds),
            eq(permissions.isActive, true)
          ));

        userPermissions = [...new Set(rolePerms.map((p: any) => p.slug))];
      }

      // Format roles for response
      const rolesData = relevantRoles.map((r: any) => ({
        id: r.roleId,
        uuid: r.roleUuid,
        name: r.roleName,
        description: r.roleDescription,
        orgId: r.roleOrgId,
        isSystemRole: r.isSystemRole,
        isGlobalRole: r.isGlobalRole,
      }));

      return {
        permissions: userPermissions,
        roles: rolesData,
      };
    }

    // -------------------------------------------------------------------------
    // USERNAME OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Check if username is available
     */
    async isUsernameAvailable(db: PostgresJsDatabase<any>, username: string, excludeUserId?: number): Promise<boolean> {
      const whereConditions: SQL<unknown>[] = [eq(users.username, username)];

      if (excludeUserId) {
        whereConditions.push(not(eq(users.id, excludeUserId)));
      }

      const result = await db
        .select({ id: users.id })
        .from(users)
        .where(and(...whereConditions))
        .limit(1);

      return result.length === 0;
    }

    /**
     * Generate username suggestions
     */
    async generateUsernameSuggestions(db: PostgresJsDatabase<any>, baseUsername: string, suggestionCount: number = 3): Promise<string[]> {
      const suggestions: string[] = [];

      // Try adding numbers 1-9
      for (let i = 1; i <= 9 && suggestions.length < suggestionCount; i++) {
        const suggestion = `${baseUsername}${i}`;
        if (await this.isUsernameAvailable(db, suggestion)) {
          suggestions.push(suggestion);
        }
      }

      // If still need suggestions, try random numbers
      if (suggestions.length < suggestionCount) {
        for (let i = 0; i < 10 && suggestions.length < suggestionCount; i++) {
          const randomNum = Math.floor(Math.random() * 900) + 100;
          const suggestion = `${baseUsername}${randomNum}`;
          if (await this.isUsernameAvailable(db, suggestion) && !suggestions.includes(suggestion)) {
            suggestions.push(suggestion);
          }
        }
      }

      return suggestions;
    }

    // -------------------------------------------------------------------------
    // SESSION & PREFERENCE OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Update user password
     */
    async updatePassword(db: PostgresJsDatabase<any>, userId: number, hashedPassword: string): Promise<UserWithRoles | null> {
      const result = await db
        .update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, userId))
        .returning();

      return (result[0] as unknown as UserWithRoles) || null;
    }

    /**
     * Update session timeout preference
     */
    async updateSessionTimeout(db: PostgresJsDatabase<any>, userId: number, timeoutMinutes: number): Promise<UserWithRoles> {
      const result = await db
        .update(users)
        .set({
          sessionTimeoutPreference: timeoutMinutes,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, userId))
        .returning();

      return result[0] as unknown as UserWithRoles;
    }

    /**
     * Update theme preference
     */
    async updateThemePreference(db: PostgresJsDatabase<any>, userId: number, theme: string): Promise<UserWithRoles> {
      const result = await db
        .update(users)
        .set({
          themePreference: theme,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, userId))
        .returning();

      return result[0] as unknown as UserWithRoles;
    }

    /**
     * Get user settings
     */
    async getUserSettings(db: PostgresJsDatabase<any>, userId: number) {
      const result = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          sessionTimeoutPreference: users.sessionTimeoutPreference,
          avatar: users.avatar,
          phone: users.phone,
          themePreference: users.themePreference,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return result[0] || null;
    }
  };
}

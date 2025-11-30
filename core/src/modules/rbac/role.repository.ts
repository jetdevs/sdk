/**
 * Role Repository
 *
 * Handles all database operations for role-related data.
 * Provides a clean data access layer with proper type safety and RLS support.
 * Manages role-permission relationships and role hierarchy.
 *
 * @module @yobolabs/core/rbac
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  not,
  or,
  type SQL,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type {
  Role,
  RoleCreateData,
  RoleFilters,
  RoleListOptions,
  RoleListResult,
  RolePermission,
  RolePermissionAssignment,
  RolePermissionStats,
  RoleUpdateData,
  RoleWithStats,
  UserRoleStats,
} from "./types";

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

/**
 * Role Repository - Data access layer for role management
 *
 * @example
 * ```typescript
 * import { RoleRepository } from '@yobolabs/core/rbac';
 *
 * const repo = new RoleRepository(db, schema);
 * const roles = await repo.list({ limit: 10, offset: 0, filters: {} });
 * ```
 */
export class RoleRepository {
  private roles: any;
  private permissions: any;
  private rolePermissions: any;
  private userRoles: any;

  constructor(
    private db: PostgresJsDatabase<any>,
    schema: {
      roles: any;
      permissions: any;
      rolePermissions: any;
      userRoles: any;
    }
  ) {
    this.roles = schema.roles;
    this.permissions = schema.permissions;
    this.rolePermissions = schema.rolePermissions;
    this.userRoles = schema.userRoles;
  }

  /**
   * Build where conditions for role queries
   */
  private buildRoleConditions(
    filters: RoleFilters,
    orgId?: number,
    includeSystemRoles: boolean = false
  ): SQL | undefined {
    const conditions: SQL[] = [];

    // Search filter
    if (filters.search) {
      conditions.push(
        or(
          like(this.roles.name, `%${filters.search}%`),
          like(this.roles.description, `%${filters.search}%`)
        )!
      );
    }

    // Active filter
    if (typeof filters.isActive === "boolean") {
      conditions.push(eq(this.roles.isActive, filters.isActive));
    }

    // System role filter
    if (typeof filters.isSystemRole === "boolean") {
      conditions.push(eq(this.roles.isSystemRole, filters.isSystemRole));
    }

    // Global role filter
    if (typeof filters.isGlobalRole === "boolean") {
      conditions.push(eq(this.roles.isGlobalRole, filters.isGlobalRole));
    }

    // Organization filter
    if (filters.orgId !== undefined) {
      if (filters.orgId === null) {
        conditions.push(isNull(this.roles.orgId));
      } else {
        conditions.push(eq(this.roles.orgId, filters.orgId));
      }
    }

    // Default org scope for non-system operations
    if (!includeSystemRoles && orgId) {
      conditions.push(
        or(
          eq(this.roles.orgId, orgId), // Org-specific roles
          and(
            isNull(this.roles.orgId), // Global roles have null orgId
            eq(this.roles.isGlobalRole, true), // Must be global role
            eq(this.roles.isSystemRole, false) // But NOT system role
          )
        )!
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * List roles with optional stats and filtering
   */
  async list(options: RoleListOptions): Promise<RoleListResult> {
    const {
      limit,
      offset,
      filters,
      includeStats,
      includePermissions,
      orgId,
      includeSystemRoles,
    } = options;

    // Build where clause
    const whereClause = this.buildRoleConditions(
      filters,
      orgId,
      includeSystemRoles
    );

    // Get roles
    const rolesData = (await this.db
      .select()
      .from(this.roles)
      .where(whereClause)
      .orderBy(desc(this.roles.createdAt))
      .limit(limit)
      .offset(offset)) as Role[];

    // Initialize result array with default stats values
    let result: RoleWithStats[] = rolesData.map((role) => ({
      ...role,
      permissions: undefined,
    }));

    // Fetch stats if requested
    if (includeStats && rolesData.length > 0) {
      const roleIds = rolesData.map((r) => r.id);

      // Get permission counts
      const permissionStats = await this.getPermissionStats(roleIds, orgId);
      const permissionStatsMap = new Map(
        permissionStats.map((s) => [s.roleId, s.permissionCount])
      );

      // Get user counts
      const userStats = await this.getUserStats(roleIds, orgId);
      const userStatsMap = new Map(
        userStats.map((s) => [s.roleId, s.userCount])
      );

      // Map stats to roles (both nested and flat for compatibility)
      result = result.map((role) => {
        const permissionCount = permissionStatsMap.get(role.id) || 0;
        const userCount = userStatsMap.get(role.id) || 0;
        return {
          ...role,
          stats: { permissionCount, userCount },
          permissionCount,
          userCount,
        };
      });
    }

    // Fetch permissions if requested
    if (includePermissions && rolesData.length > 0) {
      const roleIds = rolesData.map((r) => r.id);
      const rolePermissionsData = await this.getRolePermissions(roleIds, orgId);

      // Group permissions by role
      const permissionsByRole = new Map<
        number,
        typeof rolePermissionsData
      >();
      for (const perm of rolePermissionsData) {
        const rolePerms = permissionsByRole.get(perm.roleId) || [];
        rolePerms.push(perm);
        permissionsByRole.set(perm.roleId, rolePerms);
      }

      // Map permissions to roles
      result = result.map((role) => ({
        ...role,
        permissions:
          permissionsByRole.get(role.id)?.map((p) => ({
            id: p.permissionId,
            slug: p.permissionSlug,
            name: p.permissionName,
            description: p.permissionDescription,
            category: p.permissionCategory,
          })) || [],
      }));
    }

    // Get total count
    const totalCountResult = await this.db
      .select({ count: count() })
      .from(this.roles)
      .where(whereClause);

    const totalCount = totalCountResult[0]?.count || 0;

    return {
      roles: result,
      totalCount,
      hasMore: offset + limit < totalCount,
    };
  }

  /**
   * Get role by ID with optional details
   */
  async getById(
    id: number,
    options: {
      includeStats?: boolean;
      includePermissions?: boolean;
      orgId?: number;
      includeSystemRoles?: boolean;
    } = {}
  ): Promise<RoleWithStats | null> {
    const { includeStats, includePermissions, orgId, includeSystemRoles } =
      options;

    // Build access conditions
    const accessConditions: SQL[] = [eq(this.roles.id, id)];

    if (!includeSystemRoles && orgId) {
      accessConditions.push(
        or(
          eq(this.roles.orgId, orgId),
          and(
            isNull(this.roles.orgId),
            eq(this.roles.isGlobalRole, true),
            eq(this.roles.isSystemRole, false)
          )
        )!
      );
    }

    const [role] = (await this.db
      .select()
      .from(this.roles)
      .where(and(...accessConditions))
      .limit(1)) as Role[];

    if (!role) {
      return null;
    }

    let resultWithStats: RoleWithStats = {
      ...role,
      stats: undefined,
      permissions: undefined,
    };

    // Choose org context for permissions/stats:
    // - Use explicit orgId if provided
    // - Otherwise default to the role's own orgId (may be null for global)
    const permissionOrgContext = orgId !== undefined ? orgId : role.orgId;

    // Fetch stats if requested
    if (includeStats) {
      const [permissionCount, userCount] = await Promise.all([
        this.getPermissionCount(id, permissionOrgContext),
        this.getUserCount(id, orgId),
      ]);

      resultWithStats.stats = { permissionCount, userCount };
      // Also set flat properties for backward compatibility
      resultWithStats.permissionCount = permissionCount;
      resultWithStats.userCount = userCount;
    }

    // Fetch permissions if requested
    if (includePermissions) {
      const rolePerms = await this.getRolePermissions([id], permissionOrgContext);
      resultWithStats.permissions = rolePerms.map((p) => ({
        id: p.permissionId,
        slug: p.permissionSlug,
        name: p.permissionName,
        description: p.permissionDescription,
        category: p.permissionCategory,
      }));
    }

    return resultWithStats;
  }

  /**
   * Check if role name exists in organization
   */
  async nameExists(
    name: string,
    orgId?: number | null,
    excludeId?: number
  ): Promise<boolean> {
    const conditions: SQL[] = [eq(this.roles.name, name)];

    if (orgId !== undefined) {
      if (orgId === null) {
        conditions.push(isNull(this.roles.orgId));
      } else {
        conditions.push(eq(this.roles.orgId, orgId));
      }
    }

    if (excludeId) {
      conditions.push(not(eq(this.roles.id, excludeId)));
    }

    const [existing] = await this.db
      .select({ id: this.roles.id })
      .from(this.roles)
      .where(and(...conditions))
      .limit(1);

    return !!existing;
  }

  /**
   * Create a new role
   */
  async create(data: RoleCreateData): Promise<RoleWithStats> {
    const [newRole] = await this.db
      .insert(this.roles)
      .values({
        name: data.name,
        description: data.description || null,
        isSystemRole: data.isSystemRole || false,
        isGlobalRole: data.isGlobalRole || false,
        isActive: data.isActive !== false,
        orgId: data.orgId ?? null,
      })
      .returning();

    return {
      ...newRole,
      stats: {
        permissionCount: 0,
        userCount: 0,
      },
      permissions: [],
    };
  }

  /**
   * Update an existing role
   */
  async update(data: RoleUpdateData): Promise<RoleWithStats | null> {
    const { id, ...updateData } = data;

    const [updatedRole] = (await this.db
      .update(this.roles)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(this.roles.id, id))
      .returning()) as Role[];

    if (!updatedRole) {
      return null;
    }

    return {
      ...updatedRole,
      stats: undefined,
      permissions: undefined,
    };
  }

  /**
   * Soft delete a role
   */
  async softDelete(id: number): Promise<boolean> {
    const [deleted] = await this.db
      .update(this.roles)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(this.roles.id, id))
      .returning({ id: this.roles.id });

    return !!deleted;
  }

  /**
   * Hard delete a role (use with caution)
   */
  async hardDelete(id: number): Promise<boolean> {
    const [deleted] = await this.db
      .delete(this.roles)
      .where(eq(this.roles.id, id))
      .returning({ id: this.roles.id });

    return !!deleted;
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissions(assignment: RolePermissionAssignment): Promise<void> {
    const { roleId, permissionIds, orgId } = assignment;

    // Remove existing permissions scoped to the same org context
    const deleteConditions: SQL[] = [eq(this.rolePermissions.roleId, roleId)];

    if (orgId === null) {
      deleteConditions.push(isNull(this.rolePermissions.orgId));
    } else if (orgId !== undefined) {
      deleteConditions.push(eq(this.rolePermissions.orgId, orgId));
    }

    await this.db
      .delete(this.rolePermissions)
      .where(and(...deleteConditions));

    // Add new permissions
    if (permissionIds.length > 0) {
      const values = permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
        orgId: orgId ?? null,
      }));

      await this.db.insert(this.rolePermissions).values(values);
    }
  }

  /**
   * Remove specific permissions from a role
   */
  async removePermissions(
    roleId: number,
    permissionIds: number[],
    orgId: number | null
  ): Promise<void> {
    if (permissionIds.length === 0) return;

    const conditions: SQL[] = [
      eq(this.rolePermissions.roleId, roleId),
      inArray(this.rolePermissions.permissionId, permissionIds),
    ];

    if (orgId === null) {
      conditions.push(isNull(this.rolePermissions.orgId));
    } else if (orgId !== undefined) {
      conditions.push(eq(this.rolePermissions.orgId, orgId));
    }

    await this.db.delete(this.rolePermissions).where(and(...conditions));
  }

  /**
   * Get permissions for multiple roles
   */
  async getRolePermissions(roleIds: number[], orgId?: number | null) {
    if (roleIds.length === 0) return [];

    const conditions: SQL[] = [inArray(this.rolePermissions.roleId, roleIds)];

    if (orgId === null) {
      conditions.push(isNull(this.rolePermissions.orgId));
    } else if (orgId !== undefined) {
      // Include org-scoped records plus shared (null) definitions
      conditions.push(
        or(
          eq(this.rolePermissions.orgId, orgId),
          isNull(this.rolePermissions.orgId)
        )!
      );
    }

    return await this.db
      .select({
        roleId: this.rolePermissions.roleId,
        permissionId: this.permissions.id,
        permissionSlug: this.permissions.slug,
        permissionName: this.permissions.name,
        permissionDescription: this.permissions.description,
        permissionCategory: this.permissions.category,
      })
      .from(this.rolePermissions)
      .innerJoin(
        this.permissions,
        eq(this.permissions.id, this.rolePermissions.permissionId)
      )
      .where(and(...conditions))
      .orderBy(asc(this.permissions.category), asc(this.permissions.name));
  }

  /**
   * Get the first org context where a role has permissions
   * Used as a fallback for global roles when no org is explicitly selected.
   */
  async getFirstPermissionOrgId(roleId: number): Promise<number | null | undefined> {
    const [row] = await this.db
      .select({ orgId: this.rolePermissions.orgId })
      .from(this.rolePermissions)
      .where(eq(this.rolePermissions.roleId, roleId))
      .orderBy(asc(this.rolePermissions.orgId))
      .limit(1);

    return row?.orgId;
  }

  /**
   * Get permission count for a role
   */
  async getPermissionCount(
    roleId: number,
    orgId?: number | null
  ): Promise<number> {
    const conditions: SQL[] = [eq(this.rolePermissions.roleId, roleId)];

    if (orgId === null) {
      conditions.push(isNull(this.rolePermissions.orgId));
    } else if (orgId !== undefined) {
      conditions.push(
        or(
          eq(this.rolePermissions.orgId, orgId),
          isNull(this.rolePermissions.orgId)
        )!
      );
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(this.rolePermissions)
      .where(and(...conditions));

    return result?.count || 0;
  }

  /**
   * Get permission stats for multiple roles
   */
  async getPermissionStats(
    roleIds: number[],
    orgId?: number | null
  ): Promise<RolePermissionStats[]> {
    if (roleIds.length === 0) return [];

    const conditions: SQL[] = [inArray(this.rolePermissions.roleId, roleIds)];

    if (orgId === null) {
      conditions.push(isNull(this.rolePermissions.orgId));
    } else if (orgId !== undefined) {
      conditions.push(
        or(
          eq(this.rolePermissions.orgId, orgId),
          isNull(this.rolePermissions.orgId)
        )!
      );
    }

    const results = await this.db
      .select({
        roleId: this.rolePermissions.roleId,
        permissionCount: count(),
      })
      .from(this.rolePermissions)
      .where(and(...conditions))
      .groupBy(this.rolePermissions.roleId);

    return results.map((r: { roleId: number; permissionCount: number }) => ({
      roleId: r.roleId,
      permissionCount: Number(r.permissionCount),
    }));
  }

  /**
   * Get user count for a role
   * Includes both org-specific assignments and system role assignments (orgId = null)
   */
  async getUserCount(roleId: number, orgId?: number): Promise<number> {
    const conditions: SQL[] = [
      eq(this.userRoles.roleId, roleId),
      eq(this.userRoles.isActive, true),
    ];

    // Include assignments for the specific org AND system role assignments (orgId = null)
    if (orgId) {
      conditions.push(
        or(
          eq(this.userRoles.orgId, orgId),
          isNull(this.userRoles.orgId) // Include system role assignments
        )!
      );
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(this.userRoles)
      .where(and(...conditions));

    return result?.count || 0;
  }

  /**
   * Get user stats for multiple roles
   * Includes both org-specific assignments and system role assignments (orgId = null)
   */
  async getUserStats(
    roleIds: number[],
    orgId?: number
  ): Promise<UserRoleStats[]> {
    if (roleIds.length === 0) return [];

    const conditions: SQL[] = [
      inArray(this.userRoles.roleId, roleIds),
      eq(this.userRoles.isActive, true),
    ];

    // Include assignments for the specific org AND system role assignments (orgId = null)
    if (orgId !== undefined) {
      conditions.push(
        or(
          eq(this.userRoles.orgId, orgId),
          isNull(this.userRoles.orgId) // Include system role assignments
        )!
      );
    }

    const results = await this.db
      .select({
        roleId: this.userRoles.roleId,
        userCount: count(),
      })
      .from(this.userRoles)
      .where(and(...conditions))
      .groupBy(this.userRoles.roleId);

    return results.map((r: { roleId: number; userCount: number }) => ({
      roleId: r.roleId,
      userCount: Number(r.userCount),
    }));
  }

  /**
   * Get users with a specific role
   * Includes both org-specific assignments and system role assignments (orgId = null)
   */
  async getRoleUsers(roleId: number, orgId?: number | null) {
    const conditions: SQL[] = [
      eq(this.userRoles.roleId, roleId),
      eq(this.userRoles.isActive, true),
    ];

    // Include assignments for the specific org AND system role assignments (orgId = null)
    if (orgId !== undefined) {
      conditions.push(
        or(
          eq(this.userRoles.orgId, orgId),
          isNull(this.userRoles.orgId) // Include system role assignments
        )!
      );
    }

    return await this.db
      .select({
        userId: this.userRoles.userId,
        orgId: this.userRoles.orgId,
        assignedAt: this.userRoles.createdAt,
      })
      .from(this.userRoles)
      .where(and(...conditions));
  }

  /**
   * Check if role has active users
   */
  async hasActiveUsers(roleId: number, orgId?: number | null): Promise<boolean> {
    const countResult = await this.getUserCount(roleId, orgId ?? undefined);
    return countResult > 0;
  }

  /**
   * Bulk update roles
   */
  async bulkUpdate(
    roleIds: number[],
    updates: Partial<RoleUpdateData>
  ): Promise<number> {
    if (roleIds.length === 0) return 0;

    const result = await this.db
      .update(this.roles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(inArray(this.roles.id, roleIds))
      .returning({ id: this.roles.id });

    return result.length;
  }

  /**
   * Get system roles
   */
  async getSystemRoles(): Promise<RoleWithStats[]> {
    const systemRoles = (await this.db
      .select()
      .from(this.roles)
      .where(eq(this.roles.isSystemRole, true))
      .orderBy(asc(this.roles.name))) as Role[];

    return systemRoles.map((role) => ({
      ...role,
      stats: undefined,
      permissions: undefined,
    }));
  }

  /**
   * Get global roles (non-system)
   */
  async getGlobalRoles(): Promise<RoleWithStats[]> {
    const globalRoles = (await this.db
      .select()
      .from(this.roles)
      .where(
        and(
          eq(this.roles.isGlobalRole, true),
          eq(this.roles.isSystemRole, false)
        )
      )
      .orderBy(asc(this.roles.name))) as Role[];

    return globalRoles.map((role) => ({
      ...role,
      stats: undefined,
      permissions: undefined,
    }));
  }

  /**
   * Get organization-specific roles
   */
  async getOrgRoles(orgId: number): Promise<RoleWithStats[]> {
    const orgRoles = (await this.db
      .select()
      .from(this.roles)
      .where(eq(this.roles.orgId, orgId))
      .orderBy(asc(this.roles.name))) as Role[];

    return orgRoles.map((role) => ({
      ...role,
      stats: undefined,
      permissions: undefined,
    }));
  }

  /**
   * Copy role with permissions
   */
  async copyRole(
    sourceRoleId: number,
    targetOrgId: number,
    newName?: string
  ): Promise<RoleWithStats> {
    // Get source role
    const sourceRole = await this.getById(sourceRoleId, {
      includePermissions: true,
    });
    if (!sourceRole) {
      throw new Error(`Role ${sourceRoleId} not found`);
    }

    // Create new role
    const newRole = await this.create({
      name: newName || `${sourceRole.name} (Copy)`,
      description: sourceRole.description || undefined,
      isSystemRole: false,
      isGlobalRole: false,
      isActive: true,
      orgId: targetOrgId,
    });

    // Copy permissions if any
    if (sourceRole.permissions && sourceRole.permissions.length > 0) {
      const permissionIds = sourceRole.permissions.map((p) => p.id);
      await this.assignPermissions({
        roleId: newRole.id,
        permissionIds,
        orgId: targetOrgId,
      });
    }

    return (await this.getById(newRole.id, {
      includePermissions: true,
    })) as RoleWithStats;
  }
}

// =============================================================================
// PRE-BUILT SDK REPOSITORY
// =============================================================================

// Import SDK schema tables (lazy to avoid circular deps)
import {
  roles as sdkRoles,
  permissions as sdkPermissions,
  rolePermissions as sdkRolePermissions,
  userRoles as sdkUserRoles,
} from "../../db/schema/rbac";

/**
 * Pre-built SDK schema for role repository
 */
export const sdkRoleRepositorySchema = {
  roles: sdkRoles,
  permissions: sdkPermissions,
  rolePermissions: sdkRolePermissions,
  userRoles: sdkUserRoles,
};

/**
 * Pre-built RoleRepository class that uses SDK schema tables.
 *
 * Use this for zero-boilerplate role repository setup.
 * Apps can extend this class if they need custom behavior.
 *
 * @example
 * ```typescript
 * // Zero-boilerplate usage with createRouterWithActor
 * import { SDKRoleRepository, roleRouterConfig } from '@yobolabs/core/rbac';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * const roleRouter = createRouterWithActor(roleRouterConfig);
 * ```
 *
 * @example
 * ```typescript
 * // Direct usage
 * import { SDKRoleRepository } from '@yobolabs/core/rbac';
 *
 * const repo = new SDKRoleRepository(db);
 * const roles = await repo.list({ limit: 10, offset: 0, filters: {} });
 * ```
 */
export class SDKRoleRepository extends RoleRepository {
  constructor(db: PostgresJsDatabase<any>) {
    super(db, sdkRoleRepositorySchema);
  }
}

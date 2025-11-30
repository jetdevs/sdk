/**
 * Permission Repository
 *
 * Handles all database operations for permission-related data.
 * Provides a clean data access layer for permission management.
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
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type {
  CategoryCount,
  Permission,
  PermissionCreateData,
  PermissionStats,
  PermissionUpdateData,
  PermissionWithUsage,
} from "./types";

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

/**
 * Permission Repository - Data access layer for permission management
 *
 * @example
 * ```typescript
 * import { PermissionRepository } from '@yobolabs/core/rbac';
 *
 * const repo = new PermissionRepository(db, schema);
 * const permissions = await repo.findAll();
 * ```
 */
export class PermissionRepository {
  private permissions: any;
  private rolePermissions: any;
  private roles: any;

  constructor(
    private db: PostgresJsDatabase<any>,
    schema: {
      permissions: any;
      rolePermissions: any;
      roles: any;
    }
  ) {
    this.permissions = schema.permissions;
    this.rolePermissions = schema.rolePermissions;
    this.roles = schema.roles;
  }

  /**
   * Get all active permissions
   */
  async findAll(): Promise<Permission[]> {
    return (await this.db
      .select()
      .from(this.permissions)
      .where(eq(this.permissions.isActive, true))
      .orderBy(asc(this.permissions.category), asc(this.permissions.name))) as Permission[];
  }

  /**
   * Get all active permissions with usage count and roles array
   */
  async findAllWithUsage(): Promise<PermissionWithUsage[]> {
    // Get all permissions with their role counts
    const permissionsList = await this.db
      .select({
        id: this.permissions.id,
        slug: this.permissions.slug,
        name: this.permissions.name,
        description: this.permissions.description,
        category: this.permissions.category,
        isActive: this.permissions.isActive,
        createdAt: this.permissions.createdAt,
        updatedAt: this.permissions.updatedAt,
        roleCount: count(this.rolePermissions.roleId),
      })
      .from(this.permissions)
      .leftJoin(
        this.rolePermissions,
        eq(this.permissions.id, this.rolePermissions.permissionId)
      )
      .where(eq(this.permissions.isActive, true))
      .groupBy(this.permissions.id)
      .orderBy(asc(this.permissions.category), asc(this.permissions.name));

    // Get permission IDs that have roles
    const permissionIds = permissionsList
      .filter((p: { roleCount: number }) => p.roleCount > 0)
      .map((p: { id: number }) => p.id);

    // Batch fetch all roles for permissions (N+1 prevention)
    let rolesMap = new Map<
      number,
      Array<{ roleId: number; roleName: string; isSystemRole: boolean }>
    >();

    if (permissionIds.length > 0) {
      const roleData = await this.db
        .select({
          permissionId: this.rolePermissions.permissionId,
          roleId: this.roles.id,
          roleName: this.roles.name,
          isSystemRole: this.roles.isSystemRole,
        })
        .from(this.rolePermissions)
        .innerJoin(this.roles, eq(this.rolePermissions.roleId, this.roles.id))
        .where(inArray(this.rolePermissions.permissionId, permissionIds))
        .orderBy(asc(this.roles.name));

      // Group by permissionId
      for (const row of roleData) {
        const existing = rolesMap.get(row.permissionId) || [];
        existing.push({
          roleId: row.roleId,
          roleName: row.roleName,
          isSystemRole: row.isSystemRole,
        });
        rolesMap.set(row.permissionId, existing);
      }
    }

    // Combine permissions with their roles
    return permissionsList.map((p: Permission & { roleCount: number }) => ({
      ...p,
      roles: rolesMap.get(p.id) || [],
    }));
  }

  /**
   * Get permissions by category
   */
  async findByCategory(category: string): Promise<Permission[]> {
    return (await this.db
      .select()
      .from(this.permissions)
      .where(eq(this.permissions.category, category))
      .orderBy(asc(this.permissions.name))) as Permission[];
  }

  /**
   * Get permission by slug
   */
  async findBySlug(slug: string): Promise<Permission | null> {
    const [permission] = (await this.db
      .select()
      .from(this.permissions)
      .where(eq(this.permissions.slug, slug))
      .limit(1)) as Permission[];

    return permission || null;
  }

  /**
   * Get permission by ID
   */
  async findById(id: number): Promise<Permission | null> {
    const [permission] = (await this.db
      .select()
      .from(this.permissions)
      .where(eq(this.permissions.id, id))
      .limit(1)) as Permission[];

    return permission || null;
  }

  /**
   * Get distinct categories
   */
  async getCategories(): Promise<string[]> {
    const result = await this.db
      .selectDistinct({ category: this.permissions.category })
      .from(this.permissions)
      .where(eq(this.permissions.isActive, true))
      .orderBy(asc(this.permissions.category));

    return result
      .map((r: { category: string | null }) => r.category)
      .filter((c: string | null): c is string => c !== null);
  }

  /**
   * Get categories with counts
   */
  async getCategoriesWithCounts(): Promise<CategoryCount[]> {
    const result = await this.db
      .select({
        category: this.permissions.category,
        count: count(),
      })
      .from(this.permissions)
      .where(eq(this.permissions.isActive, true))
      .groupBy(this.permissions.category)
      .orderBy(asc(this.permissions.category));

    return result.filter(
      (r: { category: string | null }) => r.category !== null
    );
  }

  /**
   * Get permissions for a specific role
   */
  async findByRoleId(roleId: number): Promise<Permission[]> {
    return await this.db
      .select({
        id: this.permissions.id,
        slug: this.permissions.slug,
        name: this.permissions.name,
        description: this.permissions.description,
        category: this.permissions.category,
        isActive: this.permissions.isActive,
        createdAt: this.permissions.createdAt,
        updatedAt: this.permissions.updatedAt,
      })
      .from(this.permissions)
      .innerJoin(
        this.rolePermissions,
        eq(this.permissions.id, this.rolePermissions.permissionId)
      )
      .where(eq(this.rolePermissions.roleId, roleId))
      .orderBy(asc(this.permissions.category), asc(this.permissions.name));
  }

  /**
   * Get roles that have a specific permission
   */
  async getRolesWithPermission(
    permissionId: number
  ): Promise<Array<{ roleId: number; roleName: string; isSystemRole: boolean }>> {
    return await this.db
      .select({
        roleId: this.roles.id,
        roleName: this.roles.name,
        isSystemRole: this.roles.isSystemRole,
      })
      .from(this.roles)
      .innerJoin(
        this.rolePermissions,
        eq(this.roles.id, this.rolePermissions.roleId)
      )
      .where(eq(this.rolePermissions.permissionId, permissionId))
      .orderBy(asc(this.roles.name));
  }

  /**
   * Get permission statistics
   */
  async getStats(): Promise<PermissionStats> {
    // Total permissions
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(this.permissions)
      .where(eq(this.permissions.isActive, true));

    // Permissions by category
    const categoryCounts = await this.getCategoriesWithCounts();

    // Most used permissions (by role count)
    const mostUsedPermissions = await this.db
      .select({
        permissionId: this.permissions.id,
        slug: this.permissions.slug,
        name: this.permissions.name,
        roleCount: count(),
      })
      .from(this.permissions)
      .leftJoin(
        this.rolePermissions,
        eq(this.permissions.id, this.rolePermissions.permissionId)
      )
      .where(eq(this.permissions.isActive, true))
      .groupBy(
        this.permissions.id,
        this.permissions.slug,
        this.permissions.name
      )
      .orderBy(desc(count()))
      .limit(10);

    return {
      totalPermissions: totalResult?.count || 0,
      categoryCounts,
      mostUsedPermissions,
    };
  }

  /**
   * Create new permission
   */
  async create(data: PermissionCreateData): Promise<Permission> {
    const [permission] = (await this.db
      .insert(this.permissions)
      .values({
        ...data,
        isActive: data.isActive ?? true,
      })
      .returning()) as Permission[];

    return permission;
  }

  /**
   * Update permission
   */
  async update(
    id: number,
    data: PermissionUpdateData
  ): Promise<Permission | null> {
    const [permission] = (await this.db
      .update(this.permissions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(this.permissions.id, id))
      .returning()) as Permission[];

    return permission || null;
  }

  /**
   * Soft delete permission (set isActive to false)
   */
  async softDelete(id: number): Promise<Permission | null> {
    const [permission] = (await this.db
      .update(this.permissions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(this.permissions.id, id))
      .returning()) as Permission[];

    return permission || null;
  }

  /**
   * Check if permission slug exists
   */
  async slugExists(slug: string, excludeId?: number): Promise<boolean> {
    const conditions = [eq(this.permissions.slug, slug)];

    if (excludeId) {
      conditions.push(eq(this.permissions.id, excludeId));
    }

    const [existing] = await this.db
      .select({ id: this.permissions.id })
      .from(this.permissions)
      .where(and(...conditions))
      .limit(1);

    return !!existing;
  }
}

// =============================================================================
// SDK PRE-BUILT REPOSITORY
// =============================================================================

/**
 * SDK Permission Repository schema - uses SDK's own schema tables.
 * Loaded lazily to avoid circular dependencies.
 */
let _sdkPermissionSchema: { permissions: any; rolePermissions: any; roles: any } | null = null;

function getSDKPermissionSchema() {
  if (!_sdkPermissionSchema) {
    // Lazy load to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require('../../db/schema');
    _sdkPermissionSchema = {
      permissions: schema.permissions,
      rolePermissions: schema.rolePermissions,
      roles: schema.roles,
    };
  }
  return _sdkPermissionSchema;
}

/**
 * Pre-built Permission Repository class using SDK's schema.
 *
 * This is a zero-config class for apps that use the SDK's standard schema.
 * For apps with custom schema, use `PermissionRepository` with schema injection instead.
 *
 * @example
 * ```typescript
 * import { SDKPermissionRepository } from '@yobolabs/core/rbac';
 * import { createPermissionRouterConfig } from '@yobolabs/core/trpc/routers';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * export const permissionRouter = createRouterWithActor(
 *   createPermissionRouterConfig({ Repository: SDKPermissionRepository })
 * );
 * ```
 */
export class SDKPermissionRepository extends PermissionRepository {
  constructor(db: PostgresJsDatabase<any>) {
    super(db, getSDKPermissionSchema());
  }
}

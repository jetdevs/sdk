/**
 * Role Service
 *
 * Business logic layer for role management.
 * Handles validation, orchestration, and business rules for role operations.
 * Framework-agnostic - does not depend on tRPC or app-specific code.
 *
 * @module @jetdevs/core/rbac
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { RoleRepository } from "./role.repository";
import type {
    Actor,
    RbacServiceContext,
    RoleAssignPermissionsParams,
    RoleBulkDeleteParams,
    RoleBulkUpdateParams,
    RoleCreateParams,
    RoleDeleteParams,
    RoleGetByIdParams,
    RoleListParams,
    RoleRemovePermissionsParams,
    RoleUpdateParams
} from "./types";

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * RBAC-specific error class
 */
export class RbacError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "CONFLICT"
      | "BAD_REQUEST"
      | "INTERNAL_ERROR",
    public cause?: unknown
  ) {
    super(message);
    this.name = "RbacError";
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Standard admin permission slug used for system role management.
 * This is the default permission required to manage/view system roles.
 * Apps can override this by providing custom hooks.
 */
export const ADMIN_FULL_ACCESS_PERMISSION = "admin:full_access";

// =============================================================================
// HOOK TYPES
// =============================================================================

/**
 * Hooks that apps can provide to extend service behavior
 */
export interface RoleServiceHooks {
  /**
   * Called after permissions are assigned to a role
   * Use this to broadcast real-time updates to affected users
   * Default: no-op (does nothing)
   */
  onPermissionsChanged?: (
    roleId: number,
    userIds: number[],
    ctx: RbacServiceContext
  ) => Promise<void>;

  /**
   * Called to check if actor can manage system roles
   * Default: checks for "admin:full_access" permission
   */
  canManageSystemRoles?: (actor: Actor) => boolean;

  /**
   * Called to check if actor can view system roles
   * Default: uses canManageSystemRoles (requires admin:full_access)
   */
  canViewSystemRoles?: (actor: Actor) => boolean;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

/**
 * Role Service - Business logic for role management
 *
 * @example
 * ```typescript
 * import { RoleService } from '@jetdevs/core/rbac';
 *
 * const service = new RoleService(schema, {
 *   onPermissionsChanged: async (roleId, userIds) => {
 *     // Broadcast real-time updates
 *   }
 * });
 *
 * const roles = await service.list({}, ctx);
 * ```
 */
export class RoleService {
  private schema: {
    roles: any;
    permissions: any;
    rolePermissions: any;
    userRoles: any;
  };
  private hooks: RoleServiceHooks;

  constructor(
    schema: {
      roles: any;
      permissions: any;
      rolePermissions: any;
      userRoles: any;
    },
    hooks: RoleServiceHooks = {}
  ) {
    this.schema = schema;
    this.hooks = hooks;
  }

  /**
   * Check if actor can manage system roles
   * Default: requires "admin:full_access" permission
   */
  private canManageSystemRoles(actor: Actor): boolean {
    if (this.hooks.canManageSystemRoles) {
      return this.hooks.canManageSystemRoles(actor);
    }
    // Default: check for admin:full_access permission (more restrictive, safer)
    return actor.permissions?.includes(ADMIN_FULL_ACCESS_PERMISSION) || false;
  }

  /**
   * Check if actor can view system roles
   */
  private canViewSystemRoles(actor: Actor): boolean {
    if (this.hooks.canViewSystemRoles) {
      return this.hooks.canViewSystemRoles(actor);
    }
    return this.canManageSystemRoles(actor);
  }

  /**
   * Create repository instance
   */
  private createRepo(db: PostgresJsDatabase<any>): RoleRepository {
    return new RoleRepository(db, this.schema);
  }

  /**
   * List roles with filtering and pagination
   */
  async list(params: RoleListParams, ctx: RbacServiceContext) {
    const {
      limit = 10,
      offset = 0,
      search,
      isActive,
      isSystemRole,
      includeStats = false,
      includePermissions = false,
    } = params;

    const repo = this.createRepo(ctx.db);
    const includeSystemRoles = this.canViewSystemRoles(ctx.actor);

    // For org-scoped queries, use orgId from context
    // For system queries, don't filter by org
    const orgId =
      ctx.isSystemUser && includeSystemRoles ? undefined : ctx.orgId ?? undefined;

    // The repository's buildRoleConditions handles system role exclusion
    // based on includeSystemRoles flag. When includeSystemRoles is false,
    // it automatically adds isSystemRole = false condition.
    // When includeSystemRoles is true, users can optionally filter by isSystemRole.
    return await repo.list({
      limit,
      offset,
      filters: {
        search,
        isActive,
        // Only pass isSystemRole filter when user is authorized to view system roles
        // The repository will automatically exclude system roles when not authorized
        isSystemRole: includeSystemRoles ? isSystemRole : undefined,
      },
      includeStats,
      includePermissions,
      orgId,
      includeSystemRoles,
    });
  }

  /**
   * Get all roles for system-wide view
   */
  async listAllSystem(
    params: RoleListParams & { orgId?: number },
    ctx: RbacServiceContext
  ) {
    if (!ctx.isSystemUser) {
      throw new RbacError(
        "System role required for cross-organization access",
        "FORBIDDEN"
      );
    }

    const {
      limit = 50,
      offset = 0,
      search,
      isActive,
      isSystemRole,
      includeStats = true,
    } = params;

    const repo = this.createRepo(ctx.db);

    return await repo.list({
      limit,
      offset,
      filters: {
        search,
        isActive,
        isSystemRole,
        orgId: params.orgId,
      },
      includeStats,
      includePermissions: false,
      orgId: params.orgId, // Pass orgId at root level for getUserStats
      includeSystemRoles: true, // System users can see all roles
    });
  }

  /**
   * Get all active roles for dropdown/selection
   */
  async getAllActive(ctx: RbacServiceContext) {
    const repo = this.createRepo(ctx.db);
    const includeSystemRoles = this.canViewSystemRoles(ctx.actor);

    const result = await repo.list({
      limit: 1000, // Get all for dropdown
      offset: 0,
      filters: {
        isActive: true,
      },
      includeStats: false,
      includePermissions: false,
      orgId: ctx.orgId ?? undefined,
      includeSystemRoles,
    });

    return result.roles;
  }

  /**
   * Get role by ID with details
   */
  async getById(params: RoleGetByIdParams, ctx: RbacServiceContext) {
    const { id, includeStats = false, includePermissions = false } = params;

    const repo = this.createRepo(ctx.db);
    const includeSystemRoles = this.canViewSystemRoles(ctx.actor);

    const role = await repo.getById(id, {
      includeStats,
      includePermissions,
      orgId: ctx.orgId ?? undefined,
      includeSystemRoles,
    });

    if (!role) {
      throw new RbacError(`Role with ID ${id} not found`, "NOT_FOUND");
    }

    // Additional check for system roles
    if (role.isSystemRole && !includeSystemRoles) {
      throw new RbacError("Cannot access system roles", "FORBIDDEN");
    }

    return role;
  }

  /**
   * Get role with permissions
   */
  async getWithPermissions(roleId: number, ctx: RbacServiceContext) {
    const repo = this.createRepo(ctx.db);
    const includeSystemRoles = this.canViewSystemRoles(ctx.actor);

    // Determine the org context for permissions:
    // - Prefer the requested orgId from context
    // - If not provided (system user viewing global role), fall back to the first org with permissions
    let permissionOrgId = ctx.orgId;
    if (permissionOrgId === null || permissionOrgId === undefined) {
      const fallbackOrgId = await repo.getFirstPermissionOrgId(roleId);
      // If no permissions exist anywhere, stick with null so call still succeeds
      permissionOrgId = fallbackOrgId ?? null;
    }

    const role = await repo.getById(roleId, {
      includeStats: false,
      includePermissions: true,
      orgId: permissionOrgId ?? undefined,
      includeSystemRoles,
    });

    if (!role) {
      throw new RbacError(`Role with ID ${roleId} not found`, "NOT_FOUND");
    }

    return role;
  }

  /**
   * Create new role
   */
  async create(params: RoleCreateParams, ctx: RbacServiceContext) {
    const { name, description, isSystemRole, isActive } = params;

    // Validate system role creation
    if (isSystemRole && !this.canManageSystemRoles(ctx.actor)) {
      throw new RbacError(
        "Cannot create system roles without admin permissions",
        "FORBIDDEN"
      );
    }

    const repo = this.createRepo(ctx.db);

    // Check if name already exists in org
    const nameExists = await repo.nameExists(name, ctx.orgId);
    if (nameExists) {
      throw new RbacError(
        "A role with this name already exists in this organization",
        "CONFLICT"
      );
    }

    try {
      const newRole = await repo.create({
        name,
        description,
        isSystemRole: isSystemRole || false,
        isGlobalRole: false, // Org-scoped by default
        isActive: isActive !== false,
        orgId: ctx.orgId,
      });

      return newRole;
    } catch (error) {
      throw new RbacError("Failed to create role", "INTERNAL_ERROR", error);
    }
  }

  /**
   * Update existing role
   */
  async update(params: RoleUpdateParams, ctx: RbacServiceContext) {
    const { id, name, description, isActive } = params;

    const repo = this.createRepo(ctx.db);

    // Get existing role to check permissions
    const existingRole = await repo.getById(id, {
      orgId: ctx.orgId ?? undefined,
      includeSystemRoles: this.canViewSystemRoles(ctx.actor),
    });

    if (!existingRole) {
      throw new RbacError("Role not found", "NOT_FOUND");
    }

    // Prevent modification of system roles
    if (existingRole.isSystemRole && !this.canManageSystemRoles(ctx.actor)) {
      throw new RbacError("Cannot modify system roles", "FORBIDDEN");
    }

    // Check name uniqueness if name is being updated
    if (name && name !== existingRole.name) {
      const nameExists = await repo.nameExists(name, ctx.orgId, id);
      if (nameExists) {
        throw new RbacError(
          "A role with this name already exists",
          "CONFLICT"
        );
      }
    }

    try {
      const updatedRole = await repo.update({
        id,
        name,
        description,
        isActive,
      });

      if (!updatedRole) {
        throw new RbacError("Failed to update role", "INTERNAL_ERROR");
      }

      return updatedRole;
    } catch (error) {
      if (error instanceof RbacError) throw error;
      throw new RbacError("Failed to update role", "INTERNAL_ERROR", error);
    }
  }

  /**
   * Delete role
   */
  async delete(params: RoleDeleteParams, ctx: RbacServiceContext) {
    const { id, force = false } = params;

    const repo = this.createRepo(ctx.db);

    // Get existing role
    const existingRole = await repo.getById(id, {
      orgId: ctx.orgId ?? undefined,
      includeSystemRoles: this.canViewSystemRoles(ctx.actor),
    });

    if (!existingRole) {
      throw new RbacError("Role not found", "NOT_FOUND");
    }

    // Prevent deletion of system roles
    if (existingRole.isSystemRole) {
      throw new RbacError("Cannot delete system roles", "FORBIDDEN");
    }

    // Check if role has active users
    const hasUsers = await repo.hasActiveUsers(id, ctx.orgId);
    if (hasUsers && !force) {
      const userCount = await repo.getUserCount(id, ctx.orgId ?? undefined);
      throw new RbacError(
        `Cannot delete role as it is assigned to ${userCount} user(s). Remove all assignments first.`,
        "CONFLICT"
      );
    }

    try {
      // Use soft delete by default, hard delete if forced
      const deleted = force
        ? await repo.hardDelete(id)
        : await repo.softDelete(id);

      if (!deleted) {
        throw new RbacError("Failed to delete role", "INTERNAL_ERROR");
      }

      return { success: true, deleted: true };
    } catch (error) {
      if (error instanceof RbacError) throw error;
      throw new RbacError("Failed to delete role", "INTERNAL_ERROR", error);
    }
  }

  /**
   * Assign permissions to role
   */
  async assignPermissions(
    params: RoleAssignPermissionsParams,
    ctx: RbacServiceContext
  ) {
    const { roleId, permissionIds } = params;

    const repo = this.createRepo(ctx.db);

    // Verify role exists and user has access
    const role = await repo.getById(roleId, {
      orgId: ctx.orgId ?? undefined,
      includeSystemRoles: this.canViewSystemRoles(ctx.actor),
    });

    if (!role) {
      throw new RbacError(
        `Role with ID ${roleId} not found or not accessible`,
        "NOT_FOUND"
      );
    }

    // Check if modifying system role
    if (role.isSystemRole && !this.canManageSystemRoles(ctx.actor)) {
      throw new RbacError(
        "Cannot modify permissions for system roles",
        "FORBIDDEN"
      );
    }

    try {
      const targetOrgId = role.orgId ?? null;

      // Assign permissions
      await repo.assignPermissions({
        roleId,
        permissionIds,
        orgId: targetOrgId,
      });

      // Trigger real-time permission updates for affected users
      await this.broadcastPermissionUpdate(roleId, repo, ctx);

      // Return updated role with permissions
      const updatedRole = await repo.getById(roleId, {
        includePermissions: true,
        orgId: targetOrgId ?? undefined,
        includeSystemRoles: this.canViewSystemRoles(ctx.actor),
      });

      return updatedRole;
    } catch (error) {
      if (error instanceof RbacError) throw error;
      throw new RbacError(
        "Failed to assign permissions",
        "INTERNAL_ERROR",
        error
      );
    }
  }

  /**
   * Remove specific permissions from role
   */
  async removePermissions(
    params: RoleRemovePermissionsParams,
    ctx: RbacServiceContext
  ) {
    const { roleId, permissionIds } = params;

    if (permissionIds.length === 0) {
      throw new RbacError("No permission IDs provided", "BAD_REQUEST");
    }

    const repo = this.createRepo(ctx.db);

    // Verify role exists and user has access
    const role = await repo.getById(roleId, {
      orgId: ctx.orgId ?? undefined,
      includeSystemRoles: this.canViewSystemRoles(ctx.actor),
    });

    if (!role) {
      throw new RbacError(
        `Role with ID ${roleId} not found or not accessible`,
        "NOT_FOUND"
      );
    }

    // Check if modifying system role
    if (role.isSystemRole && !this.canManageSystemRoles(ctx.actor)) {
      throw new RbacError(
        "Cannot modify permissions for system roles",
        "FORBIDDEN"
      );
    }

    try {
      const targetOrgId = role.orgId ?? null;

      await repo.removePermissions(roleId, permissionIds, targetOrgId);

      // Trigger real-time permission updates for affected users
      await this.broadcastPermissionUpdate(roleId, repo, ctx);

      return { success: true };
    } catch (error) {
      if (error instanceof RbacError) throw error;
      throw new RbacError(
        "Failed to remove permissions",
        "INTERNAL_ERROR",
        error
      );
    }
  }

  /**
   * Bulk update roles
   */
  async bulkUpdate(params: RoleBulkUpdateParams, ctx: RbacServiceContext) {
    const { roleIds, action } = params;

    if (roleIds.length === 0) {
      throw new RbacError("No role IDs provided", "BAD_REQUEST");
    }

    const repo = this.createRepo(ctx.db);

    // Check for system roles in the list
    const rolesData = await Promise.all(
      roleIds.map((id) =>
        repo.getById(id, {
          orgId: ctx.orgId ?? undefined,
          includeSystemRoles: true,
        })
      )
    );

    const systemRoles = rolesData.filter((r) => r?.isSystemRole);
    if (systemRoles.length > 0 && !this.canManageSystemRoles(ctx.actor)) {
      throw new RbacError(
        `Cannot modify system roles: ${systemRoles.map((r) => r?.name).join(", ")}`,
        "FORBIDDEN"
      );
    }

    const isActive = action === "activate";

    try {
      const updatedCount = await repo.bulkUpdate(roleIds, { isActive });

      return {
        success: true,
        updatedCount,
      };
    } catch (error) {
      throw new RbacError("Failed to update roles", "INTERNAL_ERROR", error);
    }
  }

  /**
   * Bulk delete roles
   */
  async bulkDelete(params: RoleBulkDeleteParams, ctx: RbacServiceContext) {
    const { roleIds } = params;

    if (roleIds.length === 0) {
      throw new RbacError("No role IDs provided", "BAD_REQUEST");
    }

    const repo = this.createRepo(ctx.db);

    // Check for system roles in the list
    const rolesData = await Promise.all(
      roleIds.map((id) =>
        repo.getById(id, {
          orgId: ctx.orgId ?? undefined,
          includeSystemRoles: true,
        })
      )
    );

    const systemRoles = rolesData.filter((r) => r?.isSystemRole);
    if (systemRoles.length > 0) {
      throw new RbacError(
        `Cannot delete system roles: ${systemRoles.map((r) => r?.name).join(", ")}`,
        "FORBIDDEN"
      );
    }

    try {
      // Soft delete all roles
      const deletedCount = await repo.bulkUpdate(roleIds, { isActive: false });

      return {
        success: true,
        deletedCount,
      };
    } catch (error) {
      throw new RbacError("Failed to delete roles", "INTERNAL_ERROR", error);
    }
  }

  /**
   * Copy role to another organization
   */
  async copyRole(
    sourceRoleId: number,
    targetOrgId: number,
    newName: string | undefined,
    ctx: RbacServiceContext
  ) {
    if (!ctx.isSystemUser) {
      throw new RbacError(
        "System role required for cross-organization operations",
        "FORBIDDEN"
      );
    }

    const repo = this.createRepo(ctx.db);

    try {
      const copiedRole = await repo.copyRole(sourceRoleId, targetOrgId, newName);
      return copiedRole;
    } catch (error) {
      throw new RbacError("Failed to copy role", "INTERNAL_ERROR", error);
    }
  }

  /**
   * Get role hierarchy for organization
   */
  async getRoleHierarchy(ctx: RbacServiceContext) {
    const repo = this.createRepo(ctx.db);

    // Get all roles for the organization
    const [systemRoles, globalRoles, orgRoles] = await Promise.all([
      this.canViewSystemRoles(ctx.actor)
        ? repo.getSystemRoles()
        : Promise.resolve([]),
      repo.getGlobalRoles(),
      ctx.orgId ? repo.getOrgRoles(ctx.orgId) : Promise.resolve([]),
    ]);

    return {
      system: systemRoles,
      global: globalRoles,
      organization: orgRoles,
    };
  }

  /**
   * Broadcast permission update to affected users
   */
  private async broadcastPermissionUpdate(
    roleId: number,
    repo: RoleRepository,
    ctx: RbacServiceContext
  ) {
    if (!this.hooks.onPermissionsChanged) {
      return;
    }

    try {
      const users = await repo.getRoleUsers(roleId, ctx.orgId);

      if (users.length > 0) {
        const userIds = users.map((u) => u.userId);
        await this.hooks.onPermissionsChanged(roleId, userIds, ctx);
      }
    } catch (error) {
      // Don't fail the main operation if real-time update fails
      console.error(
        `Error triggering real-time permission update for role ${roleId}:`,
        error
      );
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Schema type for role service
 */
export interface RoleServiceSchema {
  roles: any;
  permissions: any;
  rolePermissions: any;
  userRoles: any;
}

/**
 * Create a RoleService instance with the given schema and hooks.
 *
 * @example
 * ```typescript
 * import { createRoleService } from '@jetdevs/core/rbac';
 * import { roles, permissions, rolePermissions, userRoles } from './schema';
 *
 * const roleService = createRoleService(
 *   { roles, permissions, rolePermissions, userRoles },
 *   {
 *     onPermissionsChanged: async (roleId, userIds) => {
 *       await broadcastUpdate(userIds);
 *     }
 *   }
 * );
 * ```
 */
export function createRoleService(
  schema: RoleServiceSchema,
  hooks?: RoleServiceHooks
): RoleService {
  return new RoleService(schema, hooks);
}

// =============================================================================
// PRE-BUILT SDK SERVICE
// =============================================================================

// Import SDK schema tables
import {
    permissions as sdkPermissions,
    rolePermissions as sdkRolePermissions,
    roles as sdkRoles,
    userRoles as sdkUserRoles,
} from "../../db/schema/rbac";

/**
 * Pre-built SDK schema for role service
 */
export const sdkRbacSchema: RoleServiceSchema = {
  roles: sdkRoles,
  permissions: sdkPermissions,
  rolePermissions: sdkRolePermissions,
  userRoles: sdkUserRoles,
};

/**
 * Pre-built RoleService that uses SDK schema tables with sensible defaults.
 *
 * Default behavior:
 * - `canManageSystemRoles`: Requires "admin:full_access" permission
 * - `canViewSystemRoles`: Requires "admin:full_access" permission
 * - `onPermissionsChanged`: No-op (does nothing)
 *
 * Use this for zero-boilerplate role management. For apps that need
 * WebSocket broadcasts or custom permission checks, use `createSDKRoleService()`.
 *
 * @example
 * ```typescript
 * // Zero-boilerplate usage - uses default "admin:full_access" check
 * import { SDKRoleService } from '@jetdevs/core/rbac';
 *
 * const roles = await SDKRoleService.list({}, ctx);
 * ```
 *
 * @example
 * ```typescript
 * // With WebSocket broadcasts for real-time updates
 * import { createSDKRoleService } from '@jetdevs/core/rbac';
 *
 * const roleService = createSDKRoleService({
 *   onPermissionsChanged: async (roleId, userIds) => {
 *     await broadcastPermissionUpdate(userIds);
 *   }
 * });
 * ```
 */
export const SDKRoleService = new RoleService(sdkRbacSchema);

/**
 * Create a RoleService with SDK schema and custom hooks.
 *
 * This is the recommended way to create a RoleService when you need
 * app-specific behavior like WebSocket broadcasts or custom permission checks.
 *
 * @example
 * ```typescript
 * import { createSDKRoleService } from '@jetdevs/core/rbac';
 *
 * const roleService = createSDKRoleService({
 *   canManageSystemRoles: (actor) =>
 *     actor.permissions?.includes('admin:full_access'),
 *   onPermissionsChanged: async (roleId, userIds) => {
 *     await broadcastPermissionUpdate(userIds);
 *   }
 * });
 * ```
 */
export function createSDKRoleService(hooks?: RoleServiceHooks): RoleService {
  return new RoleService(sdkRbacSchema, hooks);
}

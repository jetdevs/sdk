/**
 * Role Router Configuration Factory
 *
 * Creates router configuration for role management.
 * Apps use this with createRouterWithActor from @jetdevs/framework.
 *
 * @module @jetdevs/core/rbac
 */

import { z } from "zod";
import { SDKRoleRepository } from "./role.repository";
import type { RoleService } from "./role.service";
import { SDKRoleService } from "./role.service";
import {
    assignPermissionsSchema,
    bulkDeleteRolesSchema,
    bulkUpdateRolesSchema,
    copyRoleSchema,
    createRoleSchema,
    deleteRoleSchema,
    getRoleByIdSchema,
    getRoleWithPermissionsSchema,
    removePermissionsSchema,
    roleFiltersSchema,
    updateRoleSchema,
} from "./schemas";
import type {
    Actor,
    RbacServiceContext
} from "./types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Service context factory function type
 * Creates a RbacServiceContext from handler context
 */
export type CreateServiceContext = (
  db: any,
  actor: Actor,
  orgId: number | null
) => RbacServiceContext;

/**
 * Handler context with service instance
 */
interface RoleHandlerContext<TInput = any> {
  input: TInput;
  service: { orgId: number | null };
  db: any;
  actor: Actor;
  repo?: any;
  ctx?: any;
}

/**
 * Configuration for creating Role router config
 */
export interface CreateRoleRouterConfigOptions {
  /**
   * RoleService instance to use for operations
   * @default SDKRoleService (uses "admin:full_access" for system role checks)
   */
  Service?: RoleService;

  /**
   * Function to create service context from handler context
   * @default defaultCreateServiceContext
   */
  createServiceContext?: CreateServiceContext;

  /**
   * Repository class to use (for framework compatibility)
   * @default SDKRoleRepository
   */
  Repository?: new (db: any) => any;

  /**
   * Cache invalidation tags
   * @default ['roles']
   */
  invalidationTags?: string[];
}

// =============================================================================
// DEFAULT SERVICE CONTEXT
// =============================================================================

/**
 * Default service context factory.
 * Creates a standard RbacServiceContext from handler context.
 *
 * This is used by the pre-built roleRouterConfig and can be used
 * as a starting point for custom implementations.
 */
export const defaultCreateServiceContext: CreateServiceContext = (
  db,
  actor,
  orgId
): RbacServiceContext => ({
  db,
  actor,
  orgId,
  userId: actor.userId,
  permissions: actor.permissions || [],
  isSystemUser: actor.permissions?.some((p) => p.startsWith("admin:")) || false,
});

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

/**
 * Creates router configuration for role management.
 *
 * Use this with createRouterWithActor from @jetdevs/framework.
 *
 * @example
 * // Zero-boilerplate usage with SDK defaults
 * import { roleRouterConfig } from '@jetdevs/core/rbac';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const roleRouter = createRouterWithActor(roleRouterConfig);
 *
 * @example
 * // With custom service for WebSocket broadcasts
 * import { createRoleRouterConfig, createSDKRoleService } from '@jetdevs/core/rbac';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * const RoleServiceWithWS = createSDKRoleService({
 *   onPermissionsChanged: async (roleId, userIds) => {
 *     await broadcastPermissionUpdate(userIds);
 *   }
 * });
 *
 * export const roleRouter = createRouterWithActor(
 *   createRoleRouterConfig({ Service: RoleServiceWithWS })
 * );
 */
export function createRoleRouterConfig(options: CreateRoleRouterConfigOptions = {}) {
  const {
    Service = SDKRoleService,
    createServiceContext = defaultCreateServiceContext,
    Repository = SDKRoleRepository,
    invalidationTags = ["roles"],
  } = options;

  return {
    // =========================================================================
    // QUERY: Get all roles with stats
    // =========================================================================
    getAllWithStats: {
      type: "query" as const,
      permission: "role:read",
      input: roleFiltersSchema.optional(),
      cache: { ttl: 60, tags: ["roles"] },
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        limit?: number;
        offset?: number;
        search?: string;
        isActive?: boolean;
        isSystemRole?: boolean;
      } | undefined>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.list(
          {
            limit: input?.limit || 10,
            offset: input?.offset || 0,
            search: input?.search,
            isActive: input?.isActive,
            isSystemRole: input?.isSystemRole,
            includeStats: true,
            includePermissions: false,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // QUERY: Get all roles system-wide (admin only)
    // =========================================================================
    getAllRolesSystem: {
      type: "query" as const,
      permission: "admin:manage",
      crossOrg: true, // Bypass RLS to see all roles including system roles (org_id = NULL)
      input: roleFiltersSchema
        .extend({
          orgId: z.number().optional(),
        })
        .optional(),
      cache: { ttl: 60, tags: ["roles"] },
      repository: Repository,
      handler: async ({
        input,
        db,
        actor,
      }: RoleHandlerContext<{
        limit?: number;
        offset?: number;
        search?: string;
        isActive?: boolean;
        isSystemRole?: boolean;
        orgId?: number;
      } | undefined>) => {
        const serviceCtx = createServiceContext(
          db,
          actor,
          input?.orgId ?? null
        );

        return Service.listAllSystem(
          {
            limit: input?.limit || 50,
            offset: input?.offset || 0,
            search: input?.search,
            isActive: input?.isActive,
            isSystemRole: input?.isSystemRole,
            orgId: input?.orgId,
            includeStats: true,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // QUERY: Get all active roles (legacy)
    // =========================================================================
    getAll: {
      type: "query" as const,
      permission: "role:read",
      cache: { ttl: 60, tags: ["roles"] },
      repository: Repository,
      handler: async ({ service, db, actor }: RoleHandlerContext<undefined>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.getAllActive(serviceCtx);
      },
    },

    // =========================================================================
    // QUERY: Get role by ID
    // =========================================================================
    getById: {
      type: "query" as const,
      permission: "role:read",
      input: getRoleByIdSchema,
      cache: { ttl: 60, tags: ["roles"] },
      crossOrg: true, // Allow querying system roles (org_id = NULL)
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        id: number;
        crossOrgAccess?: boolean;
        orgId?: number;
      }>) => {
        const effectiveOrgId = input.crossOrgAccess
          ? input.orgId ?? null
          : service.orgId;
        const serviceCtx = createServiceContext(db, actor, effectiveOrgId);

        return Service.getById(
          {
            id: input.id,
            includeStats: true,
            includePermissions: true,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // QUERY: Get role with permissions
    // =========================================================================
    getWithPermissions: {
      type: "query" as const,
      permission: "role:read",
      input: getRoleWithPermissionsSchema,
      crossOrg: true, // Allow querying system roles (org_id = NULL)
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        roleId: number;
        crossOrgAccess?: boolean;
        orgId?: number;
      }>) => {
        const effectiveOrgId = input.crossOrgAccess
          ? (input.orgId ?? null)
          : service.orgId;
        const serviceCtx = createServiceContext(db, actor, effectiveOrgId);

        return Service.getWithPermissions(input.roleId, serviceCtx);
      },
    },

    // =========================================================================
    // MUTATION: Create role
    // =========================================================================
    create: {
      permission: "role:create",
      input: createRoleSchema,
      invalidates: invalidationTags,
      entityType: "role",
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        name: string;
        description?: string;
        isSystemRole?: boolean;
        isActive?: boolean;
      }>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.create(
          {
            name: input.name,
            description: input.description,
            isSystemRole: input.isSystemRole,
            isActive: input.isActive,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // MUTATION: Update role
    // =========================================================================
    update: {
      permission: "role:update",
      input: updateRoleSchema,
      invalidates: invalidationTags,
      entityType: "role",
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        id: number;
        name?: string;
        description?: string;
        isActive?: boolean;
      }>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.update(
          {
            id: input.id,
            name: input.name,
            description: input.description,
            isActive: input.isActive,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // MUTATION: Delete role
    // =========================================================================
    delete: {
      permission: "role:delete",
      input: deleteRoleSchema,
      invalidates: invalidationTags,
      entityType: "role",
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<number>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.delete(
          {
            id: input,
            force: false,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // MUTATION: Assign permissions to role
    // =========================================================================
    assignPermissions: {
      permission: "role:assign_permissions",
      input: assignPermissionsSchema,
      invalidates: [...invalidationTags, "permissions"],
      entityType: "role_permission",
      crossOrg: true, // Allow modifying system roles (org_id = NULL)
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        roleId: number;
        permissionIds: number[];
        crossOrgAccess?: boolean;
        orgId?: number;
      }>) => {
        const effectiveOrgId = input.crossOrgAccess
          ? (input.orgId ?? null)
          : service.orgId;
        const serviceCtx = createServiceContext(db, actor, effectiveOrgId);

        return Service.assignPermissions(
          {
            roleId: input.roleId,
            permissionIds: input.permissionIds,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // MUTATION: Remove permissions from role
    // =========================================================================
    removePermissions: {
      permission: "role:assign_permissions",
      input: removePermissionsSchema,
      invalidates: [...invalidationTags, "permissions"],
      entityType: "role_permission",
      crossOrg: true, // Allow modifying system roles (org_id = NULL)
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        roleId: number;
        permissionIds: number[];
        crossOrgAccess?: boolean;
        orgId?: number;
      }>) => {
        const effectiveOrgId = input.crossOrgAccess
          ? (input.orgId ?? null)
          : service.orgId;
        const serviceCtx = createServiceContext(db, actor, effectiveOrgId);

        return Service.removePermissions(
          {
            roleId: input.roleId,
            permissionIds: input.permissionIds,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // MUTATION: Bulk update roles
    // =========================================================================
    bulkUpdate: {
      permission: "role:update",
      input: bulkUpdateRolesSchema,
      invalidates: invalidationTags,
      entityType: "role",
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{
        roleIds: number[];
        action: "activate" | "deactivate";
      }>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.bulkUpdate(
          {
            roleIds: input.roleIds,
            action: input.action,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // MUTATION: Bulk delete roles
    // =========================================================================
    bulkDelete: {
      permission: "role:delete",
      input: bulkDeleteRolesSchema,
      invalidates: invalidationTags,
      entityType: "role",
      repository: Repository,
      handler: async ({
        input,
        service,
        db,
        actor,
      }: RoleHandlerContext<{ roleIds: number[] }>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.bulkDelete(
          {
            roleIds: input.roleIds,
          },
          serviceCtx
        );
      },
    },

    // =========================================================================
    // QUERY: Get role hierarchy
    // =========================================================================
    getRoleHierarchy: {
      type: "query" as const,
      repository: Repository,
      handler: async ({ service, db, actor }: RoleHandlerContext<undefined>) => {
        const serviceCtx = createServiceContext(db, actor, service.orgId);

        return Service.getRoleHierarchy(serviceCtx);
      },
    },

    // =========================================================================
    // MUTATION: Copy role (admin only)
    // =========================================================================
    copyRole: {
      permission: "admin:manage",
      crossOrg: true, // Bypass RLS to copy roles across organizations
      input: copyRoleSchema,
      invalidates: invalidationTags,
      entityType: "role",
      repository: Repository,
      handler: async ({
        input,
        db,
        actor,
      }: RoleHandlerContext<{
        sourceRoleId: number;
        targetOrgId: number;
        newName?: string;
      }>) => {
        const serviceCtx = createServiceContext(db, actor, input.targetOrgId);

        return Service.copyRole(
          input.sourceRoleId,
          input.targetOrgId,
          input.newName,
          serviceCtx
        );
      },
    },
  };
}

// =============================================================================
// PRE-BUILT ROUTER CONFIG
// =============================================================================

/**
 * Pre-built role router configuration using SDK defaults.
 *
 * Uses:
 * - SDKRoleService (checks for "admin:full_access" permission)
 * - SDKRoleRepository (uses SDK schema tables)
 * - defaultCreateServiceContext
 *
 * This is the zero-boilerplate option for role management.
 * For apps that need WebSocket broadcasts or custom permission checks,
 * use createRoleRouterConfig() with custom options.
 *
 * @example
 * ```typescript
 * // Zero-boilerplate usage
 * import { roleRouterConfig } from '@jetdevs/core/rbac';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * const roleRouter = createRouterWithActor(roleRouterConfig);
 * ```
 *
 * @example
 * ```typescript
 * // With WebSocket broadcasts
 * import { createRoleRouterConfig, createSDKRoleService } from '@jetdevs/core/rbac';
 *
 * const roleService = createSDKRoleService({
 *   onPermissionsChanged: async (roleId, userIds) => {
 *     await broadcastPermissionUpdate(userIds);
 *   }
 * });
 *
 * const roleRouterConfig = createRoleRouterConfig({ Service: roleService });
 * ```
 */
export const roleRouterConfig = createRoleRouterConfig();

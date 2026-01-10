/**
 * User Organization Router Configuration
 *
 * This provides a router configuration factory that can be used
 * with createRouterWithActor from @jetdevs/framework/router.
 *
 * The configuration defines all the procedures for user-organization
 * relationship management while allowing apps to inject their own
 * repository implementation.
 *
 * @module @jetdevs/core/user-org
 *
 * @example
 * ```typescript
 * // Option 1: Factory pattern with custom repository (full control)
 * import { createUserOrgRouterConfig, createUserOrgRepository } from '@jetdevs/core/user-org';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 * import { TRPCError } from '@trpc/server';
 * import * as schema from '@/db/schema';
 *
 * const UserOrgRepository = createUserOrgRepository({
 *   tables: { userRoles: schema.userRoles, users: schema.users, roles: schema.roles, orgs: schema.orgs },
 * });
 *
 * export const userOrgRouter = createRouterWithActor(
 *   createUserOrgRouterConfig({ Repository: UserOrgRepository, TRPCError })
 * );
 *
 * // Option 2: Pre-built router config (zero boilerplate) - uses SDK schema
 * import { userOrgRouterConfig } from '@jetdevs/core/user-org';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const userOrgRouter = createRouterWithActor(userOrgRouterConfig);
 * ```
 */

import { orgs, roles, userRoles, users } from '../../db/schema';
import type { HandlerContext } from '../../trpc/routers/types';
import {
    assignRoleSchema,
    getAvailableRolesSchema,
    getAvailableServiceRolesSchema,
    getUserRolesAllOrgsSchema,
    getUsersByRoleSchema,
    removeRoleSchema,
    switchOrgSchema,
    validateOrgAccessSchema,
} from './schemas';
import { createUserOrgRepository } from './user-org.repository';

/**
 * TRPCError-like constructor interface
 */
export interface TRPCErrorConstructor {
  new (opts: { code: string; message: string }): Error;
}

// =============================================================================
// DEFAULT TRPC ERROR
// =============================================================================

/**
 * Simple error class for when TRPCError is not provided
 */
class DefaultTRPCError extends Error {
  code: string;
  constructor(opts: { code: string; message: string }) {
    super(opts.message);
    this.name = 'TRPCError';
    this.code = opts.code;
  }
}

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

/**
 * Context required for user-org router operations
 */
export interface UserOrgRouterContext {
  session?: {
    user?: {
      currentOrgId?: number;
      id?: string | number;
    };
  };
}

/**
 * Service/Actor context for user-org operations
 */
export interface UserOrgServiceContext {
  userId: string;
  orgId?: number;
}

/**
 * Factory dependencies for createUserOrgRouterConfig
 */
export interface UserOrgRouterFactoryDeps {
  /** Repository class to instantiate (required) */
  Repository: new (db: any) => any;
  /** TRPCError class for throwing typed errors (optional - uses default if not provided) */
  TRPCError?: TRPCErrorConstructor;
}

/**
 * Creates a router configuration for user-org operations.
 *
 * This configuration can be passed to createRouterWithActor from the framework.
 *
 * @example
 * ```ts
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 * import { createUserOrgRouterConfig, createUserOrgRepository } from '@jetdevs/core/user-org';
 * import { TRPCError } from '@trpc/server';
 * import * as schema from '@/db/schema';
 *
 * const UserOrgRepository = createUserOrgRepository({
 *   tables: { userRoles: schema.userRoles, users: schema.users, roles: schema.roles, orgs: schema.orgs },
 * });
 *
 * const userOrgRouter = createRouterWithActor(createUserOrgRouterConfig({
 *   Repository: UserOrgRepository,
 *   TRPCError,
 * }));
 * ```
 */
export function createUserOrgRouterConfig(deps: UserOrgRouterFactoryDeps) {
  const { Repository, TRPCError = DefaultTRPCError } = deps;

  return {
    // -------------------------------------------------------------------------
    // GET CURRENT USER'S ORGANIZATION CONTEXT
    // -------------------------------------------------------------------------
    getCurrentOrg: {
      type: 'query' as const,
      repository: Repository,
      handler: async (context: HandlerContext) => {
        const { service, repo, ctx } = context;
        const userId = parseInt(service.userId);
        const currentOrgId =
          (ctx.session?.user as any)?.currentOrgId || null;

        return repo!.getCurrentOrg(userId, currentOrgId);
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL ORGANIZATIONS USER HAS ACCESS TO
    // -------------------------------------------------------------------------
    getUserOrganizations: {
      type: 'query' as const,
      crossOrg: true, // Required to see user's roles across ALL organizations, not just current one
      repository: Repository,
      handler: async (context: HandlerContext) => {
        const { service, repo } = context;
        const userId = parseInt(service.userId);
        return repo!.getUserOrganizations(userId);
      },
    },

    // -------------------------------------------------------------------------
    // SWITCH CURRENT ORGANIZATION
    // -------------------------------------------------------------------------
    switchOrg: {
      input: switchOrgSchema,
      invalidates: ['user-org'],
      entityType: 'user_org',
      crossOrg: true, // Required to validate access to target org (which may differ from current)
      repository: Repository,
      handler: async (context: HandlerContext<{ orgId: number }>) => {
        const { input, service, repo } = context;
        const userId = parseInt(service.userId);

        // Validate user has access to target org
        const hasAccess = await repo!.validateOrgAccess(userId, input.orgId);
        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this organization',
          });
        }

        // Get the org info before switching
        const org = await repo!.getOrgById(input.orgId);

        // Perform the switch
        await repo!.switchOrg(userId, input.orgId, service.userId);

        return {
          success: true,
          org: {
            id: input.orgId,
            name: org?.name || 'Organization',
          }
        };
      },
    },

    // -------------------------------------------------------------------------
    // ASSIGN ROLE TO USER IN ORGANIZATION
    // -------------------------------------------------------------------------
    assignRole: {
      permission: 'user:assign_roles',
      input: assignRoleSchema,
      invalidates: ['user-org', 'roles'],
      entityType: 'user_role',
      crossOrg: true, // Required to assign roles in organizations other than the current one
      repository: Repository,
      handler: async (context: HandlerContext<{ userId: number; orgId: number; roleId: number }>) => {
        const { input, service, repo } = context;
        // Check if role assignment already exists
        const existing = await repo!.findRoleAssignment(
          input.userId,
          input.roleId,
          input.orgId
        );
        if (existing && existing.isActive) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'User already has this role in this organization',
          });
        }

        // If exists but inactive, reactivate
        if (existing && !existing.isActive) {
          await repo!.reactivateRoleAssignment(
            input.userId,
            input.roleId,
            input.orgId
          );
          return { success: true, reactivated: true };
        }

        // Create new assignment
        const assignedBy = parseInt(service.userId);
        await repo!.createRoleAssignment({
          userId: input.userId,
          orgId: input.orgId,
          roleId: input.roleId,
          assignedBy,
        });

        return { success: true };
      },
    },

    // -------------------------------------------------------------------------
    // REMOVE ROLE FROM USER IN ORGANIZATION
    // -------------------------------------------------------------------------
    removeRole: {
      permission: 'user:assign_roles',
      input: removeRoleSchema,
      invalidates: ['user-org', 'roles'],
      entityType: 'user_role',
      crossOrg: true, // Required to remove roles from organizations other than the current one
      repository: Repository,
      handler: async (context: HandlerContext<{ userId: number; orgId: number; roleId: number }>) => {
        const { input, repo } = context;
        const deleted = await repo!.deleteRoleAssignment(
          input.userId,
          input.roleId,
          input.orgId
        );
        if (!deleted) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Role assignment not found',
          });
        }

        return { success: true };
      },
    },

    // -------------------------------------------------------------------------
    // VALIDATE USER HAS ACCESS TO SPECIFIC ORGANIZATION
    // -------------------------------------------------------------------------
    validateOrgAccess: {
      type: 'query' as const,
      input: validateOrgAccessSchema,
      crossOrg: true, // Required to validate access to any org, not just current
      repository: Repository,
      handler: async (context: HandlerContext<{ orgId: number }>) => {
        const { input, service, repo } = context;
        const userId = parseInt(service.userId);
        const hasAccess = await repo!.validateOrgAccess(userId, input.orgId);
        return { hasAccess };
      },
    },

    // -------------------------------------------------------------------------
    // GET USER'S PERMISSIONS IN CURRENT ORGANIZATION
    // -------------------------------------------------------------------------
    getUserOrgPermissions: {
      type: 'query' as const,
      repository: Repository,
      handler: async (context: HandlerContext) => {
        const { service, repo, ctx } = context;
        const userId = parseInt(service.userId);
        const currentOrgId =
          (ctx.session?.user as any)?.currentOrgId || null;
        return repo!.getUserPermissionsInOrg(userId, currentOrgId);
      },
    },

    // -------------------------------------------------------------------------
    // GET USERS BY ROLE IN ORGANIZATION
    // -------------------------------------------------------------------------
    getUsersByRole: {
      type: 'query' as const,
      input: getUsersByRoleSchema,
      repository: Repository,
      handler: async (context: HandlerContext<{ roleId: number }>) => {
        const { input, service, repo } = context;
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No current organization context',
          });
        }
        return repo!.getUsersByRoleInOrg(input.roleId, service.orgId);
      },
    },

    // -------------------------------------------------------------------------
    // GET AVAILABLE ROLES FOR AN ORGANIZATION
    // -------------------------------------------------------------------------
    getAvailableRoles: {
      type: 'query' as const,
      input: getAvailableRolesSchema,
      cache: { ttl: 300, tags: ['roles'] },
      crossOrg: true, // Required to see global roles (orgId = null)
      repository: Repository,
      handler: async (context: HandlerContext<{ orgId: number; category?: 'user' | 'service' }>) => {
        const { input, repo } = context;
        // Default to 'user' category for backwards compatibility
        return repo!.getAvailableRolesForOrg(input.orgId, { category: input.category });
      },
    },

    // -------------------------------------------------------------------------
    // GET AVAILABLE SERVICE ROLES FOR AN ORGANIZATION
    // -------------------------------------------------------------------------
    getAvailableServiceRoles: {
      type: 'query' as const,
      input: getAvailableServiceRolesSchema,
      cache: { ttl: 300, tags: ['roles', 'service-roles'] },
      crossOrg: true, // Required to see global service roles (orgId = null)
      repository: Repository,
      handler: async (context: HandlerContext<{ orgId: number }>) => {
        const { input, repo } = context;
        return repo!.getAvailableServiceRoles(input.orgId);
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL ASSIGNABLE ORGANIZATIONS (admin)
    // -------------------------------------------------------------------------
    getAssignableOrganizations: {
      type: 'query' as const,
      permission: 'user:assign_roles',
      cache: { ttl: 300, tags: ['orgs'] },
      repository: Repository,
      handler: async (context: HandlerContext) => {
        const { repo } = context;
        return repo!.getAssignableOrganizations();
      },
    },

    // -------------------------------------------------------------------------
    // GET USER'S ROLES ACROSS ALL ORGANIZATIONS
    // -------------------------------------------------------------------------
    getUserRolesAllOrgs: {
      type: 'query' as const,
      permission: 'user:read',
      input: getUserRolesAllOrgsSchema,
      crossOrg: true, // Required to see user's roles across ALL organizations
      repository: Repository,
      handler: async (context: HandlerContext<{ userId: number }>) => {
        const { input, repo } = context;
        return repo!.getUserRolesAllOrgs(input.userId);
      },
    },
  };
}

/**
 * Type for the router configuration
 */
export type UserOrgRouterConfig = ReturnType<typeof createUserOrgRouterConfig>;

// =============================================================================
// SDK REPOSITORY (Pre-built using SDK's own schema)
// =============================================================================

/**
 * SDK User-Org Repository
 *
 * A repository factory configured with the SDK's own schema tables.
 * Useful for apps that don't need to customize the schema.
 *
 * @example
 * ```typescript
 * import { SDKUserOrgRepository } from '@jetdevs/core/user-org';
 *
 * // Create repository with app's database client
 * const repo = new SDKUserOrgRepository(db);
 * const currentOrg = await repo.getCurrentOrg(userId, orgId);
 * ```
 */
export const SDKUserOrgRepository = createUserOrgRepository({
  tables: { userRoles, users, roles, orgs },
});

// =============================================================================
// PRE-BUILT ROUTER CONFIG
// =============================================================================

/**
 * Pre-built user-org router configuration
 *
 * Uses the SDK's own UserOrgRepository and schema.
 * Apps can use this directly without creating their own repository.
 *
 * @example
 * ```typescript
 * import { userOrgRouterConfig } from '@jetdevs/core/user-org';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * // One-liner to create a user-org router
 * export const userOrgRouter = createRouterWithActor(userOrgRouterConfig);
 * ```
 */
export const userOrgRouterConfig = createUserOrgRouterConfig({
  Repository: SDKUserOrgRepository,
});

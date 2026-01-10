/**
 * API Keys Router Configuration Factory
 *
 * Creates router configuration for API key management.
 * Apps use this with createRouterWithActor from @jetdevs/framework.
 *
 * Role-Based Permissions:
 * - When creating an API key with a roleId, permissions are automatically derived from that role
 * - The permissions array is populated with the role's current permissions
 * - Use syncPermissionsFromRole to update an existing API key's permissions from its role
 *
 * @module @jetdevs/core/api-keys
 */

import { TRPCError } from '@trpc/server';
import { SDKRoleRepository } from '../rbac/role.repository';
import { SDKApiKeysRepository, type ApiKeysRepository } from './api-keys.repository';
import { generateApiKey } from './key-generation';
import {
    createApiKeySchema,
    getApiKeySchema,
    listApiKeysSchema,
    revokeApiKeySchema,
    syncApiKeyPermissionsSchema,
    updateApiKeySchema,
} from './schemas';
import type { ApiKeyEnvironment } from './types';

/**
 * Service context interface expected by router handlers
 */
export interface ApiKeysServiceContext {
  orgId: number | null;
  userId: string;
}

/**
 * Handler context with optional repo (made required via assertion)
 */
interface HandlerContext<TInput = any> {
  input: TInput;
  service: ApiKeysServiceContext;
  repo?: ApiKeysRepository;
  db?: any; // Database instance for role lookups
}

/**
 * Configuration for creating API Keys router config
 */
export interface CreateApiKeysRouterConfigOptions {
  /**
   * Permission required to manage API keys
   * @default 'admin:manage'
   */
  permission?: string;

  /**
   * Prefix for generated API keys
   * @default 'yobo'
   */
  keyPrefix?: string;

  /**
   * Cache invalidation tags
   * @default ['api-keys']
   */
  invalidationTags?: string[];

  /**
   * Repository class to use
   * @default SDKApiKeysRepository
   */
  Repository?: new (db: any) => ApiKeysRepository;

  /**
   * Default role name to use when creating API keys without explicit roleId
   * If specified, the router will look up this role and assign its permissions
   * @default 'Full API Access' (P2-SR-007: Changed from 'API Key')
   */
  defaultRoleName?: string;

  /**
   * Get privileged database client for looking up system roles.
   * This is needed because system roles (like "API Key") have org_id = NULL,
   * which is blocked by RLS policies. If not provided, the system role
   * lookup will fail silently and API keys will be created without a role.
   *
   * @example
   * ```typescript
   * import { privilegedDb } from '@/db/clients';
   *
   * const apiKeysRouterConfig = createApiKeysRouterConfig({
   *   getPrivilegedDb: () => privilegedDb,
   * });
   * ```
   */
  getPrivilegedDb?: () => any;
}

/**
 * Helper function to get permissions from a role
 */
async function getRolePermissions(
  db: any,
  roleId: number,
  orgId: number
): Promise<string[]> {
  const roleRepo = new SDKRoleRepository(db);
  const roleWithPerms = await roleRepo.getById(roleId, {
    includePermissions: true,
    orgId,
  });

  if (!roleWithPerms) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Role with ID ${roleId} not found`,
    });
  }

  return roleWithPerms.permissions?.map((p) => p.slug) || [];
}

/**
 * Helper function to find a role by name for API key creation.
 * Searches both org-specific roles and global/system roles (orgId = null).
 * Priority: org-specific role first, then global/system role.
 *
 * IMPORTANT: System roles (like "API Key") have org_id = NULL in the database.
 * RLS policies filter out these rows for non-superuser connections.
 * To find system roles, a privilegedDb must be provided that bypasses RLS.
 *
 * @param db - Regular database connection (for org-specific roles)
 * @param orgId - Organization ID to search in
 * @param roleName - Role name to find (default: 'API Key')
 * @param privilegedDb - Optional privileged database connection (bypasses RLS for system roles)
 */
async function findRoleByName(
  db: any,
  orgId: number,
  roleName: string = 'API Key',
  privilegedDb?: any
): Promise<{ id: number; permissions: string[] } | null> {
  const roleRepo = new SDKRoleRepository(db);

  // First try to find an org-specific role with exact name match
  let result = await roleRepo.list({
    limit: 10, // Get more results to filter for exact match
    offset: 0,
    filters: { search: roleName, isActive: true },
    orgId,
    includePermissions: true,
  });

  // Filter for exact name match (search uses LIKE which is fuzzy)
  let exactMatch = result.roles.find((r) => r.name === roleName);

  // If no org-specific role found, look for a system role
  // System roles have org_id = NULL, which is blocked by RLS.
  // We MUST use a privileged connection to find them.
  if (!exactMatch && privilegedDb) {
    // Use privileged connection to bypass RLS and find system roles
    const privilegedRoleRepo = new SDKRoleRepository(privilegedDb);

    result = await privilegedRoleRepo.list({
      limit: 10,
      offset: 0,
      filters: { search: roleName, isActive: true, isSystemRole: true },
      orgId: undefined, // Don't filter by org for system roles
      includeSystemRoles: true, // CRITICAL: Include system roles in results
      includePermissions: true,
    });

    // Filter for exact name match
    exactMatch = result.roles.find((r) => r.name === roleName);
  } else if (!exactMatch && !privilegedDb) {
    // No privileged connection available - log warning
    console.warn(
      `[API Keys] Cannot find system role "${roleName}" without privilegedDb. ` +
      `System roles have org_id = NULL which is blocked by RLS. ` +
      `Pass getPrivilegedDb option to createApiKeysRouterConfig to enable system role lookup.`
    );
  }

  if (!exactMatch) {
    return null;
  }

  return {
    id: exactMatch.id,
    permissions: exactMatch.permissions?.map((p) => p.slug) || [],
  };
}

/**
 * Creates router configuration for API keys management.
 *
 * Use this with createRouterWithActor from @jetdevs/framework.
 *
 * @example
 * // Zero-config usage with SDK repository
 * import { apiKeysRouterConfig } from '@jetdevs/core/api-keys';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const apiKeysRouter = createRouterWithActor(apiKeysRouterConfig);
 *
 * @example
 * // Custom configuration
 * import { createApiKeysRouterConfig } from '@jetdevs/core/api-keys';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 * import { MyApiKeysRepository } from './my-repository';
 *
 * export const apiKeysRouter = createRouterWithActor(
 *   createApiKeysRouterConfig({
 *     permission: 'admin:manage',
 *     keyPrefix: 'myapp',
 *     Repository: MyApiKeysRepository,
 *   })
 * );
 */
export function createApiKeysRouterConfig(
  options: CreateApiKeysRouterConfigOptions = {}
) {
  const {
    permission = 'admin:manage',
    keyPrefix = 'yobo',
    invalidationTags = ['api-keys'],
    Repository = SDKApiKeysRepository,
    // P2-SR-007: Changed default from 'API Key' to 'Full API Access'
    defaultRoleName = 'Full API Access',
    getPrivilegedDb,
  } = options;

  return {
    /**
     * Create a new API key
     *
     * P2-SR-006: Updated for service roles separation with backwards compatibility
     *
     * Role-based permissions:
     * - If serviceRoleId is provided (preferred), permissions are derived from that role
     * - If roleId is provided (deprecated), it maps to serviceRoleId for backwards compatibility
     * - If no role is specified, attempts to find and use the default service role
     * - Falls back to manually specified permissions if no role is available (legacy mode)
     */
    create: {
      permission,
      input: createApiKeySchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
        db,
      }: HandlerContext<{
        name: string;
        serviceRoleId?: number;
        roleId?: number;
        permissions: string[];
        permissionMode?: 'cached' | 'fresh';
        rateLimit?: number;
        expiresAt?: Date;
        environment: ApiKeyEnvironment;
      }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        // Repository is guaranteed by the repository config
        const repository = repo!;

        // P2-SR-006: Map serviceRoleId or roleId to a single role ID
        // serviceRoleId takes precedence (new preferred field)
        // roleId is deprecated but supported for backwards compatibility
        let roleId = input.serviceRoleId ?? input.roleId;
        let permissions = input.permissions;
        const permissionMode = input.permissionMode ?? 'cached';

        // If we have a database connection, derive permissions from role
        if (db) {
          if (roleId) {
            // Explicit role provided - get permissions from that role
            permissions = await getRolePermissions(db, roleId, service.orgId);
          } else if (permissions.length === 0) {
            // No role and no explicit permissions - try to use the default service role
            // Pass privilegedDb to allow finding system roles that have org_id = NULL
            const privilegedDb = getPrivilegedDb?.();
            const defaultRole = await findRoleByName(db, service.orgId, defaultRoleName, privilegedDb);
            if (defaultRole) {
              roleId = defaultRole.id;
              permissions = defaultRole.permissions;
            }
          }
        }

        // Generate API key
        const { key, keyPrefix: generatedPrefix, keyHash } = generateApiKey(
          input.environment,
          keyPrefix
        );

        // Create the API key record
        const apiKey = await repository.create({
          orgId: service.orgId,
          name: input.name,
          keyPrefix: generatedPrefix,
          keyHash,
          roleId,
          permissions,
          permissionMode,
          permissionsSyncedAt: roleId ? new Date() : null, // Set sync time if role-based
          rateLimit: input.rateLimit ?? 1000,
          expiresAt: input.expiresAt,
          createdBy: parseInt(service.userId),
        });

        // Return the full key ONLY on creation (never stored, never returned again)
        return {
          ...apiKey,
          key, // Full key shown only once
        };
      },
    },

    /**
     * List API keys for the organization
     */
    list: {
      type: 'query' as const,
      permission,
      input: listApiKeysSchema,
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{ includeRevoked: boolean }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        return repository.listByOrgId(service.orgId, input.includeRevoked);
      },
    },

    /**
     * Get API key by ID
     */
    getById: {
      type: 'query' as const,
      permission,
      input: getApiKeySchema,
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{ id: number }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        const apiKey = await repository.findById(input.id, service.orgId);

        if (!apiKey) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found',
          });
        }

        return apiKey;
      },
    },

    /**
     * Revoke API key
     */
    revoke: {
      permission,
      input: revokeApiKeySchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{ id: number }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        const revoked = await repository.revoke(input.id, service.orgId);

        if (!revoked) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          });
        }

        return { success: true };
      },
    },

    /**
     * Update API key
     *
     * When updating roleId:
     * - If a new roleId is provided, permissions are automatically updated from that role
     * - If roleId is set to null, permissions remain as-is (manual mode)
     */
    update: {
      permission,
      input: updateApiKeySchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
        db,
      }: HandlerContext<{
        id: number;
        name?: string;
        roleId?: number | null;
        permissions?: string[];
        rateLimit?: number;
        expiresAt?: Date | null;
      }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        const { id, roleId, ...updateData } = input;

        // If roleId is being changed to a new role, derive permissions from that role
        if (db && roleId !== undefined && roleId !== null) {
          const permissions = await getRolePermissions(db, roleId, service.orgId);
          (updateData as any).roleId = roleId;
          (updateData as any).permissions = permissions;
        } else if (roleId === null) {
          // Explicitly clearing the roleId (switch to manual mode)
          (updateData as any).roleId = null;
        }

        const updatedKey = await repository.update(id, service.orgId, updateData);

        if (!updatedKey) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          });
        }

        return updatedKey;
      },
    },

    /**
     * Sync API key permissions from its assigned role
     *
     * This is useful when a role's permissions have been updated and you want
     * to refresh the API key's cached permissions.
     */
    syncPermissionsFromRole: {
      permission,
      input: syncApiKeyPermissionsSchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
        db,
      }: HandlerContext<{ id: number }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;

        // Get the current API key
        const apiKey = await repository.findById(input.id, service.orgId);

        if (!apiKey) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found',
          });
        }

        if (!apiKey.roleId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'API key does not have an assigned role. Assign a role first.',
          });
        }

        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection not available',
          });
        }

        // Get current permissions from the role
        const permissions = await getRolePermissions(db, apiKey.roleId, service.orgId);

        // Update the API key with the new permissions
        const updatedKey = await repository.update(input.id, service.orgId, {
          permissions,
        });

        if (!updatedKey) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update API key permissions',
          });
        }

        return {
          ...updatedKey,
          syncedPermissionsCount: permissions.length,
        };
      },
    },
  };
}

/**
 * Pre-built router config with SDK defaults
 *
 * Zero-configuration usage:
 * ```typescript
 * import { apiKeysRouterConfig } from '@jetdevs/core/api-keys';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const apiKeysRouter = createRouterWithActor(apiKeysRouterConfig);
 * ```
 */
export const apiKeysRouterConfig = createApiKeysRouterConfig();

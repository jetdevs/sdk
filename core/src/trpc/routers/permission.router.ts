/**
 * Permission Router Factory
 *
 * Provides a factory function that creates permission router configuration.
 * Apps can use this with their specific repository implementation.
 *
 * @module @jetdevs/core/trpc/routers
 *
 * @example
 * ```typescript
 * import { createPermissionRouterConfig } from '@jetdevs/core/trpc/routers';
 * import { PermissionRepository } from '@/server/repos/permission.repository';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * const config = createPermissionRouterConfig({ Repository: PermissionRepository });
 * export const permissionRouter = createRouterWithActor(config);
 * ```
 */

import { z } from "zod";
import type { RouterConfig, RouterFactoryDeps } from "./types";

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

const createPermissionSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().min(1),
});

const updatePermissionSchema = z.object({
  id: z.number(),
  data: z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    category: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  }),
});

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create permission router configuration
 *
 * @param deps - Dependencies including Repository class
 * @returns Router configuration for use with createRouterWithActor
 */
export function createPermissionRouterConfig(
  deps: RouterFactoryDeps
): RouterConfig {
  const { Repository } = deps;

  return {
    // -------------------------------------------------------------------------
    // GET ALL PERMISSIONS
    // -------------------------------------------------------------------------
    getAll: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ repo }) => {
        return repo.findAll();
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL PERMISSIONS WITH USAGE COUNT
    // -------------------------------------------------------------------------
    getAllWithUsage: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ repo }) => {
        return repo.findAllWithUsage();
      },
    },

    // -------------------------------------------------------------------------
    // GET PERMISSIONS BY CATEGORY
    // -------------------------------------------------------------------------
    getByCategory: {
      type: "query" as const,
      input: z.string(),
      cache: { ttl: 300, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ input, repo }) => {
        return repo.findByCategory(input);
      },
    },

    // -------------------------------------------------------------------------
    // GET CATEGORIES WITH COUNTS
    // -------------------------------------------------------------------------
    getCategoriesWithCounts: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ repo }) => {
        return repo.getCategoriesWithCounts();
      },
    },

    // -------------------------------------------------------------------------
    // GET CATEGORIES
    // -------------------------------------------------------------------------
    getCategories: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ repo }) => {
        return repo.getCategories();
      },
    },

    // -------------------------------------------------------------------------
    // GET PERMISSIONS BY ROLE ID
    // -------------------------------------------------------------------------
    getByRoleId: {
      type: "query" as const,
      input: z.number(),
      cache: { ttl: 60, tags: ["permissions", "roles"] },
      repository: Repository,
      handler: async ({ input, repo }) => {
        return repo.findByRoleId(input);
      },
    },

    // -------------------------------------------------------------------------
    // GET PERMISSION BY SLUG
    // -------------------------------------------------------------------------
    getBySlug: {
      type: "query" as const,
      input: z.string(),
      cache: { ttl: 300, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ input, repo }) => {
        const permission = await repo.findBySlug(input);
        if (!permission) {
          throw new Error(`NOT_FOUND: Permission with slug '${input}' not found`);
        }
        return permission;
      },
    },

    // -------------------------------------------------------------------------
    // GET PERMISSION STATISTICS
    // -------------------------------------------------------------------------
    getStats: {
      type: "query" as const,
      cache: { ttl: 60, tags: ["permissions"] },
      repository: Repository,
      handler: async ({ repo }) => {
        return repo.getStats();
      },
    },

    // -------------------------------------------------------------------------
    // CREATE PERMISSION (admin only)
    // -------------------------------------------------------------------------
    create: {
      permission: "admin:manage",
      input: createPermissionSchema,
      invalidates: ["permissions"],
      entityType: "permission",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        // Check for duplicate slug
        const existing = await repo.findBySlug(input.slug);
        if (existing) {
          throw new Error(
            `CONFLICT: Permission with slug '${input.slug}' already exists`
          );
        }

        return repo.create(input, service.userId);
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE PERMISSION (admin only)
    // -------------------------------------------------------------------------
    update: {
      permission: "admin:manage",
      input: updatePermissionSchema,
      invalidates: ["permissions"],
      entityType: "permission",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        const permission = await repo.update(input.id, input.data, service.userId);
        if (!permission) {
          throw new Error(`NOT_FOUND: Permission with ID ${input.id} not found`);
        }
        return permission;
      },
    },

    // -------------------------------------------------------------------------
    // DELETE PERMISSION (admin only - soft delete)
    // -------------------------------------------------------------------------
    delete: {
      permission: "admin:manage",
      input: z.number(),
      invalidates: ["permissions"],
      entityType: "permission",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        const permission = await repo.softDelete(input, service.userId);
        if (!permission) {
          throw new Error(`NOT_FOUND: Permission with ID ${input} not found`);
        }
        return permission;
      },
    },
  };
}

// =============================================================================
// PRE-BUILT ROUTER CONFIG (zero boilerplate)
// =============================================================================

/**
 * Pre-built permission router configuration.
 * Uses SDK's own SDKPermissionRepository.
 * Simply pass to createRouterWithActor for a working permission router.
 *
 * @example
 * ```typescript
 * import { permissionRouterConfig } from '@jetdevs/core/trpc/routers';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const permissionRouter = createRouterWithActor(permissionRouterConfig);
 * ```
 */
import { SDKPermissionRepository } from "../../modules/rbac/permission.repository";

export const permissionRouterConfig = createPermissionRouterConfig({
  Repository: SDKPermissionRepository,
});

// =============================================================================
// SCHEMA EXPORTS
// =============================================================================

export { createPermissionSchema, updatePermissionSchema };

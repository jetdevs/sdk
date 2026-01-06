/**
 * Theme Router Factory
 *
 * Provides a factory function that creates theme router configuration.
 * Apps can use this with their specific repository implementation.
 *
 * Also exports pre-built router configurations using the SDK's own repository
 * for apps that don't need customization.
 *
 * @module @jetdevs/core/trpc/routers
 *
 * @example
 * ```typescript
 * // Option 1: Use factory with custom repository
 * import { createThemeRouterConfig } from '@jetdevs/core/trpc/routers';
 * import { ThemeRepository } from '@/server/repos/theme.repository';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * const config = createThemeRouterConfig({ Repository: ThemeRepository });
 * export const themeRouter = createRouterWithActor(config);
 *
 * // Option 2: Use pre-built router config (simpler, no customization)
 * import { themeRouterConfig, SDKThemeRepository } from '@jetdevs/core/trpc/routers';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const themeRouter = createRouterWithActor(themeRouterConfig);
 * ```
 */

import { z } from "zod";
import { themes } from "../../db/schema/themes";
import { ThemeRepository } from "../../modules/themes/theme.repository";
import type { RouterConfig, RouterFactoryDeps } from "./types";

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

const themeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  description: z.string().optional(),
  cssFile: z.string().min(1).max(255),
  isActive: z.boolean().default(true),
});

const themeUpdateSchema = z.object({
  uuid: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  cssFile: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create theme router configuration
 *
 * @param deps - Dependencies including Repository class
 * @returns Router configuration for use with createRouterWithActor
 */
export function createThemeRouterConfig(deps: RouterFactoryDeps): RouterConfig {
  const { Repository } = deps;

  return {
    // -------------------------------------------------------------------------
    // GET AVAILABLE THEMES (for users - active themes only)
    // -------------------------------------------------------------------------
    getAvailable: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["themes"] },
      repository: Repository,
      handler: async ({ repo }) => {
        const themes = await repo.findAllAvailable();
        return themes.map((theme: any) => ({
          id: theme.id,
          name: theme.name,
          displayName: theme.displayName,
          description: theme.description,
          cssFile: theme.cssFile,
          isDefault: theme.isDefault,
        }));
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL THEMES (admin only - includes inactive)
    // -------------------------------------------------------------------------
    getAll: {
      type: "query" as const,
      permission: "admin:manage",
      cache: { ttl: 60, tags: ["themes"] },
      repository: Repository,
      handler: async ({ repo }) => {
        return repo.findAll();
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL THEMES SYSTEM-WIDE (for system admin)
    // -------------------------------------------------------------------------
    getAllSystem: {
      type: "query" as const,
      permission: "admin:manage",
      cache: { ttl: 60, tags: ["themes"] },
      repository: Repository,
      handler: async ({ repo }) => {
        const themes = await repo.findAll();
        return themes.map((theme: any) => ({
          id: theme.id,
          uuid: theme.uuid,
          name: theme.name,
          displayName: theme.displayName,
          description: theme.description,
          cssFile: theme.cssFile,
          isActive: theme.isActive,
          isDefault: theme.isDefault,
          isGlobal: theme.isGlobal,
          createdAt: theme.createdAt,
          updatedAt: theme.updatedAt,
        }));
      },
    },

    // -------------------------------------------------------------------------
    // GET THEME BY UUID
    // -------------------------------------------------------------------------
    getByUuid: {
      type: "query" as const,
      input: z.string().uuid(),
      cache: { ttl: 60, tags: ["themes"] },
      repository: Repository,
      handler: async ({ input, repo }) => {
        const theme = await repo.findByUuid(input);
        if (!theme) {
          throw new Error(`NOT_FOUND: Theme with UUID ${input} not found`);
        }
        return theme;
      },
    },

    // -------------------------------------------------------------------------
    // GET DEFAULT THEME
    // -------------------------------------------------------------------------
    getDefault: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["themes"] },
      repository: Repository,
      handler: async ({ repo }) => {
        const theme = await repo.findDefault();
        return theme;
      },
    },

    // -------------------------------------------------------------------------
    // CREATE THEME (admin only)
    // -------------------------------------------------------------------------
    create: {
      permission: "admin:manage",
      input: themeCreateSchema,
      invalidates: ["themes"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        // Check if theme name already exists
        const existing = await repo.findByName(input.name);
        if (existing) {
          throw new Error("CONFLICT: A theme with this name already exists");
        }

        const theme = await repo.create(input);
        console.log("Created theme:", {
          themeId: theme.id,
          themeName: theme.name,
        });
        return theme;
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE THEME (admin only)
    // -------------------------------------------------------------------------
    update: {
      permission: "admin:manage",
      input: themeUpdateSchema,
      invalidates: ["themes"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        const { uuid, ...updateData } = input;

        // Check if theme exists
        const existing = await repo.findByUuid(uuid);
        if (!existing) {
          throw new Error("NOT_FOUND: Theme not found");
        }

        // Check name uniqueness if name is being updated
        if (updateData.name && updateData.name !== existing.name) {
          const nameExists = await repo.findByName(updateData.name);
          if (nameExists) {
            throw new Error("CONFLICT: A theme with this name already exists");
          }
        }

        const theme = await repo.update(uuid, updateData);
        return theme;
      },
    },

    // -------------------------------------------------------------------------
    // DELETE THEME (admin only)
    // -------------------------------------------------------------------------
    delete: {
      permission: "admin:manage",
      input: z.string().uuid(),
      invalidates: ["themes"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        // Check if theme exists
        const existing = await repo.findByUuid(input);
        if (!existing) {
          throw new Error("NOT_FOUND: Theme not found");
        }

        // Prevent deletion of default theme
        if (existing.isDefault) {
          throw new Error("FORBIDDEN: Cannot delete the default theme");
        }

        return repo.delete(input);
      },
    },

    // -------------------------------------------------------------------------
    // SET DEFAULT THEME (admin only)
    // -------------------------------------------------------------------------
    setDefault: {
      permission: "admin:manage",
      input: z.string().uuid(),
      invalidates: ["themes"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        // Check if theme exists
        const existing = await repo.findByUuid(input);
        if (!existing) {
          throw new Error("NOT_FOUND: Theme not found");
        }

        return repo.setDefault(input);
      },
    },

    // -------------------------------------------------------------------------
    // TOGGLE THEME ACTIVE STATUS (admin only)
    // -------------------------------------------------------------------------
    toggleActive: {
      permission: "admin:manage",
      input: z.string().uuid(),
      invalidates: ["themes"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        // Check if theme exists
        const existing = await repo.findByUuid(input);
        if (!existing) {
          throw new Error("NOT_FOUND: Theme not found");
        }

        // Prevent deactivating default theme
        if (existing.isDefault && existing.isActive) {
          throw new Error("FORBIDDEN: Cannot deactivate the default theme");
        }

        return repo.toggleActive(input);
      },
    },

    // -------------------------------------------------------------------------
    // GET GLOBAL THEME (public - for ALL users to load the fixed theme)
    // -------------------------------------------------------------------------
    getGlobal: {
      type: "query" as const,
      cache: { ttl: 300, tags: ["themes", "global-theme"] },
      repository: Repository,
      handler: async ({ repo }) => {
        const theme = await repo.findGlobal();
        if (!theme) {
          return null;
        }
        return {
          id: theme.id,
          uuid: theme.uuid,
          name: theme.name,
          displayName: theme.displayName,
          description: theme.description,
          cssFile: theme.cssFile,
          isDefault: theme.isDefault,
          isGlobal: theme.isGlobal,
        };
      },
    },

    // -------------------------------------------------------------------------
    // SET GLOBAL THEME (admin only - sets fixed theme for ALL users)
    // -------------------------------------------------------------------------
    setGlobal: {
      permission: "admin:manage",
      input: z.string().uuid(),
      invalidates: ["themes", "global-theme"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ input, service, repo }) => {
        // Check if theme exists
        const existing = await repo.findByUuid(input);
        if (!existing) {
          throw new Error("NOT_FOUND: Theme not found");
        }

        // Theme must be active to be set as global
        if (!existing.isActive) {
          throw new Error("FORBIDDEN: Cannot set an inactive theme as global");
        }

        return repo.setGlobal(input);
      },
    },

    // -------------------------------------------------------------------------
    // CLEAR GLOBAL THEME (admin only - removes fixed theme, users can choose)
    // -------------------------------------------------------------------------
    clearGlobal: {
      permission: "admin:manage",
      invalidates: ["themes", "global-theme"],
      entityType: "theme",
      repository: Repository,
      handler: async ({ service, repo }) => {
        const cleared = await repo.clearGlobal();
        return { success: cleared };
      },
    },
  };
}

// =============================================================================
// SDK REPOSITORY (Pre-built using SDK's own schema)
// =============================================================================

/**
 * SDK Theme Repository
 *
 * A repository that uses the SDK's own schema.
 * Useful for apps that don't need to customize the theme schema.
 *
 * @example
 * ```typescript
 * import { SDKThemeRepository } from '@jetdevs/core/trpc/routers';
 *
 * // Create repository with app's database client
 * const repo = new SDKThemeRepository(db);
 * const themes = await repo.findAllAvailable();
 * ```
 */
export class SDKThemeRepository extends ThemeRepository {
  constructor(db: any) {
    super(db, { themes });
  }
}

// =============================================================================
// PRE-BUILT ROUTER CONFIG
// =============================================================================

/**
 * Pre-built theme router configuration
 *
 * Uses the SDK's own ThemeRepository and schema.
 * Apps can use this directly without creating their own repository.
 *
 * @example
 * ```typescript
 * import { themeRouterConfig } from '@jetdevs/core/trpc/routers';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * // One-liner to create a theme router
 * export const themeRouter = createRouterWithActor(themeRouterConfig);
 * ```
 */
export const themeRouterConfig: RouterConfig = createThemeRouterConfig({
  Repository: SDKThemeRepository,
});

// =============================================================================
// SCHEMA EXPORTS
// =============================================================================

export { themeCreateSchema, themeUpdateSchema };

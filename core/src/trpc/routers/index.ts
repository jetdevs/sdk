/**
 * Core Router Factories and Pre-built Routers
 *
 * Provides factory functions for creating standard tRPC router configurations.
 * These factories generate router configs that work with the framework's
 * createRouterWithActor helper.
 *
 * Also provides pre-built router configurations using the SDK's own schema
 * and repositories for zero-boilerplate usage.
 *
 * @module @jetdevs/core/trpc/routers
 *
 * @example
 * ```typescript
 * // Option 1: Factory pattern with custom repository (full control)
 * import { createThemeRouterConfig } from '@jetdevs/core/trpc/routers';
 * import { ThemeRepository } from '@/server/repos/theme.repository';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * export const themeRouter = createRouterWithActor(
 *   createThemeRouterConfig({ Repository: ThemeRepository })
 * );
 *
 * // Option 2: Pre-built router config (zero boilerplate)
 * import { themeRouterConfig } from '@jetdevs/core/trpc/routers';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * // One-liner theme router using SDK's own schema
 * export const themeRouter = createRouterWithActor(themeRouterConfig);
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
    CacheConfig, HandlerContext, RouteConfig,
    RouterConfig,
    RouterFactoryDeps,
    RouterFactoryResult, ServiceContext
} from "./types";

// =============================================================================
// ROUTER FACTORIES (for customization)
// =============================================================================

export {
    createPermissionRouterConfig, createPermissionSchema, permissionRouterConfig, updatePermissionSchema
} from "./permission.router";

export {
    createThemeRouterConfig,
    themeCreateSchema,
    themeUpdateSchema
} from "./theme.router";

// =============================================================================
// PRE-BUILT ROUTER CONFIGS (zero boilerplate)
// =============================================================================

/**
 * Pre-built theme router configuration.
 * Uses SDK's own ThemeRepository and schema.
 * Simply pass to createRouterWithActor for a working theme router.
 */
export { SDKThemeRepository, themeRouterConfig } from "./theme.router";


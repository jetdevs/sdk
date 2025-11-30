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
 * @module @yobolabs/core/trpc/routers
 *
 * @example
 * ```typescript
 * // Option 1: Factory pattern with custom repository (full control)
 * import { createThemeRouterConfig } from '@yobolabs/core/trpc/routers';
 * import { ThemeRepository } from '@/server/repos/theme.repository';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * export const themeRouter = createRouterWithActor(
 *   createThemeRouterConfig({ Repository: ThemeRepository })
 * );
 *
 * // Option 2: Pre-built router config (zero boilerplate)
 * import { themeRouterConfig } from '@yobolabs/core/trpc/routers';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * // One-liner theme router using SDK's own schema
 * export const themeRouter = createRouterWithActor(themeRouterConfig);
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  ServiceContext,
  HandlerContext,
  CacheConfig,
  RouteConfig,
  RouterConfig,
  RouterFactoryDeps,
  RouterFactoryResult,
} from "./types";

// =============================================================================
// ROUTER FACTORIES (for customization)
// =============================================================================

export {
  createPermissionRouterConfig,
  permissionRouterConfig,
  createPermissionSchema,
  updatePermissionSchema,
} from "./permission.router";

export {
  createThemeRouterConfig,
  themeCreateSchema,
  themeUpdateSchema,
} from "./theme.router";

// =============================================================================
// PRE-BUILT ROUTER CONFIGS (zero boilerplate)
// =============================================================================

/**
 * Pre-built theme router configuration.
 * Uses SDK's own ThemeRepository and schema.
 * Simply pass to createRouterWithActor for a working theme router.
 */
export { themeRouterConfig, SDKThemeRepository } from "./theme.router";

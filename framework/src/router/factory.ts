/**
 * Router factory for creating secure tRPC routers
 *
 * Automatically applies:
 * - Permission checks
 * - RLS context setup
 * - Input validation
 * - Error handling
 */

import { withRLSContext } from '../db/context';
import type { RouteDefinition, RouterConfig, RouterContext, TRPCAdapter } from './types';

/**
 * Global tRPC adapter instance
 * This is set by the application during initialization
 * @internal
 */
let trpcAdapter: TRPCAdapter | null = null;

/**
 * Configure the router factory with tRPC adapter
 * This must be called once during application initialization
 *
 * @param adapter - tRPC adapter with createRouter and procedure builder functions
 *
 * @example
 * ```typescript
 * // In your app initialization (e.g., src/server/api/trpc.ts)
 * import { configureRouterFactory } from '@jetdevs/framework/router';
 * import { createTRPCRouter, orgProtectedProcedureWithPermission } from './trpc';
 *
 * configureRouterFactory({
 *   createRouter: createTRPCRouter,
 *   createProtectedProcedure: orgProtectedProcedureWithPermission,
 * });
 * ```
 */
export function configureRouterFactory(adapter: TRPCAdapter): void {
  if (trpcAdapter) {
    console.warn('[Framework] Router factory already configured. Overwriting existing configuration.');
  }
  trpcAdapter = adapter;
}

/**
 * Get the current tRPC adapter
 * Throws if not configured
 * @internal
 */
function getTRPCAdapter(): TRPCAdapter {
  if (!trpcAdapter) {
    throw new Error(
      'Router factory not configured. Call configureRouterFactory() during app initialization.\n' +
      'Example:\n' +
      '  import { configureRouterFactory } from \'@jetdevs/framework/router\';\n' +
      '  import { createTRPCRouter, orgProtectedProcedureWithPermission } from \'./trpc\';\n' +
      '  configureRouterFactory({\n' +
      '    createRouter: createTRPCRouter,\n' +
      '    createProtectedProcedure: orgProtectedProcedureWithPermission,\n' +
      '  });'
    );
  }
  return trpcAdapter;
}

/**
 * Create a secure tRPC router with built-in permission and RLS handling
 *
 * This factory wraps tRPC router creation and automatically applies:
 * - Permission checks from route definitions
 * - RLS context for database operations
 * - Input validation with Zod schemas
 * - Standardized error handling
 *
 * @param routes - Route configuration object
 * @returns tRPC router object
 *
 * @example
 * ```typescript
 * import { createRouter } from '@jetdevs/framework/router';
 * import { z } from 'zod';
 *
 * export const campaignRouter = createRouter({
 *   list: {
 *     permission: 'campaign:read',
 *     handler: async (ctx) => {
 *       // Permission already checked
 *       // RLS context already set
 *       return campaignRepo.findMany();
 *     },
 *   },
 *   create: {
 *     permission: 'campaign:create',
 *     input: z.object({
 *       name: z.string(),
 *       status: z.enum(['draft', 'active']),
 *     }),
 *     handler: async (ctx, input) => {
 *       // Input is validated and typed
 *       return campaignRepo.create(input);
 *     },
 *   },
 * });
 * ```
 */
export function createRouter(routes: RouterConfig): Record<string, unknown> {
  const adapter = getTRPCAdapter();
  const procedures: Record<string, unknown> = {};

  for (const [name, route] of Object.entries(routes)) {
    procedures[name] = createProcedure(adapter, route);
  }

  return adapter.createRouter(procedures);
}

/**
 * Create a single tRPC procedure from route definition
 * @internal
 */
function createProcedure(adapter: TRPCAdapter, route: RouteDefinition): unknown {
  // Start with permission-protected procedure if permission is specified
  let procedure = route.permission
    ? adapter.createProtectedProcedure(route.permission)
    : adapter.createPublicProcedure?.() ?? adapter.createProtectedProcedure('');

  // Add input schema if specified
  if (route.input) {
    procedure = procedure.input(route.input);
  }

  // Determine if this is a query or mutation based on route type
  const isQuery = !route.input || route.type === 'query';
  const procedureType = isQuery ? 'query' : 'mutation';

  // Wrap handler with RLS context and error handling
  const wrappedHandler = async (ctx: RouterContext, input?: unknown) => {
    try {
      // Set up RLS context from tRPC context
      const rlsContext = {
        orgId: ctx.activeOrgId ?? ctx.session?.user?.currentOrgId,
        workspaceId: ctx.activeWorkspaceId,
        userId: ctx.session?.user?.id,
      };

      // Execute handler within RLS context
      return await withRLSContext(rlsContext, async () => {
        return await route.handler(ctx, input);
      });
    } catch (error) {
      // Re-throw with additional context
      if (error instanceof Error) {
        error.message = `[${route.description ?? 'Route'}] ${error.message}`;
      }
      throw error;
    }
  };

  // Attach the handler based on procedure type
  return procedure[procedureType](async ({ ctx, input }: { ctx: RouterContext; input?: unknown }) => {
    return wrappedHandler(ctx, input);
  });
}

/**
 * Helper to create a route group with shared permission
 *
 * @param basePermission - Permission required for all routes in this group
 * @param routes - Route definitions
 *
 * @example
 * ```typescript
 * const adminRoutes = createRouteGroup('admin:access', {
 *   listUsers: {
 *     handler: async (ctx) => userRepo.findMany(),
 *   },
 *   deleteUser: {
 *     input: z.object({ id: z.number() }),
 *     handler: async (ctx, input) => userRepo.delete(input.id),
 *   },
 * });
 * ```
 */
export function createRouteGroup(
  basePermission: string,
  routes: RouterConfig
): RouterConfig {
  const groupedRoutes: RouterConfig = {};

  for (const [name, route] of Object.entries(routes)) {
    groupedRoutes[name] = {
      ...route,
      // Use route permission if specified, otherwise use base permission
      permission: route.permission || basePermission,
    };
  }

  return groupedRoutes;
}

/**
 * Create a router factory bound to specific tRPC setup
 * This is an alternative to using configureRouterFactory globally
 *
 * @param adapter - tRPC adapter with createRouter and procedure builder functions
 * @returns createRouter function bound to this adapter
 *
 * @example
 * ```typescript
 * // In your app (src/server/api/sdk-router.ts)
 * import { createRouterFactory } from '@jetdevs/framework/router';
 * import { createTRPCRouter, orgProtectedProcedureWithPermission } from './trpc';
 *
 * export const createSDKRouter = createRouterFactory({
 *   createRouter: createTRPCRouter,
 *   createProtectedProcedure: orgProtectedProcedureWithPermission,
 * });
 *
 * // Then use it in your routers
 * export const campaignRouter = createSDKRouter({
 *   list: { ... },
 * });
 * ```
 */
export function createRouterFactory(adapter: TRPCAdapter) {
  return function createBoundRouter(routes: RouterConfig): Record<string, unknown> {
    const procedures: Record<string, unknown> = {};

    for (const [name, route] of Object.entries(routes)) {
      procedures[name] = createProcedure(adapter, route);
    }

    return adapter.createRouter(procedures);
  };
}

/**
 * Router Module - Public API
 *
 * Factory for creating secure tRPC routers with built-in permission checks
 *
 * @example
 * ```typescript
 * import { createRouter, createRouteGroup, configureRouterFactory } from '@yobo/framework/router';
 *
 * // Configure once during app initialization
 * configureRouterFactory({
 *   createRouter: createTRPCRouter,
 *   createProtectedProcedure: orgProtectedProcedureWithPermission,
 * });
 *
 * // Then use createRouter in your routers
 * const campaignRouter = createRouter({
 *   list: {
 *     permission: 'campaign:read',
 *     handler: async (ctx) => campaignRepo.findMany(),
 *   },
 * });
 * ```
 */

export {
  createRouter,
  createRouteGroup,
  configureRouterFactory,
  createRouterFactory,
} from './factory';

export type {
  RouterContext,
  RouteHandler,
  RouteDefinition,
  RouterConfig,
  TRPCAdapter,
  TRPCProcedureBuilder,
} from './types';

// Internal procedure creation logic is NOT exported

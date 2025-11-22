/**
 * Router Module - Public API
 *
 * Factory for creating secure tRPC routers with built-in permission checks
 *
 * @example
 * ```typescript
 * import { createRouter, createRouteGroup, configureRouterFactory } from '@yobolabs/framework/router';
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
    configureRouterFactory, createRouteGroup, createRouter, createRouterFactory
} from './factory';

export type {
    RouteDefinition, RouteHandler, RouterConfig, RouterContext, TRPCAdapter,
    TRPCProcedureBuilder
} from './types';

// Router with Actor Context - Phase 3 Enhancement
export {
    configureActorAdapter,
    createRouterWithActor,
    defineRoute,
    defineRouter,
} from './with-actor';

export type {
    ActorContextAdapter,
    HandlerContext,
    RouteConfig,
    RouterConfig as ActorRouterConfig,
    ServiceContext,
} from './with-actor';

// Internal procedure creation logic is NOT exported

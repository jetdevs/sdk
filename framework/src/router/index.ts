/**
 * Router Module - Public API
 *
 * Factory for creating secure tRPC routers with built-in permission checks
 *
 * @example
 * ```typescript
 * import { createRouter, createRouteGroup, configureRouterFactory } from '@jetdevs/framework/router';
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
    defineRouter
} from './with-actor';

export type {
    ActorContextAdapter, RouterConfig as ActorRouterConfig, HandlerContext,
    InferRouterFromConfig,
    RouteConfig, ServiceContext
} from './with-actor';

// Re-export zod to ensure all consumers use the same instance
// This prevents type mismatches when different packages have different zod versions
export { z } from 'zod';

// Internal procedure creation logic is NOT exported

/**
 * REAL Router Factory Implementation
 *
 * This is the actual implementation that creates real tRPC routers.
 * It imports from the merchant-portal app to create proper procedures.
 */

import type { RouterConfig } from './types';

// NOTE: These imports would need to come from the app
// For now, we'll document what's needed

/**
 * To make the SDK work with your actual tRPC setup, you need to:
 *
 * 1. Import tRPC setup from your app:
 *    import { createTRPCRouter, orgProtectedProcedureWithPermission } from '@/server/api/trpc';
 *
 * 2. Use these to create real procedures
 *
 * The challenge is that the SDK can't import from the app directly
 * (circular dependency). So we have two options:
 *
 * OPTION A: SDK provides a factory that takes tRPC setup as parameter
 * OPTION B: App provides a wrapper that uses SDK types but creates tRPC routers
 */

/**
 * OPTION B IMPLEMENTATION (Recommended)
 *
 * Instead of SDK creating routers, provide this helper in your app:
 *
 * File: src/server/api/sdk-router-factory.ts
 */

export const EXAMPLE_APP_SIDE_IMPLEMENTATION = `
// File: apps/merchant-portal/src/server/api/sdk-router-factory.ts

import { createTRPCRouter, orgProtectedProcedureWithPermission } from './trpc';
import type { RouterConfig } from '@yobo/framework/router';

/**
 * Create a tRPC router from SDK route configuration
 *
 * This bridges the SDK and your tRPC setup
 */
export function createSDKRouter(routes: RouterConfig) {
  const procedures: Record<string, any> = {};

  for (const [name, route] of Object.entries(routes)) {
    // Start with permission-protected procedure
    let procedure = orgProtectedProcedureWithPermission(route.permission);

    // Add cache metadata if specified
    if (route.cache) {
      procedure = procedure.meta({
        cacheControl: {
          scope: 'user',
          sMaxAge: route.cache.ttl,
          staleWhileRevalidate: route.cache.staleWhileRevalidate,
        },
        cacheTags: route.cache.tags,
      });
    }

    // Add invalidation metadata if specified
    if (route.invalidate) {
      procedure = procedure.meta({
        invalidateTags: route.invalidate,
      });
    }

    // Add input schema if specified
    if (route.input) {
      procedure = procedure.input(route.input);
    }

    // Add handler based on type
    if (route.handler) {
      if (route.input) {
        // Mutation with input
        procedures[name] = procedure.mutation(async ({ ctx, input }) => {
          return route.handler(ctx, input);
        });
      } else {
        // Query without input
        procedures[name] = procedure.query(async ({ ctx }) => {
          return route.handler(ctx);
        });
      }
    }
  }

  return createTRPCRouter(procedures);
}
`;

/**
 * For immediate testing, here's a simpler approach:
 *
 * Don't use createRouter() from SDK yet.
 * Instead, manually create a hybrid approach in the test router.
 */

export const HYBRID_APPROACH = `
// File: apps/merchant-portal/src/server/api/routers/campaigns.router.sdk-test.ts

import { createTRPCRouter, orgProtectedProcedureWithPermission } from "@/server/api/trpc";
import { createRepository } from '@yobo/framework/db';
import { CampaignPermissions } from "@/types/permissions";

export const campaignsRouterSDK = createTRPCRouter({
  // Use tRPC directly, but with SDK repository
  list: orgProtectedProcedureWithPermission(CampaignPermissions.READ)
    .input(listCampaignsSchema)
    .query(async ({ ctx, input }) => {
      // THIS is where we use the SDK
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      return repo.findMany({
        where: input.status ? { status: input.status } : undefined,
        limit: input.pageSize || 20,
      });
    }),
});
`;

export { EXAMPLE_APP_SIDE_IMPLEMENTATION as APP_IMPLEMENTATION, HYBRID_APPROACH };

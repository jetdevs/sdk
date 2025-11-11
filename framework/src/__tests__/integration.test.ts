/**
 * Integration Tests
 * Tests the complete framework flow: Auth -> RLS Context -> Repository -> Router
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureAuth, getSession, getCurrentOrgId } from '../auth';
import { withRLSContext, getRLSContext } from '../db/context';
import { createRepository } from '../db/repository';
import {
  configureRouterFactory,
  createRouter,
  createRouteGroup,
} from '../router';
import { z } from 'zod';
import type { Session, AuthAdapter } from '../auth/types';
import type { TRPCAdapter, TRPCProcedureBuilder } from '../router/types';

describe('Framework Integration Tests', () => {
  let mockDb: any;
  let mockAuthAdapter: AuthAdapter;
  let mockRouterAdapter: TRPCAdapter;
  let mockProcedure: TRPCProcedureBuilder;

  const mockSession: Session = {
    user: {
      id: 100,
      email: 'test@example.com',
      currentOrgId: 1,
      permissions: ['campaign:read', 'campaign:create', 'campaign:update'],
    },
    expires: '2025-12-31T23:59:59Z',
  };

  beforeEach(() => {
    // Setup mock database
    mockDb = {
      query: {
        campaigns: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, name: 'Campaign 1', org_id: 1 },
            { id: 2, name: 'Campaign 2', org_id: 1 },
          ]),
          findFirst: vi.fn().mockResolvedValue({ id: 1, name: 'Campaign 1', org_id: 1 }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 3, name: 'New Campaign', org_id: 1 },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: 1, name: 'Updated Campaign', org_id: 1 },
            ]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };

    // Setup auth adapter
    mockAuthAdapter = {
      getSession: vi.fn().mockResolvedValue(mockSession),
      switchOrg: vi.fn().mockResolvedValue(undefined),
    };
    configureAuth(mockAuthAdapter);

    // Setup router adapter
    mockProcedure = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockImplementation((handler) => handler),
      mutation: vi.fn().mockImplementation((handler) => handler),
    };

    mockRouterAdapter = {
      createRouter: vi.fn((procedures) => procedures),
      createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
    };
    configureRouterFactory(mockRouterAdapter);
  });

  describe('Complete CRUD Flow with RLS', () => {
    it('should execute complete campaign CRUD with automatic RLS enforcement', async () => {
      // Define route configuration
      const campaignRoutes = {
        list: {
          permission: 'campaign:read',
          type: 'query' as const,
          handler: async (ctx: any) => {
            const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
            return await repo.findMany();
          },
        },
        create: {
          permission: 'campaign:create',
          input: z.object({ name: z.string() }),
          handler: async (ctx: any, input: any) => {
            const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
            return await repo.create(input);
          },
        },
        update: {
          permission: 'campaign:update',
          input: z.object({ id: z.number(), name: z.string() }),
          handler: async (ctx: any, input: any) => {
            const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
            return await repo.update(input.id, { name: input.name });
          },
        },
      };

      // Create router
      const router = createRouter(campaignRoutes);

      // Simulate tRPC context
      const ctx = {
        session: mockSession,
        db: mockDb,
        activeOrgId: 1,
      };

      // Execute within RLS context
      const results = await withRLSContext(
        { orgId: 1, userId: 100 },
        async () => {
          // List campaigns
          const listHandler = router.list as any;
          const campaigns = await listHandler({ ctx });

          // Create campaign
          const createHandler = router.create as any;
          const newCampaign = await createHandler({
            ctx,
            input: { name: 'New Campaign' },
          });

          // Update campaign
          const updateHandler = router.update as any;
          const updatedCampaign = await updateHandler({
            ctx,
            input: { id: 1, name: 'Updated Campaign' },
          });

          return { campaigns, newCampaign, updatedCampaign };
        }
      );

      // Verify operations completed
      expect(results.campaigns).toHaveLength(2);
      expect(results.newCampaign.name).toBe('New Campaign');
      expect(results.updatedCampaign.name).toBe('Updated Campaign');

      // Verify org_id was enforced in queries
      expect(mockDb.query.campaigns.findMany).toHaveBeenCalledWith({
        where: { org_id: 1 },
      });
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should properly isolate data between concurrent org requests', async () => {
      const campaignRepo = createRepository('campaigns', { orgScoped: true }, mockDb);

      // Simulate concurrent requests from different orgs
      const [org1Data, org2Data] = await Promise.all([
        withRLSContext({ orgId: 1, userId: 100 }, async () => {
          return await campaignRepo.findMany();
        }),
        withRLSContext({ orgId: 2, userId: 200 }, async () => {
          return await campaignRepo.findMany();
        }),
      ]);

      // Verify both requests completed
      expect(org1Data).toBeDefined();
      expect(org2Data).toBeDefined();

      // Verify each request was scoped to correct org
      const calls = mockDb.query.campaigns.findMany.mock.calls;
      expect(calls).toContainEqual([{ where: { org_id: 1 } }]);
      expect(calls).toContainEqual([{ where: { org_id: 2 } }]);
    });

    it('should prevent data leakage across org boundaries', async () => {
      const campaignRepo = createRepository('campaigns', { orgScoped: true }, mockDb);

      // Org 1 creates a campaign
      const org1Campaign = await withRLSContext(
        { orgId: 1, userId: 100 },
        async () => {
          return await campaignRepo.create({ name: 'Org 1 Campaign' });
        }
      );

      // Org 2 creates a campaign
      const org2Campaign = await withRLSContext(
        { orgId: 2, userId: 200 },
        async () => {
          return await campaignRepo.create({ name: 'Org 2 Campaign' });
        }
      );

      // Verify each campaign was created with correct org_id
      const insertChain = mockDb.insert();
      const calls = insertChain.values.mock.calls;

      expect(calls).toContainEqual([{ name: 'Org 1 Campaign', org_id: 1 }]);
      expect(calls).toContainEqual([{ name: 'Org 2 Campaign', org_id: 2 }]);
    });
  });

  describe('Permission-based Route Protection', () => {
    it('should apply permissions to all routes in a group', () => {
      const adminRoutes = createRouteGroup('admin:access', {
        listUsers: {
          handler: async (ctx: any) => [],
        },
        deleteUser: {
          input: z.object({ id: z.number() }),
          handler: async (ctx: any, input: any) => undefined,
        },
      });

      const router = createRouter(adminRoutes);

      // Verify createProtectedProcedure was called with admin permission
      expect(mockRouterAdapter.createProtectedProcedure).toHaveBeenCalledWith(
        'admin:access'
      );
    });
  });

  describe('Auth Integration with RLS', () => {
    it('should use session org_id for RLS context', async () => {
      const session = await getSession();
      const orgId = await getCurrentOrgId();

      expect(orgId).toBe(mockSession.user.currentOrgId);

      // Use org ID from session for RLS context
      await withRLSContext({ orgId, userId: session!.user.id }, async () => {
        const context = getRLSContext();
        expect(context.orgId).toBe(mockSession.user.currentOrgId);
      });
    });

    it('should handle org switching and update RLS context', async () => {
      const session = await getSession();
      const userId = session!.user.id;

      // Switch to new org
      await mockAuthAdapter.switchOrg(userId, 5);

      // Verify switch was called
      expect(mockAuthAdapter.switchOrg).toHaveBeenCalledWith(userId, 5);

      // In real scenario, next request would have new org_id in session
      // and RLS context would automatically use new org
    });
  });

  describe('Error Handling', () => {
    it('should propagate repository errors through router', async () => {
      mockDb.query.campaigns.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const routes = {
        list: {
          permission: 'campaign:read',
          handler: async (ctx: any) => {
            const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
            return await repo.findMany();
          },
        },
      };

      const router = createRouter(routes);
      const ctx = { session: mockSession, db: mockDb, activeOrgId: 1 };

      await expect(
        withRLSContext({ orgId: 1, userId: 100 }, async () => {
          const handler = router.list as any;
          return await handler({ ctx });
        })
      ).rejects.toThrow('Database connection failed');
    });

    it('should provide helpful error when RLS context missing', async () => {
      const routes = {
        list: {
          handler: async (ctx: any) => {
            const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
            return await repo.findMany();
          },
        },
      };

      const router = createRouter(routes);
      const ctx = { session: mockSession, db: mockDb };

      // Attempt to use repository without RLS context
      // The router factory automatically wraps handlers with RLS context from ctx
      // So we need to test without the router wrapper
      await expect(
        (async () => {
          // Call handler directly without router wrapper
          const repo = createRepository('campaigns', { orgScoped: true }, mockDb);
          return await repo.findMany();
        })()
      ).rejects.toThrow('No RLS context available');
    });
  });

  describe('Performance - Concurrent Request Handling', () => {
    it('should handle 50 concurrent requests without context mixing', async () => {
      const campaignRepo = createRepository('campaigns', { orgScoped: true }, mockDb);

      const requests = Array.from({ length: 50 }, (_, i) => {
        const orgId = (i % 5) + 1; // 5 different orgs
        const userId = i;

        return withRLSContext({ orgId, userId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
          return await campaignRepo.findMany();
        });
      });

      const results = await Promise.all(requests);

      // All requests should complete
      expect(results).toHaveLength(50);

      // Verify correct number of database calls
      expect(mockDb.query.campaigns.findMany).toHaveBeenCalledTimes(50);
    });
  });
});

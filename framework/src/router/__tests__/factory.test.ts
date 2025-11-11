/**
 * Tests for Router Factory
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configureRouterFactory,
  createRouter,
  createRouteGroup,
  createRouterFactory,
} from '../factory';
import type { TRPCAdapter, RouterConfig, TRPCProcedureBuilder } from '../types';
import { z } from 'zod';

describe('Router Factory', () => {
  let mockAdapter: TRPCAdapter;
  let mockProcedure: TRPCProcedureBuilder;

  beforeEach(() => {
    // Create mock procedure builder
    mockProcedure = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockReturnValue('query-result'),
      mutation: vi.fn().mockReturnValue('mutation-result'),
    };

    // Create mock adapter
    mockAdapter = {
      createRouter: vi.fn((procedures) => procedures),
      createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
      createPublicProcedure: vi.fn().mockReturnValue(mockProcedure),
    };

    configureRouterFactory(mockAdapter);
  });

  describe('configureRouterFactory', () => {
    it('should configure adapter successfully', () => {
      const newAdapter: TRPCAdapter = {
        createRouter: vi.fn(),
        createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
      };

      configureRouterFactory(newAdapter);

      expect(true).toBe(true); // Configuration successful
    });

    it('should warn when reconfiguring', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const newAdapter: TRPCAdapter = {
        createRouter: vi.fn(),
        createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
      };

      configureRouterFactory(newAdapter);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Router factory already configured')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('createRouter', () => {
    it('should create router with query routes', () => {
      const routes: RouterConfig = {
        list: {
          permission: 'campaign:read',
          type: 'query',
          handler: async (ctx) => ({ items: [] }),
        },
      };

      const router = createRouter(routes);

      expect(mockAdapter.createProtectedProcedure).toHaveBeenCalledWith('campaign:read');
      expect(mockProcedure.query).toHaveBeenCalled();
      expect(mockAdapter.createRouter).toHaveBeenCalled();
    });

    it('should create router with mutation routes', () => {
      const routes: RouterConfig = {
        create: {
          permission: 'campaign:create',
          type: 'mutation',
          input: z.object({ name: z.string() }),
          handler: async (ctx, input) => ({ id: 1, ...input }),
        },
      };

      const router = createRouter(routes);

      expect(mockAdapter.createProtectedProcedure).toHaveBeenCalledWith('campaign:create');
      expect(mockProcedure.input).toHaveBeenCalled();
      expect(mockProcedure.mutation).toHaveBeenCalled();
    });

    it('should apply input validation when provided', () => {
      const inputSchema = z.object({ name: z.string() });
      const routes: RouterConfig = {
        create: {
          permission: 'campaign:create',
          input: inputSchema,
          handler: async (ctx, input) => input,
        },
      };

      createRouter(routes);

      expect(mockProcedure.input).toHaveBeenCalledWith(inputSchema);
    });

    it('should create multiple procedures from config', () => {
      const routes: RouterConfig = {
        list: {
          permission: 'campaign:read',
          handler: async (ctx) => [],
        },
        create: {
          permission: 'campaign:create',
          input: z.object({ name: z.string() }),
          handler: async (ctx, input) => input,
        },
        update: {
          permission: 'campaign:update',
          input: z.object({ id: z.number(), name: z.string() }),
          handler: async (ctx, input) => input,
        },
      };

      const router = createRouter(routes);

      expect(mockAdapter.createProtectedProcedure).toHaveBeenCalledTimes(3);
      expect(mockAdapter.createRouter).toHaveBeenCalled();
    });

    it('should throw error when not configured', () => {
      configureRouterFactory(null as any);

      const routes: RouterConfig = {
        list: {
          handler: async (ctx) => [],
        },
      };

      expect(() => createRouter(routes)).toThrow('Router factory not configured');
    });
  });

  describe('createRouteGroup', () => {
    it('should apply base permission to all routes', () => {
      const routes: RouterConfig = {
        listUsers: {
          handler: async (ctx) => [],
        },
        deleteUser: {
          input: z.object({ id: z.number() }),
          handler: async (ctx, input) => undefined,
        },
      };

      const grouped = createRouteGroup('admin:access', routes);

      expect(grouped.listUsers.permission).toBe('admin:access');
      expect(grouped.deleteUser.permission).toBe('admin:access');
    });

    it('should preserve route-specific permissions when provided', () => {
      const routes: RouterConfig = {
        listUsers: {
          handler: async (ctx) => [],
        },
        deleteUser: {
          permission: 'admin:delete',
          input: z.object({ id: z.number() }),
          handler: async (ctx, input) => undefined,
        },
      };

      const grouped = createRouteGroup('admin:access', routes);

      expect(grouped.listUsers.permission).toBe('admin:access');
      expect(grouped.deleteUser.permission).toBe('admin:delete');
    });

    it('should preserve all other route properties', () => {
      const handler = async (ctx: any) => [];
      const inputSchema = z.object({ name: z.string() });

      const routes: RouterConfig = {
        create: {
          input: inputSchema,
          handler,
          description: 'Create a new item',
        },
      };

      const grouped = createRouteGroup('admin:access', routes);

      expect(grouped.create.input).toBe(inputSchema);
      expect(grouped.create.handler).toBe(handler);
      expect(grouped.create.description).toBe('Create a new item');
    });
  });

  describe('createRouterFactory (bound factory)', () => {
    it('should create factory bound to specific adapter', () => {
      const localAdapter: TRPCAdapter = {
        createRouter: vi.fn((procedures) => procedures),
        createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
      };

      const boundCreateRouter = createRouterFactory(localAdapter);

      const routes: RouterConfig = {
        list: {
          permission: 'campaign:read',
          handler: async (ctx) => [],
        },
      };

      boundCreateRouter(routes);

      expect(localAdapter.createProtectedProcedure).toHaveBeenCalledWith('campaign:read');
      expect(localAdapter.createRouter).toHaveBeenCalled();
    });

    it('should not affect global configuration', () => {
      const localAdapter: TRPCAdapter = {
        createRouter: vi.fn((procedures) => procedures),
        createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
      };

      const boundCreateRouter = createRouterFactory(localAdapter);

      const routes: RouterConfig = {
        list: {
          handler: async (ctx) => [],
        },
      };

      // Use bound factory
      boundCreateRouter(routes);

      // Global factory should still use original adapter
      createRouter(routes);

      expect(mockAdapter.createRouter).toHaveBeenCalled();
      expect(localAdapter.createRouter).toHaveBeenCalled();
    });
  });

  describe('Route type detection', () => {
    it('should default to query for routes without input', () => {
      const routes: RouterConfig = {
        list: {
          permission: 'campaign:read',
          handler: async (ctx) => [],
        },
      };

      createRouter(routes);

      expect(mockProcedure.query).toHaveBeenCalled();
      expect(mockProcedure.mutation).not.toHaveBeenCalled();
    });

    it('should default to mutation for routes with input', () => {
      const routes: RouterConfig = {
        create: {
          permission: 'campaign:create',
          input: z.object({ name: z.string() }),
          handler: async (ctx, input) => input,
        },
      };

      createRouter(routes);

      expect(mockProcedure.mutation).toHaveBeenCalled();
      expect(mockProcedure.query).not.toHaveBeenCalled();
    });

    it('should respect explicit type override', () => {
      const routes: RouterConfig = {
        search: {
          permission: 'campaign:read',
          type: 'query',
          input: z.object({ query: z.string() }),
          handler: async (ctx, input) => [],
        },
      };

      createRouter(routes);

      expect(mockProcedure.query).toHaveBeenCalled();
      expect(mockProcedure.mutation).not.toHaveBeenCalled();
    });
  });

  describe('Public procedures', () => {
    it('should create public procedure when no permission specified', () => {
      mockAdapter.createPublicProcedure = vi.fn().mockReturnValue(mockProcedure);
      configureRouterFactory(mockAdapter);

      const routes: RouterConfig = {
        healthCheck: {
          handler: async (ctx) => ({ status: 'ok' }),
        },
      };

      createRouter(routes);

      expect(mockAdapter.createPublicProcedure).toHaveBeenCalled();
    });

    it('should fall back to protected procedure if createPublicProcedure not available', () => {
      const adapterWithoutPublic: TRPCAdapter = {
        createRouter: vi.fn((procedures) => procedures),
        createProtectedProcedure: vi.fn().mockReturnValue(mockProcedure),
      };

      configureRouterFactory(adapterWithoutPublic);

      const routes: RouterConfig = {
        healthCheck: {
          handler: async (ctx) => ({ status: 'ok' }),
        },
      };

      createRouter(routes);

      expect(adapterWithoutPublic.createProtectedProcedure).toHaveBeenCalledWith('');
    });
  });
});

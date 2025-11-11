/**
 * Tests for Repository with RLS enforcement
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRepository } from '../repository';
import { withRLSContext, getRLSContext } from '../context';
import type { Repository } from '../types';

describe('Repository', () => {
  // Mock database client
  let mockDb: any;
  let repository: Repository<any>;

  beforeEach(() => {
    // Create a fresh mock database client for each test
    mockDb = {
      query: {
        test_table: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, name: 'Test' }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1, name: 'Updated' }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };
  });

  describe('Org-scoped repository', () => {
    beforeEach(() => {
      repository = createRepository('test_table', { orgScoped: true }, mockDb);
    });

    it('should throw when no RLS context is available', async () => {
      await expect(repository.findMany()).rejects.toThrow('No RLS context available');
    });

    it('should automatically filter by org_id on findMany', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await repository.findMany({ status: 'active' });

        expect(mockDb.query.test_table.findMany).toHaveBeenCalledWith({
          where: { status: 'active', org_id: 1 },
        });
      });
    });

    it('should automatically filter by org_id on findOne', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await repository.findOne(42);

        expect(mockDb.query.test_table.findFirst).toHaveBeenCalledWith({
          where: { id: 42, org_id: 1 },
        });
      });
    });

    it('should automatically inject org_id on create', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        const result = await repository.create({ name: 'Test' });

        expect(mockDb.insert).toHaveBeenCalledWith('test_table');
        const insertChain = mockDb.insert();
        expect(insertChain.values).toHaveBeenCalledWith({ name: 'Test', org_id: 1 });
        expect(result).toEqual({ id: 1, name: 'Test' });
      });
    });

    it('should prevent changing org_id on update', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await repository.update(42, { name: 'Updated', org_id: 999 } as any);

        const updateChain = mockDb.update();
        const setChain = updateChain.set();

        // Should strip out org_id
        expect(updateChain.set).toHaveBeenCalledWith({ name: 'Updated' });
      });
    });

    it('should scope delete to current org', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await repository.delete(42);

        const deleteChain = mockDb.delete();
        expect(deleteChain.where).toHaveBeenCalledWith({ id: 42, org_id: 1 });
      });
    });

    it('should count with org filter', async () => {
      mockDb.query.test_table.findMany.mockResolvedValue([{}, {}, {}]);

      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        const count = await repository.count({ status: 'active' });

        expect(mockDb.query.test_table.findMany).toHaveBeenCalledWith({
          where: { status: 'active', org_id: 1 },
        });
        expect(count).toBe(3);
      });
    });

    it('should isolate data between different org contexts', async () => {
      // Clear previous calls
      mockDb.query.test_table.findMany.mockClear();

      // Simulate two concurrent requests with different orgs
      await Promise.all([
        withRLSContext({ orgId: 1, userId: 100 }, async () => {
          await repository.findMany();
        }),
        withRLSContext({ orgId: 2, userId: 200 }, async () => {
          await repository.findMany();
        }),
      ]);

      // Check that both org_id values were used in calls
      const calls = mockDb.query.test_table.findMany.mock.calls;
      const orgIds = calls.map((call: any) => call[0].where.org_id);

      expect(orgIds).toContain(1);
      expect(orgIds).toContain(2);
      expect(calls.length).toBe(2);
    });
  });

  describe('Workspace-scoped repository', () => {
    beforeEach(() => {
      repository = createRepository(
        'test_table',
        { orgScoped: true, workspaceScoped: true },
        mockDb
      );
    });

    it('should inject workspace_id on create when available', async () => {
      await withRLSContext({ orgId: 1, workspaceId: 10, userId: 100 }, async () => {
        await repository.create({ name: 'Test' });

        const insertChain = mockDb.insert();
        expect(insertChain.values).toHaveBeenCalledWith({
          name: 'Test',
          org_id: 1,
          workspace_id: 10,
        });
      });
    });

    it('should not inject workspace_id when not available in context', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await repository.create({ name: 'Test' });

        const insertChain = mockDb.insert();
        expect(insertChain.values).toHaveBeenCalledWith({
          name: 'Test',
          org_id: 1,
        });
      });
    });
  });

  describe('Non-org-scoped repository', () => {
    beforeEach(() => {
      repository = createRepository('test_table', { orgScoped: false }, mockDb);
    });

    it('should work without RLS context', async () => {
      // Non-org-scoped tables don't require RLS context
      await repository.findMany({ status: 'active' });

      expect(mockDb.query.test_table.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
      });
    });

    it('should not inject org_id on create', async () => {
      // Non-org-scoped tables don't inject org_id
      await repository.create({ name: 'Test' });

      const insertChain = mockDb.insert();
      expect(insertChain.values).toHaveBeenCalledWith({ name: 'Test' });
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      repository = createRepository('test_table', { orgScoped: true }, mockDb);
    });

    it('should throw descriptive error when create fails', async () => {
      mockDb.insert().values().returning.mockResolvedValue([]);

      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await expect(repository.create({ name: 'Test' })).rejects.toThrow(
          'Failed to create record in test_table'
        );
      });
    });

    it('should throw descriptive error when update fails', async () => {
      mockDb.update().set().where().returning.mockResolvedValue([]);

      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        await expect(repository.update(42, { name: 'Updated' })).rejects.toThrow(
          'Failed to update record 42 in test_table'
        );
      });
    });

    it('should provide helpful error message when org context is missing', async () => {
      // The error comes from getRLSContext which throws before the org-specific check
      await expect(repository.findMany()).rejects.toThrow('No RLS context available');
    });
  });

  describe('Security Tests - Permission Bypass Prevention', () => {
    beforeEach(() => {
      repository = createRepository('test_table', { orgScoped: true }, mockDb);
    });

    it('should prevent accessing other org data even with explicit org_id in filter', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        // User tries to pass org_id: 2 to access another org's data
        await repository.findMany({ org_id: 2 } as any);

        // Should override with current org
        expect(mockDb.query.test_table.findMany).toHaveBeenCalledWith({
          where: { org_id: 1 },
        });
      });
    });

    it('should prevent creating records for other orgs', async () => {
      await withRLSContext({ orgId: 1, userId: 100 }, async () => {
        // User tries to create record for org 2
        await repository.create({ name: 'Test', org_id: 2 } as any);

        // Should force org_id to current org
        const insertChain = mockDb.insert();
        expect(insertChain.values).toHaveBeenCalledWith({
          name: 'Test',
          org_id: 1, // Forced to current org
        });
      });
    });

    it('should prevent privilege escalation via concurrent requests', async () => {
      // Clear previous calls
      mockDb.query.test_table.findMany.mockClear();

      // Track which context each request was in
      const requestContexts: { requestId: number; orgId: number }[] = [];

      // Simulate rapid concurrent requests
      await Promise.all([
        ...Array.from({ length: 10 }, (_, i) =>
          withRLSContext({ orgId: 1, userId: 100 }, async () => {
            const ctx = getRLSContext();
            await repository.findMany();
            requestContexts.push({ requestId: i, orgId: ctx.orgId });
          })
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          withRLSContext({ orgId: 2, userId: 200 }, async () => {
            const ctx = getRLSContext();
            await repository.findMany();
            requestContexts.push({ requestId: i + 10, orgId: ctx.orgId });
          })
        ),
      ]);

      // All findMany calls should have been made
      expect(mockDb.query.test_table.findMany).toHaveBeenCalledTimes(20);

      // Check that all calls used correct org_id
      const calls = mockDb.query.test_table.findMany.mock.calls;
      const orgIds = calls.map((call: any) => call[0].where.org_id);

      // Should have 10 calls with org_id: 1 and 10 calls with org_id: 2
      const org1Count = orgIds.filter((id: number) => id === 1).length;
      const org2Count = orgIds.filter((id: number) => id === 2).length;

      expect(org1Count).toBe(10);
      expect(org2Count).toBe(10);
    });
  });
});

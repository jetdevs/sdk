/**
 * Tests for RLS Context Management with AsyncLocalStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  withRLSContext,
  withRLSContextSync,
  getRLSContext,
  hasRLSContext,
  getRLSContextOptional,
} from '../context';
import type { RLSContext } from '../types';

describe('RLS Context Management', () => {
  const mockContext: RLSContext = {
    orgId: 1,
    workspaceId: 10,
    userId: 100,
  };

  beforeEach(() => {
    // Each test starts with a clean context
  });

  describe('withRLSContext', () => {
    it('should set and retrieve RLS context within async callback', async () => {
      const result = await withRLSContext(mockContext, async () => {
        const context = getRLSContext();
        expect(context).toEqual(mockContext);
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should throw when accessing context outside of withRLSContext', () => {
      expect(() => getRLSContext()).toThrow('No RLS context available');
    });

    it('should handle nested contexts correctly', async () => {
      const outerContext: RLSContext = { orgId: 1, userId: 100 };
      const innerContext: RLSContext = { orgId: 2, userId: 200 };

      await withRLSContext(outerContext, async () => {
        const ctx1 = getRLSContext();
        expect(ctx1.orgId).toBe(1);

        await withRLSContext(innerContext, async () => {
          const ctx2 = getRLSContext();
          expect(ctx2.orgId).toBe(2);
        });

        // Should restore outer context
        const ctx3 = getRLSContext();
        expect(ctx3.orgId).toBe(1);
      });
    });

    it('should isolate contexts between concurrent async operations', async () => {
      const context1: RLSContext = { orgId: 1, userId: 100 };
      const context2: RLSContext = { orgId: 2, userId: 200 };
      const context3: RLSContext = { orgId: 3, userId: 300 };

      const results = await Promise.all([
        withRLSContext(context1, async () => {
          await sleep(10);
          const ctx = getRLSContext();
          return ctx.orgId;
        }),
        withRLSContext(context2, async () => {
          await sleep(5);
          const ctx = getRLSContext();
          return ctx.orgId;
        }),
        withRLSContext(context3, async () => {
          await sleep(1);
          const ctx = getRLSContext();
          return ctx.orgId;
        }),
      ]);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should clean up context after callback completes', async () => {
      await withRLSContext(mockContext, async () => {
        expect(hasRLSContext()).toBe(true);
      });

      expect(hasRLSContext()).toBe(false);
    });

    it('should clean up context even if callback throws', async () => {
      await expect(
        withRLSContext(mockContext, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(hasRLSContext()).toBe(false);
    });
  });

  describe('withRLSContextSync', () => {
    it('should set and retrieve RLS context within sync callback', () => {
      const result = withRLSContextSync(mockContext, () => {
        const context = getRLSContext();
        expect(context).toEqual(mockContext);
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should clean up context after sync callback completes', () => {
      withRLSContextSync(mockContext, () => {
        expect(hasRLSContext()).toBe(true);
      });

      expect(hasRLSContext()).toBe(false);
    });
  });

  describe('hasRLSContext', () => {
    it('should return false when no context is set', () => {
      expect(hasRLSContext()).toBe(false);
    });

    it('should return true when context is set', async () => {
      await withRLSContext(mockContext, async () => {
        expect(hasRLSContext()).toBe(true);
      });
    });
  });

  describe('getRLSContextOptional', () => {
    it('should return null when no context is set', () => {
      expect(getRLSContextOptional()).toBeNull();
    });

    it('should return context when set', async () => {
      await withRLSContext(mockContext, async () => {
        const context = getRLSContextOptional();
        expect(context).toEqual(mockContext);
      });
    });
  });

  describe('Concurrency Stress Test', () => {
    it('should handle 100 concurrent contexts without mixing', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => {
        const context: RLSContext = { orgId: i, userId: i * 10 };

        return withRLSContext(context, async () => {
          // Random delay to increase chances of context mixing if not properly isolated
          await sleep(Math.random() * 20);

          const ctx = getRLSContext();
          expect(ctx.orgId).toBe(i);
          expect(ctx.userId).toBe(i * 10);

          return ctx.orgId;
        });
      });

      const results = await Promise.all(promises);

      // Verify all contexts were correctly isolated
      expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i));
    });
  });
});

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

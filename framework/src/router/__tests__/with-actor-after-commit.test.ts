/**
 * Tests for the afterCommit hook in createRouterWithActor (CAD-89 S-002).
 *
 * The hook must:
 *  - run registered callbacks AFTER the wrapping dbFunction (tx) resolves,
 *    OUTSIDE the pinned connection;
 *  - run them only on commit success (never on handler throw / rollback);
 *  - be fully backward-compatible: a handler that never registers a callback
 *    behaves exactly as before;
 *  - catch + swallow callback errors so a failed side effect never fails the
 *    already-committed request.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configureActorAdapter,
  createRouterWithActor,
  type ActorContextAdapter,
} from '../with-actor';
import { z } from 'zod';

/**
 * Build a mock adapter whose getDbContext simulates a transaction:
 * `dbFunction(cb)` runs the callback and, on success, pushes 'commit' into the
 * shared `events` log AFTER the callback resolves. after-commit callbacks push
 * their own markers so we can assert ordering.
 */
function configureMockAdapter(events: string[]) {
  const adapter: ActorContextAdapter = {
    createActor: () => ({
      userId: 1,
      email: 'a@b.c',
      orgId: 1,
      roles: [],
      isSystemUser: false,
      isSuperUser: false,
      permissions: [],
      sessionExpiry: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    getDbContext: () => ({
      effectiveOrgId: 1,
      dbFunction: async (cb: (db: any) => Promise<any>) => {
        events.push('tx:begin');
        try {
          const r = await cb({});
          events.push('tx:commit');
          return r;
        } catch (e) {
          events.push('tx:rollback');
          throw e;
        }
      },
    }),
    createServiceContext: (db: any) => ({ db, orgId: 1, userId: '1', actor: {} as any }),
    getProcedure: () => {
      // Chainable builder that captures the wrapped handler as the procedure.
      const builder: any = {
        input: () => builder,
        meta: () => builder,
        mutation: (fn: any) => fn,
        query: (fn: any) => fn,
      };
      return builder;
    },
    createTRPCRouter: (procedures: Record<string, any>) => procedures,
  };
  configureActorAdapter(adapter);
}

describe('createRouterWithActor — afterCommit hook (S-002)', () => {
  let events: string[];

  beforeEach(() => {
    events = [];
    configureMockAdapter(events);
  });

  it('runs registered callbacks AFTER the tx commits, in order', async () => {
    const router: any = createRouterWithActor({
      start: {
        type: 'mutation',
        audit: false,
        input: z.object({ x: z.number() }),
        handler: async ({ input, afterCommit }) => {
          events.push('handler:run');
          afterCommit(() => {
            events.push('afterCommit:1');
          });
          afterCommit(async () => {
            events.push('afterCommit:2');
          });
          return { runId: input.x };
        },
      },
    });

    const result = await router.start({ ctx: {}, input: { x: 42 } });

    expect(result).toEqual({ runId: 42 });
    // Handler + its DB work happen inside the tx; callbacks fire only after commit.
    expect(events).toEqual([
      'tx:begin',
      'handler:run',
      'tx:commit',
      'afterCommit:1',
      'afterCommit:2',
    ]);
  });

  it('also exposes afterCommit on ctx (ctx.afterCommit convention)', async () => {
    const router: any = createRouterWithActor({
      start: {
        type: 'mutation',
        audit: false,
        input: z.object({ x: z.number() }),
        handler: async ({ ctx }) => {
          ctx.afterCommit(() => events.push('afterCommit:ctx'));
          return { ok: true };
        },
      },
    });

    await router.start({ ctx: {}, input: { x: 1 } });
    expect(events).toEqual(['tx:begin', 'tx:commit', 'afterCommit:ctx']);
  });

  it('does NOT run callbacks when the handler throws (rollback)', async () => {
    const router: any = createRouterWithActor({
      start: {
        type: 'mutation',
        audit: false,
        input: z.object({ x: z.number() }),
        handler: async ({ afterCommit }) => {
          afterCommit(() => events.push('afterCommit:should-not-run'));
          throw new Error('boom');
        },
      },
    });

    await expect(router.start({ ctx: {}, input: { x: 1 } })).rejects.toThrow('boom');
    expect(events).toEqual(['tx:begin', 'tx:rollback']);
    expect(events).not.toContain('afterCommit:should-not-run');
  });

  it('is backward-compatible: a handler with no afterCommit behaves as before', async () => {
    const router: any = createRouterWithActor({
      list: {
        type: 'query',
        handler: async () => {
          events.push('handler:run');
          return [1, 2, 3];
        },
      },
    });

    const result = await router.list({ ctx: {}, input: undefined });
    expect(result).toEqual([1, 2, 3]);
    expect(events).toEqual(['tx:begin', 'handler:run', 'tx:commit']);
  });

  it('swallows a failing callback so the committed request still resolves', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router: any = createRouterWithActor({
      start: {
        type: 'mutation',
        audit: false,
        input: z.object({ x: z.number() }),
        handler: async ({ afterCommit }) => {
          afterCommit(async () => {
            throw new Error('enqueue failed');
          });
          afterCommit(() => events.push('afterCommit:2-still-runs'));
          return { ok: true };
        },
      },
    });

    const result = await router.start({ ctx: {}, input: { x: 1 } });
    expect(result).toEqual({ ok: true });
    // Second callback still runs despite the first throwing.
    expect(events).toContain('afterCommit:2-still-runs');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

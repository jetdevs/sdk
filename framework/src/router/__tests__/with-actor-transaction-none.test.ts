/**
 * Tests for the `transaction: 'none'` route option in createRouterWithActor
 * (XER-1, sdk-audit #5).
 *
 * Default routes must still run the handler inside `dbFunction` exactly once.
 * `transaction: 'none'` routes must never call `dbFunction`, still run the
 * handler (on `ctx.db`), still enforce the permission and org checks, and still
 * run `afterCommit` callbacks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  configureActorAdapter,
  createRouterWithActor,
  type ActorContextAdapter,
} from '../with-actor';
import type { Actor } from '../../auth/actor';
import { getRLSContext } from '../../rls';

type Callable = (opts: { ctx: Record<string, unknown>; input: unknown }) => Promise<unknown>;

const TX_DB = { kind: 'tx' } as const;
const BASE_DB = { kind: 'base' } as const;

interface Harness {
  events: string[];
  dbFunction: ReturnType<typeof vi.fn>;
  getDbContext: ReturnType<typeof vi.fn>;
}

/**
 * Mock adapter. `getProcedure(permission)` returns a builder whose
 * query/mutation wrap the handler in a permission middleware, as the app's
 * permission procedures do: an actor without the permission is refused before
 * the handler runs.
 */
function configureMockAdapter(actorPermissions: string[]): Harness {
  const events: string[] = [];
  const dbFunction = vi.fn(async (cb: (db: unknown) => Promise<unknown>) => {
    events.push('tx:begin');
    const r = await cb(TX_DB);
    events.push('tx:commit');
    return r;
  });
  const getDbContext = vi.fn(() => ({ effectiveOrgId: 1, dbFunction }));
  const actor: Actor = {
    userId: 1,
    email: 'a@b.c',
    orgId: 1,
    roles: [],
    isSystemUser: false,
    isSuperUser: false,
    permissions: actorPermissions,
    sessionExpiry: new Date(Date.now() + 3_600_000).toISOString(),
  };

  const adapter: ActorContextAdapter = {
    createActor: () => actor,
    getDbContext,
    createServiceContext: (db: unknown, a: Actor, orgId: number | null) => ({
      db,
      actor: a,
      orgId,
      userId: String(a.userId),
    }),
    getProcedure: (permission?: string) => {
      const guard = (fn: Callable): Callable => async (opts) => {
        if (permission && !actorPermissions.includes(permission)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission ${permission}` });
        }
        return fn(opts);
      };
      const builder: Record<string, unknown> = {};
      builder.input = () => builder;
      builder.meta = () => builder;
      builder.mutation = guard;
      builder.query = guard;
      return builder;
    },
    createTRPCRouter: (procedures: Record<string, unknown>) => procedures,
  };
  configureActorAdapter(adapter);
  return { events, dbFunction, getDbContext };
}

describe("createRouterWithActor — transaction: 'none' (XER-1)", () => {
  let h: Harness;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h = configureMockAdapter(['acct:read']);
  });

  it('default mode still calls dbFunction once and hands the handler the tx client', async () => {
    const router = createRouterWithActor({
      list: {
        type: 'query',
        permission: 'acct:read',
        handler: async ({ db, service }: { db: unknown; service: { db: unknown } }) => {
          h.events.push('handler:run');
          return { db, serviceDb: service.db };
        },
      },
    }) as Record<string, Callable>;

    const result = await router.list!({ ctx: { db: BASE_DB }, input: undefined });

    expect(h.dbFunction).toHaveBeenCalledTimes(1);
    expect(h.getDbContext).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ db: TX_DB, serviceDb: TX_DB });
    expect(h.events).toEqual(['tx:begin', 'handler:run', 'tx:commit']);
  });

  it("'none' never calls dbFunction, runs the handler on ctx.db inside the RLS context", async () => {
    const router = createRouterWithActor({
      list: {
        type: 'query',
        permission: 'acct:read',
        transaction: 'none',
        handler: async ({ db, service }: { db: unknown; service: { db: unknown } }) => {
          h.events.push('handler:run');
          return { db, serviceDb: service.db, rls: getRLSContext() };
        },
      },
    }) as Record<string, Callable>;

    const result = await router.list!({ ctx: { db: BASE_DB }, input: undefined });

    expect(h.dbFunction).not.toHaveBeenCalled();
    expect(result).toEqual({
      db: BASE_DB,
      serviceDb: BASE_DB,
      rls: expect.objectContaining({ orgId: 1, userId: 1 }),
    });
    expect(h.events).toEqual(['handler:run']);
  });

  it("'none' hands the handler db = undefined when the context has no db", async () => {
    const router = createRouterWithActor({
      list: {
        type: 'query',
        transaction: 'none',
        handler: async ({ db }: { db: unknown }) => ({ hasDb: db !== undefined }),
      },
    }) as Record<string, Callable>;

    await expect(router.list!({ ctx: {}, input: undefined })).resolves.toEqual({ hasDb: false });
    expect(h.dbFunction).not.toHaveBeenCalled();
  });

  it("'none' still refuses a caller without the permission", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const router = createRouterWithActor({
      post: {
        type: 'mutation',
        audit: false,
        permission: 'acct:write',
        transaction: 'none',
        input: z.object({ x: z.number() }),
        handler,
      },
    }) as Record<string, Callable>;

    await expect(router.post!({ ctx: { db: BASE_DB }, input: { x: 1 } })).rejects.toThrow(
      'Missing permission acct:write'
    );
    expect(handler).not.toHaveBeenCalled();
    expect(h.dbFunction).not.toHaveBeenCalled();
  });

  it("'none' still refuses a request naming a foreign organization", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn(async () => ({ ok: true }));
    const router = createRouterWithActor({
      post: {
        type: 'mutation',
        audit: false,
        permission: 'acct:read',
        transaction: 'none',
        input: z.object({ orgId: z.number() }),
        handler,
      },
    }) as Record<string, Callable>;

    await expect(router.post!({ ctx: { db: BASE_DB }, input: { orgId: 99 } })).rejects.toThrow(
      'Access denied to this organization'
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("'none' runs afterCommit callbacks after the handler, swallowing failures", async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createRouterWithActor({
      post: {
        type: 'mutation',
        audit: false,
        transaction: 'none',
        input: z.object({ x: z.number() }),
        handler: async ({ afterCommit }: { afterCommit: (cb: () => void | Promise<void>) => void }) => {
          h.events.push('handler:run');
          afterCommit(async () => {
            throw new Error('enqueue failed');
          });
          afterCommit(() => {
            h.events.push('afterCommit:2');
          });
          return { ok: true };
        },
      },
    }) as Record<string, Callable>;

    await expect(router.post!({ ctx: { db: BASE_DB }, input: { x: 1 } })).resolves.toEqual({ ok: true });
    expect(h.events).toEqual(['handler:run', 'afterCommit:2']);
    expect(h.dbFunction).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });

  it("'none' does not run afterCommit callbacks when the handler throws", async () => {
    const router = createRouterWithActor({
      post: {
        type: 'mutation',
        audit: false,
        transaction: 'none',
        input: z.object({ x: z.number() }),
        handler: async ({ afterCommit }: { afterCommit: (cb: () => void | Promise<void>) => void }) => {
          afterCommit(() => {
            h.events.push('afterCommit:should-not-run');
          });
          throw new Error('boom');
        },
      },
    }) as Record<string, Callable>;

    await expect(router.post!({ ctx: { db: BASE_DB }, input: { x: 1 } })).rejects.toThrow('boom');
    expect(h.events).toEqual([]);
  });

  it("refuses 'none' combined with repository when the router is built", () => {
    class Repo {
      constructor(readonly db: unknown) {}
    }
    expect(() =>
      createRouterWithActor({
        list: {
          type: 'query',
          transaction: 'none',
          repository: Repo,
          handler: async () => [],
        },
      })
    ).toThrow(/transaction 'none' cannot be combined with repository/);
  });

  it('refuses an unknown transaction value when the router is built', () => {
    expect(() =>
      createRouterWithActor({
        list: {
          type: 'query',
          transaction: 'off' as unknown as 'none',
          handler: async () => [],
        },
      })
    ).toThrow(/unknown transaction option "off"/);
  });
});

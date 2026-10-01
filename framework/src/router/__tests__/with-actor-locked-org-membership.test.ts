/**
 * Membership in an org the server locked the request to (YMS-298).
 *
 * On a custom domain the app puts `lockedOrgId` in the tRPC context and every
 * procedure built with createRouterWithActor runs in that org. The org comes
 * from the host name, so it says nothing about the caller: a procedure runs
 * there only when the caller is an active member of the locked org, or a
 * platform system user. Everyone else is refused before the handler runs and
 * before a database context is opened for it.
 *
 * Not checked: public routes (no caller), and routes whose handler took over
 * the org check (`inputOrgCheckedByHandler`, e.g. accepting an invitation into
 * the locked org).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  configureActorAdapter,
  createRouterWithActor,
  type ActorContextAdapter,
} from '../with-actor';

const OWN_ORG = 1;
const LOCKED_ORG = 2;

interface Harness {
  dbContextCalls: Array<{ crossOrgAccess?: boolean; targetOrgId?: number | null; targetOrgVerified?: boolean }>;
  handlerOrgs: Array<number | null>;
}

function configure(
  actorOverrides: Record<string, unknown> = {},
  adapterOverrides: Partial<ActorContextAdapter> = {},
): Harness {
  const harness: Harness = { dbContextCalls: [], handlerOrgs: [] };
  const actor = {
    userId: 7,
    email: 'outsider@example.com',
    orgId: OWN_ORG as number | null,
    roles: [],
    isSystemUser: false,
    isSuperUser: false,
    // Granted in the caller's own org; they say nothing about the locked org.
    permissions: ['user:read', 'user:create', 'skills:read', 'skills:create'],
    sessionExpiry: new Date(Date.now() + 3_600_000).toISOString(),
    ...actorOverrides,
  };
  const adapter: ActorContextAdapter = {
    createActor: () => actor as any,
    getDbContext: (_ctx, a, options = {}) => {
      harness.dbContextCalls.push({ ...options });
      const effectiveOrgId = options.targetOrgId !== undefined ? options.targetOrgId : a.orgId;
      return {
        effectiveOrgId: effectiveOrgId ?? null,
        dbFunction: async (cb: (db: any) => Promise<any>) => cb({}),
      };
    },
    createServiceContext: (db: any, a: any, orgId: number | null) => ({ db, orgId, userId: '7', actor: a }),
    getProcedure: () => {
      const builder: any = {
        input: () => builder,
        meta: () => builder,
        mutation: (fn: any) => fn,
        query: (fn: any) => fn,
      };
      return builder;
    },
    createTRPCRouter: (procedures: Record<string, any>) => procedures,
    ...adapterOverrides,
  };
  configureActorAdapter(adapter);
  return harness;
}

function router(harness: Harness, route: Record<string, unknown> = {}): any {
  return createRouterWithActor({
    run: {
      type: 'query',
      input: z.object({ orgId: z.number().optional(), targetOrgId: z.number().optional() }),
      handler: async ({ service }: any) => {
        harness.handlerOrgs.push(service.orgId);
        return { orgId: service.orgId };
      },
      ...route,
    } as any,
  });
}

const lockedCtx = { lockedOrgId: LOCKED_ORG };

describe('createRouterWithActor — membership in a locked org (YMS-298)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('caller who is not a member of the locked org', () => {
    it('is refused on a regular route', async () => {
      const isOrgMember = vi.fn().mockResolvedValue(false);
      const h = configure({}, { isOrgMember });
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(isOrgMember).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 7 }), LOCKED_ORG);
      expect(h.handlerOrgs).toEqual([]);
      expect(h.dbContextCalls).toEqual([]);
    });

    it('is refused on a route gated by a permission it holds in its own org', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(false) });
      await expect(
        router(h, { permission: 'skills:create', type: 'mutation' }).run({ ctx: lockedCtx, input: {} }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
      expect(h.dbContextCalls).toEqual([]);
    });

    it('is refused when the app already moved the session org to the locked org', async () => {
      // An app's org procedure may overwrite the session org with the locked
      // org before the actor is built; equal ids are not proof of membership.
      const isOrgMember = vi.fn().mockResolvedValue(false);
      const h = configure({ orgId: LOCKED_ORG }, { isOrgMember });
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(isOrgMember).toHaveBeenCalledTimes(1);
      expect(h.handlerOrgs).toEqual([]);
    });

    it('is refused when the input names the locked org', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(false) });
      await expect(
        router(h).run({ ctx: lockedCtx, input: { orgId: LOCKED_ORG } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('is refused on a cross-org route with no permission, not moved to its own org', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(false) });
      await expect(
        router(h, { crossOrg: true }).run({ ctx: lockedCtx, input: {} }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
      expect(h.dbContextCalls).toEqual([]);
    });

    it('is refused on a cross-org route gated by a permission', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(false) });
      await expect(
        router(h, { crossOrg: true, permission: 'user:read' }).run({ ctx: lockedCtx, input: {} }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('is refused when the membership check itself fails', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockRejectedValue(new Error('db down')) });
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('is refused when no membership check is configured and the database cannot be asked', async () => {
      // The mock database has no `execute`, so the built-in lookup cannot confirm membership.
      const h = configure();
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('is refused by the built-in lookup when it finds no active role in the locked org', async () => {
      const execute = vi.fn().mockResolvedValue([]);
      const h = configure(
        {},
        {
          getDbContext: (_ctx: any, a: any, options: any = {}) => {
            h.dbContextCalls.push({ ...options });
            return {
              effectiveOrgId: options.targetOrgId ?? a.orgId ?? null,
              dbFunction: async (cb: (db: any) => Promise<any>) => cb({ execute }),
            };
          },
        },
      );
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(h.handlerOrgs).toEqual([]);
    });
  });

  describe('caller who is an active member of the locked org', () => {
    it('runs in the locked org when the session org is another org', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(true) });
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).resolves.toEqual({ orgId: LOCKED_ORG });
      expect(h.dbContextCalls.at(-1)).toMatchObject({ targetOrgId: LOCKED_ORG, targetOrgVerified: true });
    });

    it('runs in the locked org when it is also the session org', async () => {
      const h = configure({ orgId: LOCKED_ORG }, { isOrgMember: vi.fn().mockResolvedValue(true) });
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).resolves.toEqual({ orgId: LOCKED_ORG });
      expect(h.handlerOrgs).toEqual([LOCKED_ORG]);
    });

    it('runs a cross-org route in the locked org', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(true) });
      await expect(router(h, { crossOrg: true }).run({ ctx: lockedCtx, input: {} })).resolves.toEqual({
        orgId: LOCKED_ORG,
      });
    });

    it('is still refused an input org that differs from the locked org', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(true) });
      await expect(
        router(h).run({ ctx: lockedCtx, input: { orgId: 3 } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('is accepted by the built-in lookup when it finds an active role in the locked org', async () => {
      const execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
      const lookups: Array<{ targetOrgId?: number | null; targetOrgVerified?: boolean }> = [];
      const h = configure(
        {},
        {
          getDbContext: (_ctx: any, a: any, options: any = {}) => {
            h.dbContextCalls.push({ ...options });
            return {
              effectiveOrgId: options.targetOrgId ?? a.orgId ?? null,
              dbFunction: async (cb: (db: any) => Promise<any>) => {
                lookups.push({ ...options });
                return cb({ execute });
              },
            };
          },
        },
      );
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).resolves.toEqual({ orgId: LOCKED_ORG });
      // The lookup ran inside the locked org, where the caller's own row is visible.
      expect(lookups[0]).toMatchObject({ targetOrgId: LOCKED_ORG, targetOrgVerified: true, crossOrgAccess: false });
    });
  });

  describe('not subject to the membership check', () => {
    it('a platform system user runs in the locked org without a lookup', async () => {
      const isOrgMember = vi.fn().mockResolvedValue(false);
      const h = configure({ isSystemUser: true, permissions: ['admin:full_access'] }, { isOrgMember });
      await expect(router(h).run({ ctx: lockedCtx, input: {} })).resolves.toEqual({ orgId: LOCKED_ORG });
      expect(isOrgMember).not.toHaveBeenCalled();
    });

    it('a route whose handler took over the org check runs for a caller who is not yet a member', async () => {
      // Accepting an invitation into the locked org, on that org's own domain.
      const isOrgMember = vi.fn().mockResolvedValue(false);
      const h = configure({}, { isOrgMember });
      await expect(
        router(h, { crossOrg: true, inputOrgCheckedByHandler: true }).run({
          ctx: lockedCtx,
          input: { orgId: LOCKED_ORG },
        }),
      ).resolves.toEqual({ orgId: LOCKED_ORG });
      expect(isOrgMember).not.toHaveBeenCalled();
    });

    it('a public route is not checked', async () => {
      const isOrgMember = vi.fn().mockResolvedValue(false);
      configure({}, { isOrgMember });
      const r: any = createRouterWithActor({
        ping: { type: 'query', public: true, handler: async () => ({ ok: true }) } as any,
      });
      await expect(r.ping({ ctx: { ...lockedCtx, db: {} }, input: undefined })).resolves.toEqual({ ok: true });
      expect(isOrgMember).not.toHaveBeenCalled();
    });

    it('a request with no locked org costs no membership lookup', async () => {
      const isOrgMember = vi.fn().mockResolvedValue(false);
      const h = configure({}, { isOrgMember });
      await expect(router(h).run({ ctx: {}, input: {} })).resolves.toEqual({ orgId: OWN_ORG });
      expect(isOrgMember).not.toHaveBeenCalled();
    });
  });
});

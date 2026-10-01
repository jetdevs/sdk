/**
 * Org scope of a procedure built with createRouterWithActor (YMS-292).
 *
 * The org a request runs in comes from the server: the session org, or the org
 * a custom domain locks the request to. A value the client names in the input
 * (`orgId` / `targetOrgId`) is honoured only
 *  - for a platform system user (backoffice), or
 *  - on a cross-org route that checks no permission (org switch, membership
 *    check), and only when the caller is an active member of the named org.
 *
 * Everyone else is refused before the handler runs and before any database
 * context is opened for the named org.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  configureActorAdapter,
  createRouterWithActor,
  type ActorContextAdapter,
} from '../with-actor';

const SESSION_ORG = 1;
const FOREIGN_ORG = 2;

interface Harness {
  /** Options every getDbContext call received, in order. */
  dbContextCalls: Array<{ crossOrgAccess?: boolean; targetOrgId?: number | null; targetOrgVerified?: boolean }>;
  /** Orgs the handler actually ran in. */
  handlerOrgs: Array<number | null>;
}

function configure(
  actorOverrides: Record<string, unknown> = {},
  adapterOverrides: Partial<ActorContextAdapter> = {},
): Harness {
  const harness: Harness = { dbContextCalls: [], handlerOrgs: [] };
  const actor = {
    userId: 7,
    email: 'member@example.com',
    orgId: SESSION_ORG as number | null,
    roles: [],
    isSystemUser: false,
    isSuperUser: false,
    permissions: ['user:read', 'user:create'],
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

describe('createRouterWithActor — org scope (YMS-292)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('ordinary member (not a system user)', () => {
    it('refuses an org named in input.orgId that is not the session org', async () => {
      const h = configure();
      await expect(router(h).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(h.handlerOrgs).toEqual([]);
      expect(h.dbContextCalls).toEqual([]);
    });

    it('refuses an org named in input.targetOrgId that is not the session org', async () => {
      const h = configure();
      await expect(router(h).run({ ctx: {}, input: { targetOrgId: FOREIGN_ORG } })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(h.handlerOrgs).toEqual([]);
      expect(h.dbContextCalls).toEqual([]);
    });

    it('refuses when the caller has no session org at all', async () => {
      const h = configure({ orgId: null });
      await expect(router(h).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('runs in the session org when the input names that same org', async () => {
      const h = configure();
      await expect(router(h).run({ ctx: {}, input: { orgId: SESSION_ORG } })).resolves.toEqual({
        orgId: SESSION_ORG,
      });
      expect(h.handlerOrgs).toEqual([SESSION_ORG]);
    });

    it('runs in the session org when the input names no org', async () => {
      const h = configure();
      await expect(router(h).run({ ctx: {}, input: {} })).resolves.toEqual({ orgId: SESSION_ORG });
      expect(h.dbContextCalls).toHaveLength(1);
      expect(h.dbContextCalls[0].targetOrgId).toBeUndefined();
    });

    it('refuses a foreign org on a route that only checks a permission', async () => {
      const h = configure();
      await expect(
        router(h, { permission: 'user:read' }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
      expect(h.dbContextCalls).toEqual([]);
    });
  });

  describe('routes whose author took over the org check', () => {
    it('runs a cross-org route gated by a permission in the named org, without a membership lookup', async () => {
      const isOrgMember = vi.fn().mockResolvedValue(false);
      const h = configure({}, { isOrgMember });
      await expect(
        router(h, { crossOrg: true, permission: 'inbox:cross-org' }).run({ ctx: {}, input: { targetOrgId: FOREIGN_ORG } }),
      ).resolves.toEqual({ orgId: FOREIGN_ORG });
      expect(isOrgMember).not.toHaveBeenCalled();
      expect(h.dbContextCalls.at(-1)).toMatchObject({ targetOrgId: FOREIGN_ORG, targetOrgVerified: true });
    });

    it('runs a route marked inputOrgCheckedByHandler in the named org', async () => {
      const h = configure();
      await expect(
        router(h, { inputOrgCheckedByHandler: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } }),
      ).resolves.toEqual({ orgId: FOREIGN_ORG });
      expect(h.dbContextCalls.at(-1)).toMatchObject({ targetOrgId: FOREIGN_ORG, targetOrgVerified: true });
    });
  });

  describe('cross-org route with no permission (org switch, membership check)', () => {
    it('runs in the named org when the caller is an active member of it', async () => {
      const isOrgMember = vi.fn().mockResolvedValue(true);
      const h = configure({}, { isOrgMember });
      await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
        orgId: FOREIGN_ORG,
      });
      expect(isOrgMember).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 7 }), FOREIGN_ORG);
      expect(h.dbContextCalls.at(-1)).toMatchObject({ targetOrgId: FOREIGN_ORG, targetOrgVerified: true });
    });

    it('falls back to the session org when the caller is not a member', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockResolvedValue(false) });
      await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
        orgId: SESSION_ORG,
      });
      expect(h.handlerOrgs).toEqual([SESSION_ORG]);
    });

    it('refuses when the caller is not a member and has no session org', async () => {
      const h = configure({ orgId: null }, { isOrgMember: vi.fn().mockResolvedValue(false) });
      await expect(
        router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });

    it('treats a failing membership check as "not a member"', async () => {
      const h = configure({}, { isOrgMember: vi.fn().mockRejectedValue(new Error('db down')) });
      await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
        orgId: SESSION_ORG,
      });
    });

    it('with no membership check configured, fails closed when the database cannot be asked', async () => {
      // The mock database has no `execute`, so the built-in lookup cannot confirm membership.
      const h = configure();
      await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
        orgId: SESSION_ORG,
      });
    });

    describe('built-in membership lookup (no isOrgMember on the adapter)', () => {
      /** An adapter whose database answers the lookup with `result`, and records where it ran. */
      function withLookup(result: unknown) {
        const lookups: Array<{ targetOrgId?: number | null; targetOrgVerified?: boolean }> = [];
        const execute = vi.fn().mockResolvedValue(result);
        const h = configure(
          {},
          {
            getDbContext: (_ctx: any, a: any, options: any = {}) => {
              h.dbContextCalls.push({ ...options });
              const effectiveOrgId = options.targetOrgId !== undefined ? options.targetOrgId : a.orgId;
              return {
                effectiveOrgId: effectiveOrgId ?? null,
                dbFunction: async (cb: (db: any) => Promise<any>) => {
                  lookups.push({ ...options });
                  return cb({ execute });
                },
              };
            },
          },
        );
        return { h, execute, lookups };
      }

      it('accepts a row returned as an array (postgres-js)', async () => {
        const { h, execute, lookups } = withLookup([{ '?column?': 1 }]);
        await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
          orgId: FOREIGN_ORG,
        });
        expect(execute).toHaveBeenCalledTimes(1);
        // The lookup itself ran inside the named org, where the caller's own row is visible.
        expect(lookups[0]).toMatchObject({ targetOrgId: FOREIGN_ORG, targetOrgVerified: true, crossOrgAccess: false });
      });

      it('accepts a row returned as { rows } (node-postgres, neon)', async () => {
        const { h } = withLookup({ rows: [{ '?column?': 1 }] });
        await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
          orgId: FOREIGN_ORG,
        });
      });

      it('treats an empty result as "not a member"', async () => {
        const { h } = withLookup([]);
        await expect(router(h, { crossOrg: true }).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
          orgId: SESSION_ORG,
        });
      });
    });
  });

  describe('platform system user (backoffice)', () => {
    it('still runs in the org named in the input, with cross-org access', async () => {
      const h = configure({ isSystemUser: true, permissions: ['admin:full_access'] });
      await expect(router(h).run({ ctx: {}, input: { orgId: FOREIGN_ORG } })).resolves.toEqual({
        orgId: FOREIGN_ORG,
      });
      expect(h.dbContextCalls).toHaveLength(1);
      expect(h.dbContextCalls[0]).toMatchObject({ crossOrgAccess: true, targetOrgId: FOREIGN_ORG });
    });
  });

  describe('org locked by the server (custom domain)', () => {
    it('keeps running in the locked org, which the server chose', async () => {
      const h = configure();
      await expect(router(h).run({ ctx: { lockedOrgId: FOREIGN_ORG }, input: {} })).resolves.toEqual({
        orgId: FOREIGN_ORG,
      });
      expect(h.dbContextCalls.at(-1)).toMatchObject({ targetOrgId: FOREIGN_ORG, targetOrgVerified: true });
    });

    it('still refuses an input org that differs from the locked org', async () => {
      const h = configure();
      await expect(
        router(h).run({ ctx: { lockedOrgId: FOREIGN_ORG }, input: { orgId: 3 } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(h.handlerOrgs).toEqual([]);
    });
  });
});

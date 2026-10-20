/**
 * Org scope of getDbContext / createServiceContextWithDb (YMS-292).
 *
 * `targetOrgId` chooses the org the Postgres RLS context is set to. For an
 * actor that is not a platform system user it is honoured only when it is the
 * actor's own session org, or when the caller states it has verified the org
 * server-side (`targetOrgVerified`). Otherwise the context stays in the
 * session org, and an actor with no session org is refused.
 */

import { describe, it, expect } from 'vitest';
import type { Actor } from '../../auth/actor';
import { createServiceContextWithDb, getDbContext } from '../rls-context';

const SESSION_ORG = 1;
const FOREIGN_ORG = 2;

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: 7,
    email: 'member@example.com',
    orgId: SESSION_ORG,
    roles: [],
    isSystemUser: false,
    isSuperUser: false,
    permissions: [],
    sessionExpiry: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

/** A database whose transaction records the org each `set_config` receives. */
function recordingDb() {
  const rlsOrgs: string[] = [];
  const db = {
    transaction: async (cb: (tx: any) => Promise<any>) =>
      cb({
        execute: async (query: { values: unknown[] }) => {
          rlsOrgs.push(String(query.values[0]));
        },
      }),
  };
  const sql: any = (_strings: TemplateStringsArray, ...values: unknown[]) => ({ values });
  return { db, sql, rlsOrgs };
}

async function rlsOrgFor(a: Actor, options: Parameters<typeof getDbContext>[2]) {
  const { db, sql, rlsOrgs } = recordingDb();
  const context = getDbContext({ db }, a, options, sql);
  await context.dbFunction(async () => undefined);
  return { context, rlsOrgs };
}

describe('getDbContext — org scope (YMS-292)', () => {
  it('keeps an ordinary member in the session org when a foreign org is named', async () => {
    const { context, rlsOrgs } = await rlsOrgFor(actor(), { targetOrgId: FOREIGN_ORG });
    expect(context.effectiveOrgId).toBe(SESSION_ORG);
    expect(context.isPrivileged).toBe(false);
    expect(rlsOrgs).toEqual([String(SESSION_ORG)]);
  });

  it('ignores a cross-org request from an ordinary member', async () => {
    const { context, rlsOrgs } = await rlsOrgFor(actor(), { targetOrgId: FOREIGN_ORG, crossOrgAccess: true });
    expect(context.effectiveOrgId).toBe(SESSION_ORG);
    expect(rlsOrgs).toEqual([String(SESSION_ORG)]);
  });

  it('refuses an ordinary member with no session org who names an org', () => {
    const { db, sql } = recordingDb();
    expect(() => getDbContext({ db }, actor({ orgId: null }), { targetOrgId: FOREIGN_ORG }, sql)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('honours a named org the caller verified server-side', async () => {
    const { context, rlsOrgs } = await rlsOrgFor(actor(), { targetOrgId: FOREIGN_ORG, targetOrgVerified: true });
    expect(context.effectiveOrgId).toBe(FOREIGN_ORG);
    expect(rlsOrgs).toEqual([String(FOREIGN_ORG)]);
  });

  it('runs in the session org when no org is named', async () => {
    const { context, rlsOrgs } = await rlsOrgFor(actor(), {});
    expect(context.effectiveOrgId).toBe(SESSION_ORG);
    expect(rlsOrgs).toEqual([String(SESSION_ORG)]);
  });

  it('lets a platform system user run in the named org', async () => {
    const { context, rlsOrgs } = await rlsOrgFor(actor({ isSystemUser: true }), { targetOrgId: FOREIGN_ORG });
    expect(context.effectiveOrgId).toBe(FOREIGN_ORG);
    expect(rlsOrgs).toEqual([String(FOREIGN_ORG)]);
  });

  it('gives a platform system user the privileged connection for cross-org access', () => {
    const { db, sql } = recordingDb();
    const withPrivilegedDb = async (cb: (d: any) => Promise<any>) => cb(db);
    const context = getDbContext(
      { db, withPrivilegedDb },
      actor({ isSystemUser: true }),
      { targetOrgId: FOREIGN_ORG, crossOrgAccess: true },
      sql,
    );
    expect(context.isPrivileged).toBe(true);
    expect(context.effectiveOrgId).toBe(FOREIGN_ORG);
  });
});

describe('createServiceContextWithDb — org scope (YMS-292)', () => {
  it('reports the session org, not the foreign org an ordinary member named', async () => {
    const { db, sql } = recordingDb();
    const service = await createServiceContextWithDb({ db }, actor(), { targetOrgId: FOREIGN_ORG }, sql);
    expect(service.orgId).toBe(SESSION_ORG);
    expect(service.withRLS.effectiveOrgId).toBe(SESSION_ORG);
  });
});

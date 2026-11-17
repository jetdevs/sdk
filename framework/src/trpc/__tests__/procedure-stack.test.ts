/**
 * createProcedureStack + createDbClients.
 *
 * The fake db records every statement and the transaction it ran in, so the
 * tests can assert the RLS context is set inside the same transaction as the
 * handler's query.
 */

import { describe, it, expect, vi } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import type { SQL } from 'drizzle-orm';
import { createDbClients, type RlsContextValues } from '../../db/clients';
import { createProcedureStack, type StackPermissionChecker } from '../procedure-stack';

// ---------------------------------------------------------------------------
// Fake driver
// ---------------------------------------------------------------------------

interface FakeTx {
  id: number;
  client: string;
  log: string[];
  execute(query: SQL): Promise<unknown>;
}

class FakeDb {
  static txSeq = 0;
  readonly txs: FakeTx[] = [];
  constructor(readonly name: string) {}
  async transaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const log: string[] = [];
    const tx: FakeTx = {
      id: ++FakeDb.txSeq,
      client: this.name,
      log,
      async execute(query: SQL): Promise<unknown> {
        const chunks = (query as unknown as { queryChunks: Array<{ value?: string[] } | string> }).queryChunks;
        log.push(chunks.map((c) => (typeof c === 'string' ? c : (c.value ?? []).join(''))).join(''));
        return [];
      },
    };
    this.txs.push(tx);
    return fn(tx);
  }
}

function makeClients(privileged = true) {
  const rlsCalls: Array<{ txId: number; ctx: RlsContextValues }> = [];
  const privilegedEvents: string[] = [];
  const clients = createDbClients<FakeDb>({
    appUrl: 'postgres://app',
    privilegedUrl: privileged ? 'postgres://privileged' : null,
    connect: (_url, role) => new FakeDb(role),
    setRlsContext: async (tx, ctx) => {
      rlsCalls.push({ txId: tx.id, ctx });
      tx.log.push(`set rls.current_org_id=${ctx.orgId}`);
    },
    onPrivilegedAccess: (e) => privilegedEvents.push(e.reason),
  });
  return { clients, rlsCalls, privilegedEvents };
}

// ---------------------------------------------------------------------------
// Stack harness
// ---------------------------------------------------------------------------

interface Session {
  user: { id: number; email: string; currentOrgId: number | null; permissions: string[] };
}
interface Ctx {
  session: Session | null;
}

const ORG_A = 1;
const ORG_B = 2;

function makeStack(opts: { systemUsers?: number[]; resolveOrgId?: (s: Session) => number | null } = {}) {
  const { clients, rlsCalls, privilegedEvents } = makeClients();
  const permissions: StackPermissionChecker<Session> = {
    isSystemUser: vi.fn(async ({ userId }) => (opts.systemUsers ?? []).includes(userId)),
    hasPermission: vi.fn(async ({ session, permission }) => session.user.permissions.includes(permission)),
  };
  const audit = { write: vi.fn(async () => undefined) };
  const t = initTRPC.context<Ctx>().create();
  const stack = createProcedureStack(t, {
    getSession: (ctx) => ctx.session,
    db: clients,
    permissions,
    audit,
    awaitAuditWrites: true,
    resolveOrgId: opts.resolveOrgId ? ({ session }) => opts.resolveOrgId!(session) : undefined,
  });

  const router = t.router({
    me: stack.protectedProcedure.query(({ ctx }) => ctx.userId),
    rows: stack.orgProtectedProcedure.query(({ ctx }) =>
      ctx.dbWithRLS(async (tx) => ({ txId: tx.id, client: tx.client, org: ctx.activeOrgId }))
    ),
    perms: stack.orgProtectedProcedure.query(({ ctx }) => ctx.session.user.permissions ?? []),
    read: stack.withPermission('items:read').query(() => 'ok'),
    orgRead: stack.orgProtectedProcedureWithPermission('items:read').query(() => 'ok'),
    create: stack.orgProtectedProcedureWithPermissionAndAudit('items:create').mutation(() => ({ id: 7 })),
  });
  const caller = (session: Session | null) => t.createCallerFactory(router)({ session });
  return { caller, clients, rlsCalls, privilegedEvents, audit, permissions };
}

function user(id: number, currentOrgId: number | null, permissions: string[] = []): Session {
  return { user: { id, email: `u${id}@x.test`, currentOrgId, permissions } };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (err: unknown) {
    return err instanceof TRPCError ? err.code : 'NON_TRPC';
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createProcedureStack — denials', () => {
  it('denies without a session', async () => {
    const { caller } = makeStack();
    expect(await codeOf(caller(null).me())).toBe('UNAUTHORIZED');
    expect(await codeOf(caller(null).rows())).toBe('UNAUTHORIZED');
    expect(await codeOf(caller(null).orgRead())).toBe('UNAUTHORIZED');
  });

  it('denies a session whose user id is not a positive integer', async () => {
    const { caller } = makeStack();
    const bad = { user: { id: 0, email: 'x', currentOrgId: ORG_A, permissions: [] } };
    expect(await codeOf(caller(bad).me())).toBe('UNAUTHORIZED');
  });

  it('denies an org-protected call with no org (non-system user)', async () => {
    const { caller } = makeStack();
    expect(await codeOf(caller(user(5, null)).rows())).toBe('BAD_REQUEST');
  });

  it('denies without the permission, allows with it', async () => {
    const { caller } = makeStack();
    expect(await codeOf(caller(user(5, ORG_A)).read())).toBe('FORBIDDEN');
    expect(await codeOf(caller(user(5, ORG_A)).orgRead())).toBe('FORBIDDEN');
    expect(await caller(user(5, ORG_A, ['items:read'])).orgRead()).toBe('ok');
  });

  it('a system user (live checker fact) passes permission gates', async () => {
    const { caller } = makeStack({ systemUsers: [9] });
    expect(await caller(user(9, ORG_A)).orgRead()).toBe('ok');
    expect(await caller(user(9, ORG_A)).read()).toBe('ok');
  });

  it('a checker failure rejects the request', async () => {
    const { caller, permissions } = makeStack();
    vi.mocked(permissions.isSystemUser).mockRejectedValueOnce(new Error('db down'));
    expect(await codeOf(caller(user(5, ORG_A, ['items:read'])).orgRead())).toBe('INTERNAL_SERVER_ERROR');
  });

  it('empties token grants when the effective org differs from the session org', async () => {
    const { caller } = makeStack({ resolveOrgId: () => ORG_B });
    expect(await caller(user(5, ORG_A, ['items:read'])).perms()).toEqual([]);
  });
});

describe('createProcedureStack — RLS and audit', () => {
  it('runs dbWithRLS in one transaction with the effective org set', async () => {
    const { caller, rlsCalls } = makeStack();
    const out = await caller(user(5, ORG_A)).rows();
    expect(out).toMatchObject({ client: 'app', org: ORG_A });
    expect(rlsCalls).toEqual([{ txId: out.txId, ctx: { orgId: ORG_A, userId: 5 } }]);
  });

  it('a system user with no org gets the privileged client, with a logged reason', async () => {
    const { caller, privilegedEvents } = makeStack({ systemUsers: [9] });
    const out = await caller(user(9, null)).rows();
    expect(out.client).toBe('privileged');
    expect(privilegedEvents).toHaveLength(1);
    expect(privilegedEvents[0]).toContain('rows');
  });

  it('audits a successful mutation in the effective org, not a denied one', async () => {
    const { caller, audit } = makeStack();
    expect(await codeOf(caller(user(5, ORG_A)).create())).toBe('FORBIDDEN');
    expect(audit.write).not.toHaveBeenCalled();
    await caller(user(5, ORG_A, ['items:create'])).create();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'org', orgId: ORG_A, action: 'CREATE', entityId: '7',
        actor: expect.objectContaining({ kind: 'user', userId: 5 }), metadata: { path: 'create' },
      })
    );
  });
});

describe('createDbClients', () => {
  it('dbWithRLS sets the org context inside the transaction before fn runs', async () => {
    const { clients, rlsCalls } = makeClients();
    const seen = await clients.dbWithRLS(ORG_A, async (tx) => {
      tx.log.push('select');
      return tx.log.slice();
    });
    expect(seen).toEqual([`set rls.current_org_id=${ORG_A}`, 'select']);
    expect(rlsCalls).toHaveLength(1);
  });

  it('dbWithRLS rejects a bad org id and a failing setter (fn never runs)', async () => {
    const { clients } = makeClients();
    const fn = vi.fn(async () => 1);
    await expect(clients.dbWithRLS(0, fn)).rejects.toThrow(/orgId/);
    await expect(clients.dbWithRLS(Number.NaN, fn)).rejects.toThrow(/orgId/);
    const failing = createDbClients<FakeDb>({
      appUrl: 'postgres://app',
      connect: (_u, role) => new FakeDb(role),
      setRlsContext: async () => {
        throw new Error('set_config failed');
      },
    });
    await expect(failing.dbWithRLS(ORG_A, fn)).rejects.toThrow('set_config failed');
    expect(fn).not.toHaveBeenCalled();
  });

  it('withPrivilegedDb requires a reason, logs it, and sets the superuser flag', async () => {
    const { clients, privilegedEvents } = makeClients();
    const fn = vi.fn(async () => 1);
    await expect(clients.withPrivilegedDb('', fn)).rejects.toThrow(/reason/);
    await expect(clients.withPrivilegedDb('   ', fn)).rejects.toThrow(/reason/);
    expect(fn).not.toHaveBeenCalled();
    expect(privilegedEvents).toEqual([]);

    const log = await clients.withPrivilegedDb('backoffice: list all orgs', async (tx) => {
      expect(tx.client).toBe('privileged');
      return tx.log.slice();
    });
    expect(privilegedEvents).toEqual(['backoffice: list all orgs']);
    expect(log.join(' ')).toContain('app.is_superuser');
  });

  it('withPrivilegedDb throws when no privileged url is configured', async () => {
    const { clients } = makeClients(false);
    expect(clients.isPrivilegedDbAvailable()).toBe(false);
    await expect(clients.withPrivilegedDb('x', async () => 1)).rejects.toThrow(/not configured/);
  });
});

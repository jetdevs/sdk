/**
 * A global role is not a system user.
 *
 * Owner and Admin are seeded as GLOBAL role templates (`isGlobalRole: true`,
 * `isSystemRole: false`): every org can assign them. Platform staff are the
 * roles flagged `isSystemRole`. The procedure factories used to treat a global
 * role — and any role NAMED "Super User" — as platform staff, which set
 * `app.is_superuser` and passed the superuser branch of every org-isolation
 * RLS policy: the Owner of org A read and updated org B.
 *
 * The harness models what matters for that bug:
 *  - a pooled connection (`ctx.db`) whose settings persist across requests
 *    when set on the bare connection, and are discarded at the end of a
 *    transaction when set on the transaction handle;
 *  - an org-isolation policy on `rows`:
 *    `current_setting('app.is_superuser') = 'true' OR org_id = current org`.
 */

import { describe, it, expect } from 'vitest';
import { initTRPC, TRPCError } from '@trpc/server';
import {
  createAdminOnlyProcedure,
  createOrgProtectedProcedure,
  createOrgProtectedProcedureWithPermission,
  createWithPermission,
} from '../procedures';

const ORG_A = 1;
const ORG_B = 2;

// ---------------------------------------------------------------------------
// Roles and assignments
// ---------------------------------------------------------------------------

interface Role {
  id: number;
  name: string;
  isSystemRole: boolean;
  isGlobalRole: boolean;
  permissions: string[];
}

const SUPER_USER: Role = { id: 1, name: 'Super User', isSystemRole: true, isGlobalRole: true, permissions: ['admin:full_access'] };
const OWNER: Role = { id: 2, name: 'Owner', isSystemRole: false, isGlobalRole: true, permissions: ['org:read', 'org:update', 'user:read'] };
const MEMBER: Role = { id: 3, name: 'Member', isSystemRole: false, isGlobalRole: false, permissions: ['org:read'] };
/** An org-created custom role that happens to be named like platform staff. */
const FAKE_SUPER: Role = { id: 4, name: 'Super User', isSystemRole: false, isGlobalRole: false, permissions: ['org:read'] };
const ORG_ADMIN_PERMS: Role = { id: 5, name: 'Ops', isSystemRole: false, isGlobalRole: false, permissions: ['admin:full_access'] };

interface Assignment {
  userId: number;
  orgId: number | null;
  isActive: boolean;
  role: Role;
}

// ---------------------------------------------------------------------------
// Privileged DB (no RLS): just enough of drizzle's relational query API
// ---------------------------------------------------------------------------

type Pred = (row: any) => boolean;
const ops = {
  eq: (col: string, value: unknown): Pred => (row) => value !== null && value !== undefined && row[col] === value,
  isNull: (col: string): Pred => (row) => row[col] === null || row[col] === undefined,
  and: (...preds: Array<Pred | undefined>): Pred => (row) => preds.every((p) => !p || p(row)),
  or: (...preds: Array<Pred | undefined>): Pred => (row) => preds.some((p) => !!p && p(row)),
};
const userRoleCols = { userId: 'userId', orgId: 'orgId', isActive: 'isActive', roleId: 'roleId' };

function privilegedDb(assignments: Assignment[]) {
  return {
    query: {
      userRoles: {
        findMany: async ({ where }: { where: (cols: any, o: typeof ops) => Pred }) => {
          const pred = where(userRoleCols, ops);
          return assignments.filter(pred).map((a) => ({
            ...a,
            role: {
              ...a.role,
              rolePermissions: a.role.permissions.map((slug) => ({ permission: { slug } })),
            },
          }));
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Pooled connection with an org-isolation RLS policy
// ---------------------------------------------------------------------------

interface Row { id: number; orgId: number; name: string }

class Connection {
  /** Session-level settings: survive the request, the next request on this connection sees them. */
  readonly session = new Map<string, string>();
  rows: Row[] = [
    { id: 10, orgId: ORG_A, name: 'a-row' },
    { id: 20, orgId: ORG_B, name: 'b-row' },
  ];
  transactions = 0;

  /** The bare connection handle (what `ctx.db` is). */
  readonly bare = handle(this, null);

  async transaction<R>(fn: (tx: ReturnType<typeof handle>) => Promise<R>): Promise<R> {
    this.transactions++;
    // Transaction-local settings, discarded when the transaction ends.
    return fn(handle(this, new Map()));
  }
}

function handle(conn: Connection, local: Map<string, string> | null) {
  const get = (k: string) => local?.get(k) ?? conn.session.get(k);
  const visible = (row: Row) =>
    get('app.is_superuser') === 'true' || String(row.orgId) === get('app.current_org_id');
  return {
    isTransaction: local !== null,
    set(k: string, v: string) {
      (local ?? conn.session).set(k, v);
    },
    selectRows(): Row[] {
      return conn.rows.filter(visible).map((r) => ({ ...r }));
    },
    renameRow(id: number, name: string): number {
      const hits = conn.rows.filter((r) => r.id === id && visible(r));
      hits.forEach((r) => (r.name = name));
      return hits.length;
    },
  };
}

function bareDb(conn: Connection) {
  return Object.assign(conn.bare, { transaction: conn.transaction.bind(conn) });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const t = initTRPC.context<any>().create();

function build(assignments: Assignment[]) {
  const db = privilegedDb(assignments);
  const privilegedCalls: string[] = [];
  const superuserCalls: Array<{ value: boolean; onTransaction: boolean }> = [];

  const orgProtected = createOrgProtectedProcedure(t, {
    getPrivilegedDb: async (cb: (db: any) => Promise<any>) => cb(db),
    setOrgContext: async (h: any, orgId: number) => h.set('app.current_org_id', String(orgId)),
    setSuperuserFlag: async (h: any, value: boolean) => {
      superuserCalls.push({ value, onTransaction: h.isTransaction === true });
      h.set('app.is_superuser', String(value));
    },
  });
  // Instrument the privileged handler path separately from the role lookup.
  const orgProtectedTracked = orgProtected.use(async ({ ctx, next }: any) => {
    const dbWithRLS = ctx.dbWithRLS;
    return next({
      ctx: {
        ...ctx,
        dbWithRLS: (cb: any) => {
          privilegedCalls.push(ctx.isSystemUser ? 'system' : 'org');
          return dbWithRLS(cb);
        },
      },
    });
  });

  const withPermission = createWithPermission(t, { getPrivilegedDb: async () => db });
  const adminOnly = createAdminOnlyProcedure(t, { getPrivilegedDb: async () => db });
  const orgWithPermission = createOrgProtectedProcedureWithPermission(t, orgProtected, {
    getPrivilegedDb: async () => db,
  });

  const router = t.router({
    whoAmI: orgProtectedTracked.query(({ ctx }: any) => ({
      isSystemUser: ctx.isSystemUser,
      activeOrgId: ctx.activeOrgId,
    })),
    listRows: orgProtectedTracked.query(({ ctx }: any) =>
      ctx.dbWithRLS(async (h: any) => h.selectRows())
    ),
    renameRow: orgProtectedTracked
      .input((v: unknown) => v as { id: number; name: string })
      .mutation(({ ctx, input }: any) => ctx.dbWithRLS(async (h: any) => h.renameRow(input.id, input.name))),
    adminThing: adminOnly.query(() => 'admin-ok'),
    deleteOrg: withPermission('org:delete').mutation(() => 'deleted'),
    orgDelete: orgWithPermission('org:delete').mutation(() => 'deleted'),
  });

  const caller = (conn: Connection, userId: number, currentOrgId: number | null, sessionExtra: Record<string, unknown> = {}) =>
    t.createCallerFactory(router)({
      session: {
        user: { id: userId, email: `u${userId}@example.com`, currentOrgId, permissions: [], ...sessionExtra },
        expires: new Date(Date.now() + 3_600_000).toISOString(),
      },
      db: bareDb(conn),
    });

  return { caller, superuserCalls, privilegedCalls };
}

const OWNER_ID = 100;
const STAFF_ID = 200;
const FAKE_SUPER_ID = 300;
const CROSS_ID = 400;
const OPS_ID = 500;

const ASSIGNMENTS: Assignment[] = [
  // Owner of org A only
  { userId: OWNER_ID, orgId: ORG_A, isActive: true, role: OWNER },
  // Platform staff
  { userId: STAFF_ID, orgId: null, isActive: true, role: SUPER_USER },
  // Org A custom role named "Super User", not a system role
  { userId: FAKE_SUPER_ID, orgId: ORG_A, isActive: true, role: FAKE_SUPER },
  // Owner of org B, plain Member of org A
  { userId: CROSS_ID, orgId: ORG_B, isActive: true, role: OWNER },
  { userId: CROSS_ID, orgId: ORG_A, isActive: true, role: MEMBER },
  // Org B role carrying an admin permission
  { userId: OPS_ID, orgId: ORG_B, isActive: true, role: ORG_ADMIN_PERMS },
];

async function expectCode(p: Promise<unknown>, code: TRPCError['code']) {
  await expect(p).rejects.toMatchObject({ code });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('global role (Owner/Admin) is not a system user', () => {
  it('Owner in org A is not a system user and reads only org A rows', async () => {
    const h = build(ASSIGNMENTS);
    const conn = new Connection();
    const api = h.caller(conn, OWNER_ID, ORG_A);

    expect(await api.whoAmI()).toEqual({ isSystemUser: false, activeOrgId: ORG_A });
    const rows = await api.listRows();
    expect(rows.map((r: Row) => r.orgId)).toEqual([ORG_A]);
    expect(h.superuserCalls.some((c) => c.value === true)).toBe(false);
  });

  it('Owner in org A cannot update an org B row', async () => {
    const h = build(ASSIGNMENTS);
    const conn = new Connection();
    const api = h.caller(conn, OWNER_ID, ORG_A);

    expect(await api.renameRow({ id: 20, name: 'pwned' })).toBe(0);
    expect(conn.rows.find((r) => r.id === 20)!.name).toBe('b-row');
  });

  it('Owner with no current org is refused, not handed privileged access', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), OWNER_ID, null);

    await expectCode(api.listRows(), 'BAD_REQUEST');
    expect(h.privilegedCalls).toEqual([]);
  });

  it('Owner of org B acting in org A as a Member is not a system user', async () => {
    const h = build(ASSIGNMENTS);
    const conn = new Connection();
    const api = h.caller(conn, CROSS_ID, ORG_A);

    expect((await api.whoAmI()).isSystemUser).toBe(false);
    expect((await api.listRows()).map((r: Row) => r.orgId)).toEqual([ORG_A]);
  });
});

describe('a role NAME never grants system status', () => {
  it('custom role named "Super User" without isSystemRole is not a system user', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), FAKE_SUPER_ID, ORG_A);

    expect((await api.whoAmI()).isSystemUser).toBe(false);
    expect((await api.listRows()).map((r: Row) => r.orgId)).toEqual([ORG_A]);
  });

  it('custom role named "Super User" passes no admin or permission gate', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), FAKE_SUPER_ID, ORG_A, {
      roles: [{ name: 'Super User', isSystemRole: false }],
    });

    await expectCode(api.adminThing(), 'FORBIDDEN');
    await expectCode(api.deleteOrg(), 'FORBIDDEN');
    await expectCode(api.orgDelete(), 'FORBIDDEN');
  });

  it('a role in another org grants no admin access when the user has no current org', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), OPS_ID, null);

    await expectCode(api.adminThing(), 'FORBIDDEN');
  });
});

describe('platform staff (isSystemRole) keep the superuser path', () => {
  it('system user in org A reads every org', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), STAFF_ID, ORG_A);

    expect(await api.whoAmI()).toEqual({ isSystemUser: true, activeOrgId: ORG_A });
    expect((await api.listRows()).map((r: Row) => r.orgId).sort()).toEqual([ORG_A, ORG_B]);
  });

  it('system user with no org gets privileged access', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), STAFF_ID, null);

    expect(await api.whoAmI()).toEqual({ isSystemUser: true, activeOrgId: undefined });
  });

  it('system user passes admin and permission gates', async () => {
    const h = build(ASSIGNMENTS);
    const api = h.caller(new Connection(), STAFF_ID, ORG_A);

    expect(await api.adminThing()).toBe('admin-ok');
    expect(await api.deleteOrg()).toBe('deleted');
    expect(await api.orgDelete()).toBe('deleted');
  });
});

describe('superuser flag is transaction-local', () => {
  it('is set only on the transaction that runs the callback, never on the bare connection', async () => {
    const h = build(ASSIGNMENTS);
    const conn = new Connection();
    await h.caller(conn, STAFF_ID, ORG_A).listRows();

    expect(conn.transactions).toBe(1);
    expect(h.superuserCalls.filter((c) => c.value === true)).toEqual([{ value: true, onTransaction: true }]);
    expect(conn.session.has('app.is_superuser')).toBe(false);
  });

  it('does not leak to the next request on the same pooled connection', async () => {
    const h = build(ASSIGNMENTS);
    const conn = new Connection();

    await h.caller(conn, STAFF_ID, ORG_A).listRows();
    const ownerRows = await h.caller(conn, OWNER_ID, ORG_A).listRows();

    expect(ownerRows.map((r: Row) => r.orgId)).toEqual([ORG_A]);
  });

  it('overrides a superuser flag already leaked onto the connection', async () => {
    const h = build(ASSIGNMENTS);
    const conn = new Connection();
    // Left behind by some other code path that set it session-wide.
    conn.session.set('app.is_superuser', 'true');

    const ownerRows = await h.caller(conn, OWNER_ID, ORG_A).listRows();

    expect(ownerRows.map((r: Row) => r.orgId)).toEqual([ORG_A]);
  });
});

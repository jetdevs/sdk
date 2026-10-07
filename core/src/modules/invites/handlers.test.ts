/**
 * p131 INV-002 — invite route handlers. Real service, in-memory store, so the
 * caller scoping (P21) is exercised end to end through the handler.
 */
import { describe, expect, it, vi } from 'vitest';

import { createInviteHandlers } from './handlers';
import { createInviteService, type InviteService } from './service';
import type { InviteDb, InviteStore, NewInviteRow } from './store';
import type { InviteCaller, OrgInvite } from './types';

const T0 = new Date('2026-10-07T00:00:00.000Z');
const db = {} as InviteDb;

function memStore(): InviteStore {
  const rows: OrgInvite[] = [];
  let seq = 0;
  const c = (r?: OrgInvite) => (r ? { ...r } : null);
  return {
    transaction: (d, fn) => fn(d),
    async findOpen(_d, orgId, email) {
      return c(rows.find((r) => r.orgId === orgId && r.email === email && r.status === 'pending'));
    },
    async insert(_d, row: NewInviteRow) {
      const r: OrgInvite = {
        ...row,
        id: ++seq,
        status: 'pending',
        createdAt: T0,
        acceptedAt: null,
        acceptedUserId: null,
        cancelledAt: null,
        provisionState: 'none',
        provisionAttempts: 0,
      };
      rows.push(r);
      return { ...r };
    },
    async rotate(_d, id, patch) {
      const r = rows.find((x) => x.id === id && x.status === 'pending');
      if (!r) return null;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (r as unknown as Record<string, unknown>)[k] = v;
      return { ...r };
    },
    async getById(_d, id) {
      return c(rows.find((r) => r.id === id));
    },
    async getByTokenHash(_d, h) {
      return c(rows.find((r) => r.tokenHash === h));
    },
    async markExpired() {
      return null;
    },
    async cancel(_d, id, now) {
      const r = rows.find((x) => x.id === id && x.status === 'pending');
      if (!r) return null;
      r.status = 'cancelled';
      r.cancelledAt = now;
      return { ...r };
    },
    async listByOrg(_d, orgId, k) {
      return rows
        .filter((r) => r.orgId === orgId && r.clientId === k.clientId && r.sourceSystem === k.sourceSystem)
        .map((r) => ({ ...r }));
    },
    // accept is not routed through these handlers; email binding is covered in service.test.ts.
    async acceptConditional() {
      return null;
    },
  };
}

/** Connect orgs keyed (sourceSystem, sourceOrgRef) — the same ref under two systems is two orgs. */
function setup() {
  const orgs = new Map<string, { orgId: number; orgName: string }>();
  let nextOrg = 100;
  const service = createInviteService({
    ttlDays: 7,
    acceptUrl: (t) => `https://connect.test/invite/${t}`,
    store: memStore(),
    now: () => T0,
    sendInviteEmail: vi.fn(async () => undefined),
    resolveOrg: async (_d, { sourceSystem, sourceOrgRef, orgName, create }) => {
      const key = `${sourceSystem}:${sourceOrgRef}`;
      let o = orgs.get(key);
      if (!o && create) {
        o = { orgId: nextOrg++, orgName: orgName ?? sourceOrgRef };
        orgs.set(key, o);
      }
      return o ?? null;
    },
    describeOrg: async (_d, { orgId, sourceSystem }) => {
      for (const [k, v] of orgs) {
        const [sys, ref] = k.split(':');
        if (v.orgId === orgId && sys === sourceSystem) return { sourceOrgRef: ref!, orgName: v.orgName };
      }
      return null;
    },
  });
  return { service };
}

const CADRA: InviteCaller = { clientId: 'cadra-web', sourceSystem: 'cadra' };
const YOBO: InviteCaller = { clientId: 'yobo-merchant', sourceSystem: 'yobo' };

function authBy(map: Record<string, InviteCaller>) {
  return (req: Request) => {
    const k = req.headers.get('x-internal-api-key') ?? '';
    return map[k] ?? new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  };
}

const KEYS = { 'key-cadra': CADRA, 'key-yobo': YOBO };

function post(path: string, body: unknown, key?: string): Request {
  return new Request(`https://connect.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-internal-api-key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function get(path: string, key?: string): Request {
  return new Request(`https://connect.test${path}`, { headers: key ? { 'x-internal-api-key': key } : {} });
}

const BODY = {
  email: 'Ana@Example.com',
  roleRef: '7',
  roleName: 'Admin',
  sourceOrgRef: '42',
  orgName: 'Acme',
  invitedBySub: 'sub-inviter',
  invitedByName: 'Ira',
  appUrl: 'https://app.cadraos.test/',
};

/** A service whose every method throws — proves the handler never reached it. */
function tripwireService(): InviteService {
  return new Proxy({} as InviteService, {
    get(_t, p) {
      return () => {
        throw new Error(`service.${String(p)} called`);
      };
    },
  });
}

describe('invite handlers — authorize first', () => {
  it('unauthorized caller is refused before any body read or service call (every handler)', async () => {
    const authorize = vi.fn(() => new Response('{"error":"unauthorized"}', { status: 401 }));
    const getDb = vi.fn(() => db);
    const h = createInviteHandlers({ service: tripwireService(), db: getDb, authorize });
    const ctx = { params: Promise.resolve({ id: '1' }) };
    const reqs = [
      [h.create, post('/invites', BODY)],
      [h.list, get('/invites?orgRef=42')],
      [h.resend, post('/invites/1/resend', {})],
      [h.cancel, post('/invites/1/cancel', {})],
      [h.cancelByEmail, post('/invites/cancel-by-email', { sourceOrgRef: '42', email: 'a@b.co' })],
    ] as const;
    for (const [fn, req] of reqs) {
      const res = await (fn as (r: Request, c?: unknown) => Promise<Response>)(req, ctx);
      expect(res.status).toBe(401);
      expect(req.bodyUsed).toBe(false);
    }
    expect(authorize).toHaveBeenCalledTimes(5);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('a throwing authorize answers 401 without touching the service', async () => {
    const h = createInviteHandlers({
      service: tripwireService(),
      db,
      authorize: () => {
        throw new Error('boom');
      },
    });
    expect((await h.create(post('/invites', BODY))).status).toBe(401);
  });

  it('a caller missing sourceSystem is refused', async () => {
    const h = createInviteHandlers({
      service: tripwireService(),
      db,
      authorize: () => ({ clientId: 'x', sourceSystem: '' }),
    });
    expect((await h.list(get('/invites?orgRef=1'))).status).toBe(401);
  });
});

describe('invite handlers — zod 400s', () => {
  const h = () => createInviteHandlers({ service: tripwireService(), db, authorize: () => CADRA });

  it.each([
    ['missing email', { ...BODY, email: undefined }],
    ['bad email', { ...BODY, email: 'nope' }],
    ['bad appUrl', { ...BODY, appUrl: 'not a url' }],
    ['empty roleRef', { ...BODY, roleRef: '' }],
    ['missing sourceOrgRef', { ...BODY, sourceOrgRef: undefined }],
  ])('create rejects %s', async (_n, body) => {
    const res = await h().create(post('/invites', body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
  });

  it('create rejects malformed JSON', async () => {
    const res = await h().create(post('/invites', '{not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('cancel-by-email rejects an invalid body', async () => {
    const res = await h().cancelByEmail(post('/invites/cancel-by-email', { sourceOrgRef: '', email: 'x' }));
    expect(res.status).toBe(400);
  });

  it('list requires orgRef', async () => {
    expect((await h().list(get('/invites'))).status).toBe(400);
  });

  it.each(['abc', '0', '-1', '1.5', ''])('resend/cancel reject id %j', async (id) => {
    const ctx = { params: { id } };
    expect((await h().resend(post('/x', {}), ctx)).status).toBe(400);
    expect((await h().cancel(post('/x', {}), ctx)).status).toBe(400);
  });
});

describe('invite handlers — behaviour', () => {
  it('create returns { id, status, expiresAt, connectOrgId } and never the token', async () => {
    const { service } = setup();
    const h = createInviteHandlers({ service, db, authorize: authBy(KEYS) });
    const res = await h.create(post('/invites', BODY, 'key-cadra'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 1, status: 'pending', connectOrgId: 100, emailSent: true, superseded: false });
    expect(body.expiresAt).toBe('2026-10-14T00:00:00.000Z');
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/token/i);

    const again = await h.create(post('/invites', { ...BODY, roleRef: '8' }, 'key-cadra'));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: 1, superseded: true });
  });

  it('caller identity comes from authorize, never from the body', async () => {
    const { service } = setup();
    const spy = vi.spyOn(service, 'create');
    const h = createInviteHandlers({ service, db, authorize: authBy(KEYS) });
    await h.create(post('/invites', { ...BODY, sourceSystem: 'yobo', clientId: 'evil' }, 'key-cadra'));
    expect(spy.mock.calls[0]![1]).toEqual(CADRA);
    expect(spy.mock.calls[0]![2]).not.toHaveProperty('sourceSystem');
    expect(spy.mock.calls[0]![2]).not.toHaveProperty('clientId');
  });

  it('GET ?orgRef= returns only the calling source system\'s invites — never another system\'s', async () => {
    const { service } = setup();
    const h = createInviteHandlers({ service, db, authorize: authBy(KEYS) });
    // Same sourceOrgRef "42" under two source systems = two different Connect orgs.
    await h.create(post('/invites', { ...BODY, email: 'cadra-only@x.co' }, 'key-cadra'));
    await h.create(post('/invites', { ...BODY, email: 'yobo-only@x.co' }, 'key-yobo'));

    const cadra = await (await h.list(get('/invites?orgRef=42', 'key-cadra'))).json();
    expect(cadra.invites.map((i: { email: string }) => i.email)).toEqual(['cadra-only@x.co']);
    const yobo = await (await h.list(get('/invites?orgRef=42', 'key-yobo'))).json();
    expect(yobo.invites.map((i: { email: string }) => i.email)).toEqual(['yobo-only@x.co']);

    // Wire shape carries no token material.
    expect(Object.keys(cadra.invites[0])).not.toContain('tokenHash');
    expect(Object.keys(cadra.invites[0])).not.toContain('accessCodeId');
    // An org the caller's system never created lists empty.
    const none = await (await h.list(get('/invites?orgRef=999', 'key-cadra'))).json();
    expect(none.invites).toEqual([]);
  });

  it('resend/cancel of another system\'s invite answers 404; own answers 200', async () => {
    const { service } = setup();
    const h = createInviteHandlers({ service, db, authorize: authBy(KEYS) });
    const { id } = await (await h.create(post('/invites', BODY, 'key-yobo'))).json();
    const ctx = { params: Promise.resolve({ id: String(id) }) };

    expect((await h.resend(post('/r', { sourceOrgRef: '42' }, 'key-cadra'), ctx)).status).toBe(404);
    expect((await h.cancel(post('/c', { sourceOrgRef: '42' }, 'key-cadra'), ctx)).status).toBe(404);

    const r = await h.resend(post('/r', { sourceOrgRef: '42' }, 'key-yobo'), ctx);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id, status: 'pending', emailSent: true });

    const c = await h.cancel(post('/c', { sourceOrgRef: '42' }, 'key-yobo'), ctx);
    expect(await c.json()).toEqual({ id, status: 'cancelled' });
    // Cancelling twice → 409 not_pending.
    expect((await h.cancel(post('/c', { sourceOrgRef: '42' }, 'key-yobo'), ctx)).status).toBe(409);
  });

  it('resend/cancel require a sourceOrgRef body — 400 before any service call', async () => {
    const h = createInviteHandlers({ service: tripwireService(), db, authorize: () => CADRA });
    const ctx = { params: { id: '1' } };
    for (const body of [{}, { sourceOrgRef: '' }, { sourceOrgRef: '   ' }, { sourceOrgRef: 42 }, { sourceOrgRef: 'x'.repeat(256) }, 'not json']) {
      for (const fn of [h.resend, h.cancel]) {
        const res = await fn(post('/x', body), ctx);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid_body', field: 'sourceOrgRef' });
      }
    }
  });

  it('resend/cancel with another org\'s sourceOrgRef (same client) answer 404 and change nothing', async () => {
    const { service } = setup();
    const h = createInviteHandlers({ service, db, authorize: authBy(KEYS) });
    const { id } = await (await h.create(post('/invites', BODY, 'key-cadra'))).json();
    await h.create(post('/invites', { ...BODY, sourceOrgRef: '77', email: 'other@x.co' }, 'key-cadra'));
    const ctx = { params: Promise.resolve({ id: String(id) }) };
    expect((await h.resend(post('/r', { sourceOrgRef: '77' }, 'key-cadra'), ctx)).status).toBe(404);
    expect((await h.cancel(post('/c', { sourceOrgRef: '77' }, 'key-cadra'), ctx)).status).toBe(404);
    expect((await h.cancel(post('/c', { sourceOrgRef: 'never' }, 'key-cadra'), ctx)).status).toBe(404);
    const list = await (await h.list(get('/invites?orgRef=42', 'key-cadra'))).json();
    expect(list.invites.find((i: { id: number }) => i.id === id).status).toBe('pending');
    const ok = await h.cancel(post('/c', { sourceOrgRef: ' 42 ' }, 'key-cadra'), ctx);
    expect(await ok.json()).toEqual({ id, status: 'cancelled' });
  });

  it('cancel-by-email is caller-scoped', async () => {
    const { service } = setup();
    const h = createInviteHandlers({ service, db, authorize: authBy(KEYS) });
    await h.create(post('/invites', BODY, 'key-cadra'));
    const foreign = await h.cancelByEmail(post('/x', { sourceOrgRef: '42', email: BODY.email }, 'key-yobo'));
    expect(await foreign.json()).toEqual({ cancelled: 0 });
    const own = await h.cancelByEmail(post('/x', { sourceOrgRef: '42', email: BODY.email }, 'key-cadra'));
    expect(await own.json()).toEqual({ cancelled: 1 });
  });

  it('an unexpected service error answers 500 and reaches onError', async () => {
    const onError = vi.fn();
    const service = { list: vi.fn(async () => { throw new Error('db down'); }) } as unknown as InviteService;
    const h = createInviteHandlers({ service, db, authorize: () => CADRA, onError });
    const res = await h.list(get('/invites?orgRef=1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
    expect(onError).toHaveBeenCalledWith('invites.list', expect.any(Error));
  });
});

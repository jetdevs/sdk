/**
 * p131 INV-001 — invite service, UNIT (in-memory fake store; the real-Postgres
 * twin is invites.db.test.ts). The db handle is a Proxy that throws on any
 * access, proving the service itself writes nothing but through the store.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInviteService, InviteError, type CreateInviteServiceOptions } from './service';
import type { InviteDb, InviteStore, NewInviteRow } from './store';
import { hashInviteToken } from './token';
import type { InviteCaller, OrgInvite } from './types';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-10-07T00:00:00.000Z');

function fakeStore(clock: () => Date) {
  const rows: OrgInvite[] = [];
  let seq = 0;
  const clone = (r: OrgInvite | undefined | null) => (r ? { ...r } : null);
  const store: InviteStore = {
    transaction: (db, fn) => fn(db),
    async findOpen(_db, orgId, email) {
      return clone(rows.find((r) => r.orgId === orgId && r.email === email && r.status === 'pending'));
    },
    async insert(_db, row: NewInviteRow) {
      if (rows.some((r) => r.orgId === row.orgId && r.email === row.email && r.status === 'pending')) {
        throw new Error('unique violation org_invites_one_open_per_email');
      }
      const r: OrgInvite = {
        ...row,
        id: ++seq,
        status: 'pending',
        createdAt: clock(),
        acceptedAt: null,
        acceptedUserId: null,
        cancelledAt: null,
        provisionState: 'none',
        provisionAttempts: 0,
      };
      rows.push(r);
      return { ...r };
    },
    async rotate(_db, id, patch) {
      const r = rows.find((x) => x.id === id && x.status === 'pending');
      if (!r) return null;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (r as unknown as Record<string, unknown>)[k] = v;
      return { ...r };
    },
    async getById(_db, id) {
      return clone(rows.find((r) => r.id === id));
    },
    async getByTokenHash(_db, h) {
      return clone(rows.find((r) => r.tokenHash === h));
    },
    async markExpired(_db, id, now) {
      const r = rows.find((x) => x.id === id && x.status === 'pending' && x.expiresAt <= now);
      if (!r) return null;
      r.status = 'expired';
      return { ...r };
    },
    async cancel(_db, id, now) {
      const r = rows.find((x) => x.id === id && x.status === 'pending');
      if (!r) return null;
      r.status = 'cancelled';
      r.cancelledAt = now;
      return { ...r };
    },
    async listByOrg(_db, orgId, c) {
      return rows.filter((r) => r.orgId === orgId && r.clientId === c.clientId && r.sourceSystem === c.sourceSystem).map((r) => ({ ...r }));
    },
    async acceptConditional(_db, { id, tokenHash, userId, now }) {
      const r = rows.find(
        (x) => x.id === id && x.tokenHash === tokenHash && x.status === 'pending' && x.expiresAt.getTime() > clock().getTime(),
      );
      if (!r) return null;
      Object.assign(r, { status: 'accepted', acceptedAt: now, acceptedUserId: userId, provisionState: 'pending' });
      return { ...r };
    },
  };
  return { store, rows };
}

const db = new Proxy({}, {
  get(_t, p) {
    throw new Error(`service touched db.${String(p)} directly`);
  },
}) as unknown as InviteDb;

const CALLER: InviteCaller = { clientId: 'client-a', sourceSystem: 'src-a' };
const OTHER: InviteCaller = { clientId: 'client-b', sourceSystem: 'src-a' };
const ORGS: Record<string, { orgId: number; orgName: string }> = { 'org-1': { orgId: 11, orgName: 'Acme' } };

function setup(over: Partial<CreateInviteServiceOptions> = {}) {
  let t = T0;
  const clock = () => t;
  const { store, rows } = fakeStore(clock);
  const sent: Array<{ to: string; variables: Record<string, string> }> = [];
  const codes: Array<{ id: number; tag: string; boundEmail: string; expiresAt: Date; revoked: boolean }> = [];
  const accessGate = {
    createCode: vi.fn(async (_db: never, input: { tag: string; boundEmail: string; expiresAt: Date }) => {
      const c = { id: codes.length + 100, tag: input.tag, boundEmail: input.boundEmail, expiresAt: input.expiresAt, revoked: false };
      codes.push(c);
      return { id: c.id };
    }),
    revokeCode: vi.fn(async (_db: never, id: number) => {
      const c = codes.find((x) => x.id === id);
      if (c) c.revoked = true;
    }),
  };
  const svc = createInviteService({
    ttlDays: 7,
    acceptUrl: (tok) => `https://idp.test/invite/${tok}`,
    resolveOrg: async (_db, i) => (i.sourceSystem === 'src-a' ? ORGS[i.sourceOrgRef] ?? null : null),
    describeOrg: async (_db, i) => (i.orgId === 11 ? { sourceOrgRef: 'org-1', orgName: 'Acme' } : null),
    sendInviteEmail: async (m) => {
      sent.push(m as never);
    },
    accessGate,
    now: clock,
    store,
    ...over,
  });
  return { svc, rows, sent, codes, accessGate, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

const input = (over: Record<string, unknown> = {}) => ({
  sourceOrgRef: 'org-1',
  orgName: 'Acme',
  email: '  Ann@Example.COM ',
  roleRef: '7',
  roleName: 'Admin',
  invitedBySub: 'sub-inviter',
  invitedByName: 'Ivy',
  appUrl: 'https://app.test/',
  ...over,
});

describe('p131 INV-001 invite service (unit)', () => {
  const logs: unknown[][] = [];
  beforeEach(() => {
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a));
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
    logs.length = 0;
  });

  it('AC1 (I2): create writes only org_invites (+ access code) — db never touched directly, no users/org_members', async () => {
    const { svc, rows, codes } = setup();
    const r = await svc.create(db, CALLER, input());
    expect(rows).toHaveLength(1);
    expect(codes).toHaveLength(1);
    expect(r.invite.email).toBe('ann@example.com');
    expect(r.connectOrgId).toBe(11);
    expect(r.invite.status).toBe('pending');
  });

  it('AC2: only the sha256 of the token is stored; raw token returned once, never persisted or logged', async () => {
    const onError = vi.fn();
    const { svc, rows } = setup({ onError, sendInviteEmail: async () => { throw new Error('mailgun down'); } });
    const r = await svc.create(db, CALLER, input());
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows[0]!.tokenHash).toBe(hashInviteToken(r.token));
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(r.token);
    expect('tokenHash' in r.invite).toBe(false);
    expect(JSON.stringify(onError.mock.calls)).not.toContain(r.token);
    expect(JSON.stringify(logs)).not.toContain(r.token);
  });

  it('AC3 (Q3): expires 7 days after create; resend rotates token, restarts 7 days, old token → not_found', async () => {
    const { svc, advance } = setup();
    const r = await svc.create(db, CALLER, input());
    expect(r.invite.expiresAt.getTime()).toBe(T0.getTime() + 7 * DAY);
    advance(3 * DAY);
    const again = await svc.resend(db, CALLER, r.invite.id);
    expect(again.token).not.toBe(r.token);
    expect(again.invite.id).toBe(r.invite.id);
    expect(again.invite.expiresAt.getTime()).toBe(T0.getTime() + 10 * DAY);
    expect(await svc.getByToken(db, r.token)).toEqual({ status: 'not_found' });
    expect((await svc.getByToken(db, again.token)).status).toBe('pending');
  });

  it('AC4 (P22): second create for an open email+org supersedes — same id, role updated, token rotated, expiry restarted', async () => {
    const { svc, rows, advance, codes } = setup();
    const a = await svc.create(db, CALLER, input());
    advance(DAY);
    const b = await svc.create(db, CALLER, input({ email: 'ann@example.com', roleRef: '9', roleName: 'Standard' }));
    expect(b.superseded).toBe(true);
    expect(b.invite.id).toBe(a.invite.id);
    expect(b.invite.roleRef).toBe('9');
    expect(b.token).not.toBe(a.token);
    expect(b.invite.expiresAt.getTime()).toBe(T0.getTime() + 8 * DAY);
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
    expect(codes[0]!.revoked).toBe(true);
    expect(codes[1]!.revoked).toBe(false);
  });

  it('AC5: getByToken reports pending | accepted | cancelled | expired; an expired pending row is stored as expired', async () => {
    const { svc, rows, advance, codes } = setup();
    const p = await svc.create(db, CALLER, input({ email: 'p@x.io' }));
    const a = await svc.create(db, CALLER, input({ email: 'a@x.io' }));
    const c = await svc.create(db, CALLER, input({ email: 'c@x.io' }));
    await svc.accept(db, { inviteId: a.invite.id, token: a.token, userId: 5 });
    await svc.cancel(db, CALLER, c.invite.id);
    expect((await svc.getByToken(db, p.token)).status).toBe('pending');
    expect((await svc.getByToken(db, a.token)).status).toBe('accepted');
    expect((await svc.getByToken(db, c.token)).status).toBe('cancelled');
    expect(await svc.getByToken(db, 'nope')).toEqual({ status: 'not_found' });
    advance(7 * DAY);
    expect((await svc.getByToken(db, p.token)).status).toBe('expired');
    expect(rows.find((r) => r.id === p.invite.id)!.status).toBe('expired');
    expect(codes.find((x) => x.boundEmail === 'p@x.io')!.revoked).toBe(true);
  });

  it('AC6: accept is single-use — a second accept fails with no side effects', async () => {
    const { svc, rows } = setup();
    const r = await svc.create(db, CALLER, input());
    const ok = await svc.accept(db, { inviteId: r.invite.id, token: r.token, userId: 5 });
    expect(ok.status).toBe('accepted');
    expect(ok.provisionState).toBe('pending');
    const before = JSON.stringify(rows);
    await expect(svc.accept(db, { inviteId: r.invite.id, token: r.token, userId: 6 })).rejects.toBeInstanceOf(InviteError);
    expect(JSON.stringify(rows)).toBe(before);
    await expect(svc.accept(db, { inviteId: r.invite.id, token: 'wrong', userId: 6 })).rejects.toMatchObject({ reason: 'not_acceptable' });
  });

  it('AC7 (I5): email variables are exactly org_name, inviter_name, accept_url, expires_at — no role', async () => {
    const { svc, sent } = setup();
    const r = await svc.create(db, CALLER, input());
    await svc.resend(db, CALLER, r.invite.id);
    expect(sent).toHaveLength(2);
    for (const m of sent) {
      expect(Object.keys(m).sort()).toEqual(['to', 'variables']);
      expect(Object.keys(m.variables).sort()).toEqual(['accept_url', 'expires_at', 'inviter_name', 'org_name']);
      expect(JSON.stringify(m)).not.toMatch(/Admin|role/i);
      expect(m.variables.org_name).toBe('Acme');
      expect(m.variables.inviter_name).toBe('Ivy');
    }
    expect(sent[0]!.variables.accept_url).toBe(`https://idp.test/invite/${r.token}`);
    expect(sent[0]!.variables.expires_at).toBe(new Date(T0.getTime() + 7 * DAY).toISOString());
  });

  it('AC8 (I4): no app/brand constants — TTL, link, sender and gate all come from config', async () => {
    expect(() => setup({ ttlDays: undefined as unknown as number })).toThrow(/ttlDays/);
    const { svc, sent } = setup({ ttlDays: 2, acceptUrl: (t) => `https://other.brand/i/${t}`, accessGate: undefined });
    const r = await svc.create(db, CALLER, input());
    expect(r.invite.expiresAt.getTime()).toBe(T0.getTime() + 2 * DAY);
    expect(r.invite.accessCodeId).toBeNull();
    expect(sent[0]!.variables.accept_url.startsWith('https://other.brand/i/')).toBe(true);
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.includes('.test.'))) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/cadra|yobo|mailgun|jetdevs\.(com|ai)/i);
    }
  });

  it('AC9 (P13/P22): accept racing resend or cancel — exactly one wins', async () => {
    const { svc } = setup();
    const r = await svc.create(db, CALLER, input());
    await svc.resend(db, CALLER, r.invite.id);
    await expect(svc.accept(db, { inviteId: r.invite.id, token: r.token, userId: 1 })).rejects.toMatchObject({ reason: 'not_acceptable' });

    const s = setup();
    const x = await s.svc.create(db, CALLER, input());
    await s.svc.accept(db, { inviteId: x.invite.id, token: x.token, userId: 1 });
    await expect(s.svc.cancel(db, CALLER, x.invite.id)).rejects.toMatchObject({ reason: 'not_pending' });
    await expect(s.svc.resend(db, CALLER, x.invite.id)).rejects.toMatchObject({ reason: 'not_pending' });

    const u = setup();
    const y = await u.svc.create(db, CALLER, input());
    u.advance(7 * DAY);
    await expect(u.svc.accept(db, { inviteId: y.invite.id, token: y.token, userId: 1 })).rejects.toMatchObject({ reason: 'not_acceptable' });
  });

  it('AC10 (P21): list/resend/cancel/cancelByEmail are caller-scoped; a foreign id behaves as not found', async () => {
    const { svc, rows } = setup();
    const r = await svc.create(db, CALLER, input());
    expect(await svc.list(db, OTHER, 'org-1')).toEqual([]);
    expect(await svc.list(db, { clientId: 'client-a', sourceSystem: 'src-z' }, 'org-1')).toEqual([]);
    await expect(svc.resend(db, OTHER, r.invite.id)).rejects.toMatchObject({ reason: 'not_found' });
    await expect(svc.cancel(db, OTHER, r.invite.id)).rejects.toMatchObject({ reason: 'not_found' });
    expect(await svc.cancelByEmail(db, OTHER, { sourceOrgRef: 'org-1', email: 'ann@example.com' })).toEqual({ cancelled: 0 });
    await expect(svc.create(db, OTHER, input())).rejects.toMatchObject({ reason: 'conflict' });
    expect(rows[0]!.status).toBe('pending');
    const mine = await svc.list(db, CALLER, 'org-1');
    expect(mine.map((i) => i.id)).toEqual([r.invite.id]);
    expect('tokenHash' in mine[0]!).toBe(false);
    expect(await svc.cancelByEmail(db, CALLER, { sourceOrgRef: 'org-1', email: 'ANN@example.com' })).toEqual({ cancelled: 1 });
    expect(rows[0]!.status).toBe('cancelled');
  });

  it('AC11 (P22): mail failure after commit → emailSent:false, invite stays pending', async () => {
    const { svc, rows } = setup({ sendInviteEmail: async () => { throw new Error('mailgun down'); } });
    const r = await svc.create(db, CALLER, input());
    expect(r.emailSent).toBe(false);
    expect(rows[0]!.status).toBe('pending');
    const again = await svc.resend(db, CALLER, r.invite.id);
    expect(again.emailSent).toBe(false);
    expect(rows[0]!.status).toBe('pending');
  });

  it('P8: access gate — create issues a bound single_use code tagged org-invite:<ref>; cancel revokes; resend reissues', async () => {
    const { svc, codes, accessGate } = setup();
    const r = await svc.create(db, CALLER, input());
    expect(accessGate.createCode).toHaveBeenCalledWith(expect.anything(), {
      kind: 'single_use',
      boundEmail: 'ann@example.com',
      maxUses: 1,
      expiresAt: r.invite.expiresAt,
      tag: 'org-invite:org-1',
    });
    const again = await svc.resend(db, CALLER, r.invite.id);
    expect(codes).toHaveLength(2);
    expect(codes[0]!.revoked).toBe(true);
    expect(again.invite.accessCodeId).toBe(codes[1]!.id);
    expect(codes[1]!.tag).toBe('org-invite:org-1');
    await svc.cancel(db, CALLER, r.invite.id);
    expect(codes[1]!.revoked).toBe(true);
  });

  it('create: an expired open row is retired and a fresh row inserted', async () => {
    const { svc, rows, advance } = setup();
    const a = await svc.create(db, CALLER, input());
    advance(8 * DAY);
    const b = await svc.create(db, CALLER, input());
    expect(b.superseded).toBe(false);
    expect(b.invite.id).not.toBe(a.invite.id);
    expect(rows.map((r) => r.status)).toEqual(['expired', 'pending']);
  });
});

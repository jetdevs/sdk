/**
 * p107 ACC-001 — access module on a REAL local Postgres.
 *
 * Classification: INTEGRATION, no mocks. `openLocalTestDb` refuses any host but
 * localhost. Each run creates a scratch schema holding a minimal `users` table,
 * applies `accessTablesDdl()` TWICE (idempotency), and drives the service.
 * The race tests use separate clients (each `max: 1` → one real connection
 * each), so the row lock is real.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openLocalTestDb, type LocalTestDb } from '../auth/__test-support__/local-test-db';
import { createAccessRouterConfig, RECOMMENDED_ACCESS_PERMISSIONS } from './router-config';
import { accessTablesDdl } from './sql/access-ddl';
import {
  AccessCodeExhaustedError,
  AccessCodeTakenError,
  WaitlistStateError,
  createAccessService,
  hashAccessToken,
} from './service';

const admin = await openLocalTestDb();
const SCHEMA = `p107_acc_${randomBytes(4).toString('hex')}`;
const svc = createAccessService({ app: 'cadra' });

describe.skipIf(!admin)('p107 access module — real local Postgres', () => {
  let h: LocalTestDb;
  const extra: LocalTestDb[] = [];
  let nextUser = 0;
  const USERS = 80;
  const user = () => {
    if (nextUser >= USERS) throw new Error('out of seeded users');
    return ++nextUser;
  };
  const open = async () => {
    const c = (await openLocalTestDb({ searchPath: SCHEMA }))!;
    extra.push(c);
    return c;
  };
  const codeRow = async (id: number) =>
    (await h.client.unsafe(`select uses from access_codes where id = ${id}`))[0] as unknown as { uses: number };
  const redemptionCount = async (id: number) =>
    Number((await h.client.unsafe(`select count(*)::int as n from access_redemptions where code_id = ${id}`))[0]!.n);

  beforeAll(async () => {
    await admin!.client.unsafe(`create schema ${SCHEMA}`);
    h = (await openLocalTestDb({ searchPath: SCHEMA }))!;
    await h.client.unsafe(`create table users (id serial primary key, email varchar(255))`);
    await h.client.unsafe(`insert into users (email) select 'u' || g || '@example.test' from generate_series(1, ${USERS}) g`);
    // Apply twice: the second apply must be a clean no-op.
    await h.client.unsafe(accessTablesDdl()).simple();
    await h.client.unsafe(accessTablesDdl()).simple();
  });

  afterAll(async () => {
    for (const c of extra) await c.close();
    await h?.close();
    await admin!.client.unsafe(`drop schema if exists ${SCHEMA} cascade`);
    await admin!.close();
  });

  it('DDL is idempotent and creates the 4 tables', async () => {
    const rows = await h.client.unsafe(
      `select table_name from information_schema.tables where table_schema = '${SCHEMA}' and table_name <> 'users' order by 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'access_codes',
      'access_redemptions',
      'app_access_settings',
      'waitlist_entries',
    ]);
  });

  // ---- AC 1 ---------------------------------------------------------------
  it('two concurrent redeems on last use: exactly one succeeds', async () => {
    const a = await open();
    const b = await open();

    // Deterministic: A holds its tx open after the UPDATE, B's UPDATE must block.
    const c = await svc.createCode(h.db, { kind: 'campaign', maxUses: 1 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let aUpdated!: () => void;
    const aDone = new Promise<void>((r) => (aUpdated = r));
    const pA = a.db.transaction(async (tx) => {
      await svc.redeem(tx, { codeId: c.id, userId: user(), source: 'link' });
      aUpdated();
      await gate;
    });
    await aDone;
    let bSettled = false;
    const pB = b.db
      .transaction(async (tx) => svc.redeem(tx, { codeId: c.id, userId: user(), source: 'typed' }))
      .finally(() => {
        bSettled = true;
      });
    // Wait until B is really waiting on A's row lock.
    let blocked = false;
    for (let i = 0; i < 100 && !blocked; i++) {
      const rows = await admin!.client.unsafe(
        `select 1 from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%update "access_codes"%' and datname = current_database()`,
      );
      blocked = rows.length > 0;
      if (!blocked) await new Promise((r) => setTimeout(r, 20));
    }
    expect(blocked).toBe(true);
    expect(bSettled).toBe(false);
    release();
    await pA;
    await expect(pB).rejects.toBeInstanceOf(AccessCodeExhaustedError);
    expect((await codeRow(c.id)).uses).toBe(1);
    expect(await redemptionCount(c.id)).toBe(1);

    // 20 more rounds, both started together.
    for (let round = 0; round < 20; round++) {
      const code = await svc.createCode(h.db, { kind: 'single_use', maxUses: 1 });
      const results = await Promise.allSettled([
        a.db.transaction((tx) => svc.redeem(tx, { codeId: code.id, userId: 1, source: 'link' })),
        b.db.transaction((tx) => svc.redeem(tx, { codeId: code.id, userId: 2, source: 'link' })),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.reason).toBeInstanceOf(AccessCodeExhaustedError);
      expect((await codeRow(code.id)).uses).toBe(1);
      expect(await redemptionCount(code.id)).toBe(1);
    }
  });

  it('20-way race on a code with 5 uses: exactly 5 succeed', async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, () => open()));
    const code = await svc.createCode(h.db, { kind: 'campaign', maxUses: 5 });
    const userIds = clients.map(() => user());
    const results = await Promise.allSettled(
      clients.map((c, i) =>
        c.db.transaction((tx) => svc.redeem(tx, { codeId: code.id, userId: userIds[i]!, source: 'link' })),
      ),
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(failed).toHaveLength(15);
    for (const f of failed) expect(f.reason).toBeInstanceOf(AccessCodeExhaustedError);
    expect((await codeRow(code.id)).uses).toBe(5);
    expect(await redemptionCount(code.id)).toBe(5);
  });

  // ---- AC 2 ---------------------------------------------------------------
  it('expired and revoked fail with distinct reasons', async () => {
    const expired = await svc.createCode(h.db, { kind: 'campaign', expiresAt: new Date(Date.now() - 60_000) });
    const revoked = await svc.createCode(h.db, { kind: 'campaign' });
    expect((await svc.validate(h.db, { code: revoked.code })).ok).toBe(true);
    await svc.revokeCode(h.db, revoked.id);

    const e = await svc.validate(h.db, { code: expired.code });
    const r = await svc.validate(h.db, { code: revoked.code });
    expect(e).toMatchObject({ ok: false, reason: 'expired' });
    expect(r).toMatchObject({ ok: false, reason: 'revoked' });
    expect(await svc.validate(h.db, { code: 'NOPE-NOPE' })).toEqual({ ok: false, reason: 'not_found' });

    // The lock-time UPDATE refuses them too.
    for (const c of [expired, revoked]) {
      await expect(
        h.db.transaction((tx) => svc.redeem(tx, { codeId: c.id, userId: user(), source: 'typed' })),
      ).rejects.toBeInstanceOf(AccessCodeExhaustedError);
    }
  });

  // ---- AC 3 ---------------------------------------------------------------
  it('codes match case-insensitively', async () => {
    const c = await svc.createCode(h.db, { code: ' Spring-Launch ', kind: 'campaign' });
    expect(c.code).toBe('SPRING-LAUNCH');
    for (const typed of ['spring-launch', 'SPRING-LAUNCH', '  sPrInG-lAuNcH ']) {
      const v = await svc.validate(h.db, { code: typed });
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.code.id).toBe(c.id);
    }
    await expect(svc.createCode(h.db, { code: 'spring-launch', kind: 'campaign' })).rejects.toBeInstanceOf(
      AccessCodeTakenError,
    );
    // The unique index is on upper(code): a raw lower-case insert collides too.
    await expect(
      h.client.unsafe(`insert into access_codes (code, kind, app) values ('spring-launch', 'campaign', 'cadra')`),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('personal code: issued once at the default cap; 10 redeems OK, 11th exhausted; raised cap admits it', async () => {
    const owner = user();
    const p = await svc.getOrIssuePersonalCode(h.db, owner);
    expect(p).toMatchObject({ kind: 'personal', ownerUserId: owner, maxUses: 10, grantsAccess: true });
    expect((await svc.getOrIssuePersonalCode(h.db, owner)).id).toBe(p.id);

    for (let i = 0; i < 10; i++) {
      await h.db.transaction((tx) => svc.redeem(tx, { codeId: p.id, userId: user(), source: 'link' }));
    }
    const eleventh = user();
    await expect(
      h.db.transaction((tx) => svc.redeem(tx, { codeId: p.id, userId: eleventh, source: 'link' })),
    ).rejects.toBeInstanceOf(AccessCodeExhaustedError);
    expect(await svc.validate(h.db, { code: p.code })).toMatchObject({ ok: false, reason: 'exhausted' });

    await svc.setCodeMaxUses(h.db, p.id, 11);
    await h.db.transaction((tx) => svc.redeem(tx, { codeId: p.id, userId: eleventh, source: 'link' }));
    expect((await codeRow(p.id)).uses).toBe(11);
  });

  it('settings: missing row → off; update persists; decide matrix on real rows', async () => {
    const other = createAccessService({ app: 'yobo' });
    expect(await other.getAppSettings(h.db)).toMatchObject({ mode: 'off', exists: false, personalCodeDefaultCap: 10 });
    expect(await other.decide(h.db, { emailVerified: true, email: 'x@example.test' })).toMatchObject({ allow: true, via: 'off' });

    await svc.updateAppSettings(h.db, { mode: 'required', copy: { waitlistConfirmation: 'Thanks' } }, 1);
    expect(await svc.getAppSettings(h.db)).toMatchObject({ mode: 'required', exists: true, copy: { waitlistConfirmation: 'Thanks' } });

    expect(await svc.decide(h.db, { emailVerified: true, email: 'new@example.test' })).toEqual({
      allow: false,
      mode: 'required',
      reason: 'code_required',
    });
    const granting = await svc.createCode(h.db, { kind: 'campaign' });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'new@example.test', code: granting.code.toLowerCase() })).toMatchObject({
      allow: true,
      via: 'code',
      codeId: granting.id,
    });
    const attributionOnly = await svc.createCode(h.db, { kind: 'campaign', grantsAccess: false });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'new@example.test', code: attributionOnly.code })).toMatchObject({
      allow: false,
      reason: 'no_access',
    });

    // (c) org invite: single_use code bound to the email, matched without being typed.
    const invite = await svc.createCode(h.db, { kind: 'single_use', maxUses: 1, boundEmail: 'Invitee@Example.test' });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'invitee@example.test' })).toMatchObject({
      allow: true,
      via: 'bound_invite',
      codeId: invite.id,
    });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'someone@example.test', code: invite.code })).toMatchObject({
      allow: false,
      reason: 'wrong_email',
    });

    await svc.updateAppSettings(h.db, { mode: 'optional' });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'new@example.test', code: attributionOnly.code })).toMatchObject({
      allow: true,
      via: 'code',
      codeId: attributionOnly.id,
    });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'new@example.test' })).toMatchObject({ allow: true, via: 'no_code' });
    await svc.updateAppSettings(h.db, { mode: 'off' });
  });

  it('waitlist: dedupe pending, hash-only token, resend rotates, consumed once', async () => {
    const first = await svc.submit(h.db, { email: 'Applicant@Example.test', answers: { useCase: 'agents' } });
    expect(first).toMatchObject({ created: true, entry: { state: 'pending', email: 'applicant@example.test' } });
    const dup = await svc.submit(h.db, { email: 'applicant@example.test', answers: {} });
    expect(dup).toMatchObject({ created: false, entry: { id: first.entry.id, answers: { useCase: 'agents' } } });

    const { entry, token, expiresAt } = await svc.approve(h.db, first.entry.id, 1);
    expect(entry.state).toBe('approved');
    expect(entry.accessTokenHash).toBe(hashAccessToken(token));
    expect(JSON.stringify(await h.client.unsafe(`select * from waitlist_entries where id = ${entry.id}`))).not.toContain(token);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    await expect(svc.approve(h.db, entry.id)).rejects.toBeInstanceOf(WaitlistStateError);

    const re = await svc.resend(h.db, entry.id);
    expect(re.token).not.toBe(token);
    expect(re.entry.resendHistory).toHaveLength(1);
    expect(re.entry.resendHistory[0]!.hash).toBe(hashAccessToken(token).slice(0, 12));
    expect(await svc.findApprovedWaitlistEntry(h.db, { token })).toBeNull();
    expect((await svc.findApprovedWaitlistEntry(h.db, { token: re.token }))?.id).toBe(entry.id);

    await svc.updateAppSettings(h.db, { mode: 'required' });
    // The link grant works for any email; an approved entry also matches by its own email.
    expect(await svc.decide(h.db, { emailVerified: true, email: 'other@example.test', waitlistToken: re.token })).toMatchObject({
      allow: true,
      via: 'waitlist',
      waitlistEntryId: entry.id,
    });
    expect(await svc.decide(h.db, { emailVerified: true, email: 'APPLICANT@example.test' })).toMatchObject({ via: 'waitlist' });

    const signer = user();
    await h.db.transaction((tx) => svc.consumeForSignup(tx, entry.id, signer));
    expect(await svc.getWaitlistEntry(h.db, entry.id)).toMatchObject({ state: 'signed_up', userId: signer });
    await expect(h.db.transaction((tx) => svc.consumeForSignup(tx, entry.id, user()))).rejects.toBeInstanceOf(
      WaitlistStateError,
    );
    expect(await svc.decide(h.db, { emailVerified: true, email: 'other@example.test', waitlistToken: re.token })).toMatchObject({
      allow: false,
      reason: 'code_required',
    });

    // Expired link no longer grants.
    const late = await svc.submit(h.db, { email: 'late@example.test', answers: {} });
    const appr = await svc.approve(h.db, late.entry.id);
    await h.client.unsafe(`update waitlist_entries set expires_at = now() - interval '1 minute' where id = ${late.entry.id}`);
    expect(await svc.findApprovedWaitlistEntry(h.db, { token: appr.token })).toBeNull();

    const rej = await svc.submit(h.db, { email: 'no@example.test', answers: {} });
    expect((await svc.reject(h.db, rej.entry.id, 1)).state).toBe('rejected');
    expect((await svc.listWaitlist(h.db, { state: 'rejected' })).map((e) => e.id)).toContain(rej.entry.id);
    await svc.updateAppSettings(h.db, { mode: 'off' });
  });

  // ---- review P1-a: email-only grants need a verified email ------------------
  it('unverified email: approved waitlist entry matched by email is refused; verified is allowed', async () => {
    await svc.updateAppSettings(h.db, { mode: 'required' });
    const sub = await svc.submit(h.db, { email: 'squat-target@example.test', answers: {} });
    const { token } = await svc.approve(h.db, sub.entry.id, 1);

    // Connect password register: anyone can type this address — no grant.
    expect(await svc.decide(h.db, { email: 'squat-target@example.test', emailVerified: false })).toEqual({
      allow: false,
      mode: 'required',
      reason: 'code_required',
    });
    // Same entry, verified email (Google) → allowed.
    expect(await svc.decide(h.db, { email: 'squat-target@example.test', emailVerified: true })).toMatchObject({
      allow: true,
      via: 'waitlist',
      waitlistEntryId: sub.entry.id,
    });
    // The link itself is the grant: token works without a verified email.
    expect(
      await svc.decide(h.db, { email: 'squat-target@example.test', emailVerified: false, waitlistToken: token }),
    ).toMatchObject({ allow: true, via: 'waitlist', waitlistEntryId: sub.entry.id });
    // A JS caller that omits the flag gets the safe answer.
    expect(
      await svc.decide(h.db, { email: 'squat-target@example.test' } as unknown as Parameters<typeof svc.decide>[1]),
    ).toMatchObject({ allow: false, reason: 'code_required' });
    await svc.updateAppSettings(h.db, { mode: 'off' });
  });

  it('unverified email: a bound code is refused, implicit or typed; verified is allowed', async () => {
    await svc.updateAppSettings(h.db, { mode: 'required' });
    const invite = await svc.createCode(h.db, { kind: 'single_use', maxUses: 1, boundEmail: 'bound@example.test' });

    // (c) implicit bound invite: not matched for an unverified email.
    expect(await svc.decide(h.db, { email: 'bound@example.test', emailVerified: false })).toEqual({
      allow: false,
      mode: 'required',
      reason: 'code_required',
    });
    // (a) typed bound code: a password signup cannot use it.
    expect(
      await svc.decide(h.db, { email: 'bound@example.test', emailVerified: false, code: invite.code }),
    ).toEqual({ allow: false, mode: 'required', reason: 'email_unverified' });
    // A non-bound granting code still works for an unverified email.
    const open = await svc.createCode(h.db, { kind: 'campaign' });
    expect(
      await svc.decide(h.db, { email: 'bound@example.test', emailVerified: false, code: open.code }),
    ).toMatchObject({ allow: true, via: 'code', codeId: open.id });

    // Verified: both paths admit.
    expect(await svc.decide(h.db, { email: 'bound@example.test', emailVerified: true })).toMatchObject({
      allow: true,
      via: 'bound_invite',
      codeId: invite.id,
    });
    expect(
      await svc.decide(h.db, { email: 'bound@example.test', emailVerified: true, code: invite.code }),
    ).toMatchObject({ allow: true, via: 'code', codeId: invite.id });
    await svc.updateAppSettings(h.db, { mode: 'off' });
  });

  // ---- review P1-b: access admin is platform staff only ----------------------
  it('admin router refuses a non-system actor on every procedure; a system user gets through', async () => {
    const sent: string[] = [];
    const cfg = createAccessRouterConfig({
      service: svc,
      permissions: RECOMMENDED_ACCESS_PERMISSIONS,
      accessLink: (t) => `https://connect.test/waitlist/access?token=${t}`,
      sendAccessLink: async ({ to }) => {
        sent.push(to);
      },
      getDb: () => h.db,
    });
    const code = await svc.createCode(h.db, { kind: 'campaign', maxUses: 3 });
    const entry = (await svc.submit(h.db, { email: 'router-case@example.test', answers: {} })).entry;
    const before = await h.client.unsafe(
      `select (select count(*) from access_codes)::int as c, (select count(*) from waitlist_entries where state <> 'pending')::int as w, (select count(*) from app_access_settings)::int as s, (select max(updated_at) from access_codes) as u`,
    );

    const inputs: Record<string, Record<string, unknown>> = {
      'codes.list': { limit: 100, offset: 0 },
      'codes.create': { kind: 'campaign', grantsAccess: true },
      'codes.revoke': { id: code.id },
      'codes.setMaxUses': { id: code.id, maxUses: 99 },
      'waitlist.list': { limit: 100, offset: 0 },
      'waitlist.approve': { id: entry.id },
      'waitlist.reject': { id: entry.id },
      'waitlist.resend': { id: entry.id },
      'settings.get': {},
      'settings.update': { mode: 'required' },
    };
    const groups = cfg as unknown as Record<string, Record<string, { handler: (ctx: unknown) => Promise<unknown> }>>;
    const routeNames = Object.entries(groups).flatMap(([g, routes]) => Object.keys(routes).map((r) => `${g}.${r}`));
    expect(routeNames.sort()).toEqual(Object.keys(inputs).sort());

    // An org Owner/Admin holding every slug (global template) — still not platform staff.
    const orgAdmin = { userId: 7, orgId: 1, isSystemUser: false, permissions: Object.values(RECOMMENDED_ACCESS_PERMISSIONS) };
    for (const name of routeNames) {
      const [g, r] = name.split('.') as [string, string];
      for (const actor of [orgAdmin, undefined]) {
        await expect(
          groups[g]![r]!.handler({ input: inputs[name], actor, service: { userId: '7' }, db: h.db }),
          name,
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
    }
    const after = await h.client.unsafe(
      `select (select count(*) from access_codes)::int as c, (select count(*) from waitlist_entries where state <> 'pending')::int as w, (select count(*) from app_access_settings)::int as s, (select max(updated_at) from access_codes) as u`,
    );
    expect(after).toEqual(before);
    expect(sent).toEqual([]);

    // Platform staff: real writes.
    const staff = { userId: 1, orgId: 1, isSystemUser: true };
    const created = (await groups.codes!.create!.handler({
      input: inputs['codes.create'],
      actor: staff,
      service: { userId: '1' },
      db: h.db,
    })) as { id: number; createdBy: number | null };
    expect(created.createdBy).toBe(1);
    expect(await svc.getCode(h.db, created.id)).not.toBeNull();
    await groups.waitlist!.approve!.handler({ input: { id: entry.id }, actor: staff, service: { userId: '1' }, db: h.db });
    expect(sent).toEqual(['router-case@example.test']);
  });
});

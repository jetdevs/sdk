/**
 * p131 INV-001 — invites on a REAL local Postgres (self-skips without one;
 * `openLocalTestDb` refuses any host but localhost). Scratch schema with
 * minimal orgs/users/org_members; DDL applied twice (idempotency).
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openLocalTestDb, type LocalTestDb } from '../auth/__test-support__/local-test-db';
import { createInviteService } from './service';
import { inviteTablesDdl, usersEmailVerifiedAtDdl } from './sql/invites-ddl';
import type { InviteDb } from './store';

const admin = await openLocalTestDb();
const SCHEMA = `p131_inv_${randomBytes(4).toString('hex')}`;
const CALLER = { clientId: 'client-a', sourceSystem: 'src-a' };

describe.skipIf(!admin)('p131 invites — real local Postgres', () => {
  let h: LocalTestDb;
  const extra: LocalTestDb[] = [];
  const svc = createInviteService({
    ttlDays: 7,
    acceptUrl: (t) => `https://idp.test/invite/${t}`,
    resolveOrg: async () => ({ orgId: 1, orgName: 'Acme' }),
    describeOrg: async () => ({ sourceOrgRef: 'org-1', orgName: 'Acme' }),
    sendInviteEmail: async () => {},
  });
  const input = { sourceOrgRef: 'org-1', orgName: 'Acme', roleRef: '7', roleName: 'Admin', invitedBySub: 's', appUrl: 'https://app.test/' };
  const count = async (t: string) => Number((await h.client.unsafe(`select count(*)::int n from ${t}`))[0]!.n);

  beforeAll(async () => {
    await admin!.client.unsafe(`create schema ${SCHEMA}`);
    h = (await openLocalTestDb({ searchPath: SCHEMA }))!;
    await h.client.unsafe(
      `create table orgs (id serial primary key, name text); create table users (id serial primary key, email text);
       create table org_members (id serial primary key, org_id int, user_id int);
       insert into orgs (name) values ('Acme'); insert into users (email) select 'u'||g||'@x.test' from generate_series(1,5) g;`,
    ).simple();
    for (let i = 0; i < 2; i++) {
      await h.client.unsafe(inviteTablesDdl()).simple();
      await h.client.unsafe(usersEmailVerifiedAtDdl()).simple();
    }
  });

  afterAll(async () => {
    for (const c of extra) await c.close();
    await h?.close();
    await admin!.client.unsafe(`drop schema if exists ${SCHEMA} cascade`);
    await admin!.close();
  });

  it('AC1: create writes only org_invites — no users / org_members rows', async () => {
    const users = await count('users');
    await svc.create(h.db as unknown as InviteDb, CALLER, { ...input, email: 'only@x.io' });
    expect(await count('users')).toBe(users);
    expect(await count('org_members')).toBe(0);
    expect(await count(`org_invites where email = 'only@x.io'`)).toBe(1);
  });

  it('AC4 (P22): second create supersedes — same id, role updated, one pending row', async () => {
    const a = await svc.create(h.db as unknown as InviteDb, CALLER, { ...input, email: 'dup@x.io' });
    const b = await svc.create(h.db as unknown as InviteDb, CALLER, { ...input, email: 'DUP@x.io', roleRef: '9' });
    expect(b.invite.id).toBe(a.invite.id);
    expect(b.invite.roleRef).toBe('9');
    expect(b.token).not.toBe(a.token);
    expect(await count(`org_invites where email = 'dup@x.io' and status = 'pending'`)).toBe(1);
  });

  it('AC9 (P13): concurrent accept vs cancel on separate connections — exactly one wins', async () => {
    const r = await svc.create(h.db as unknown as InviteDb, CALLER, { ...input, email: 'race@x.io' });
    const c1 = (await openLocalTestDb({ searchPath: SCHEMA }))!;
    const c2 = (await openLocalTestDb({ searchPath: SCHEMA }))!;
    extra.push(c1, c2);
    const out = await Promise.allSettled([
      svc.accept(c1.db as unknown as InviteDb, { inviteId: r.invite.id, token: r.token, userId: 1, email: 'race@x.io' }),
      svc.cancel(c2.db as unknown as InviteDb, CALLER, r.invite.id, 'org-1'),
    ]);
    expect(out.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const again = await Promise.allSettled([
      svc.accept(c1.db as unknown as InviteDb, { inviteId: r.invite.id, token: r.token, userId: 2, email: 'race@x.io' }),
    ]);
    expect(again[0]!.status).toBe('rejected');
  });

  it('P1-A: accept WHERE binds the invited email — wrong email is 0 rows, invite stays pending; case-insensitive match accepts', async () => {
    const db = h.db as unknown as InviteDb;
    const r = await svc.create(db, CALLER, { ...input, email: 'bound@x.io' });
    await expect(svc.accept(db, { inviteId: r.invite.id, token: r.token, userId: 3, email: 'other@x.io' })).rejects.toMatchObject({
      reason: 'not_acceptable',
    });
    expect(await count(`org_invites where id = ${r.invite.id} and status = 'pending' and accepted_user_id is null`)).toBe(1);
    const ok = await svc.accept(db, { inviteId: r.invite.id, token: r.token, userId: 3, email: ' BOUND@X.io ' });
    expect(ok.status).toBe('accepted');
  });
});

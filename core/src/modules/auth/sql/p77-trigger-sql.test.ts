/**
 * p77 STORY-002 — the trigger SQL templates, applied to a scratch `users`
 * table on the REAL local Postgres (specs.md §3.3 M2/M3/M6, §6.2).
 *
 * Classification: INTEGRATION, real local Postgres (`__test-support__/local-test-db.ts`,
 * localhost only), no mocks. Each run creates a scratch schema holding
 * `users` (the p79 column set) and `password_reset_tokens`, applies the three
 * templates TWICE (idempotency), and drives raw SQL at the triggers — raw SQL
 * is the writer these triggers exist for.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openLocalTestDb, type LocalTestDb } from '../__test-support__/local-test-db';
import { CREDENTIAL_AUTHORITY, canTransition, type CredentialAuthority } from '../credential-authority';
import {
  AUTHORITY_ROLLBACK_ERROR_PREFIX,
  AUTHORITY_TRANSITION_ERROR_PREFIX,
  ONE_ALLOCATOR_ERROR_PREFIX,
  ONE_ALLOCATOR_GUC,
  WRITERS_CLOSED_ERROR_PREFIX,
  credentialVersionBumpTriggerSql,
  oneAllocatorGucSql,
  oneAllocatorTriggerSql,
  writersClosedTriggerSql,
} from './index';
import * as authBarrel from '../index';

// ---------------------------------------------------------------------------
// Pure: the text itself.
// ---------------------------------------------------------------------------

describe('p77 trigger SQL templates — text', () => {
  it('for `users` the function and trigger names are exactly the p79 names', () => {
    const sql = writersClosedTriggerSql('users') + credentialVersionBumpTriggerSql('users');
    for (const name of [
      '"users_refuse_local_verifier_when_closed"',
      '"users_refuse_local_verifier_when_closed_trg"',
      '"users_invalidate_reset_tokens_at_flip"',
      '"users_invalidate_reset_tokens_at_flip_trg"',
      '"users_refuse_authority_rollback"',
      '"users_refuse_authority_rollback_trg"',
      '"users_bump_credential_version_on_password_change"',
      '"users_bump_credential_version_trg"',
    ]) {
      expect(sql).toContain(name);
    }
    expect(oneAllocatorTriggerSql()).toContain('"users_one_allocator_trg"');
  });

  it('keeps the p79 error texts verbatim', () => {
    const sql = writersClosedTriggerSql('users');
    expect(sql).toContain(
      "'local credential write refused for user %: credential_authority is % (was %) — the password is not cadra-web''s to write (p79 §9/§14)'",
    );
    expect(sql).toContain(
      "'credential_authority rollback refused for user %: connect → % — an activated identity never rolls back (p79 D8)'",
    );
  });

  it('is idempotent in shape: every trigger is dropped-if-exists before it is created, every function replaced', () => {
    for (const sql of [writersClosedTriggerSql('users'), oneAllocatorTriggerSql(), credentialVersionBumpTriggerSql('users')]) {
      const creates = sql.match(/CREATE TRIGGER "([a-z0-9_]+)"/g) ?? [];
      expect(creates.length).toBeGreaterThan(0);
      for (const create of creates) {
        const name = create.replace('CREATE TRIGGER ', '');
        expect(sql).toContain(`DROP TRIGGER IF EXISTS ${name}`);
      }
      expect(sql).not.toMatch(/CREATE FUNCTION/);
    }
  });

  it('refuses a table name that is not a plain identifier, or whose derived names Postgres would truncate', () => {
    expect(() => writersClosedTriggerSql('users; drop table x')).toThrow(/not a plain lower-case identifier/);
    expect(() => oneAllocatorTriggerSql('Users')).toThrow(/not a plain lower-case identifier/);
    expect(() => credentialVersionBumpTriggerSql('public.users')).toThrow(/not a plain lower-case identifier/);
    expect(() => credentialVersionBumpTriggerSql('a'.repeat(30))).toThrow(/exceeds 63 bytes/);
    expect(() => writersClosedTriggerSql('users', { resetTokensTable: 'x"y' })).toThrow(/not a plain/);
  });

  it('the GUC helper sets p77.connect_enabled at transaction scope by default', () => {
    expect(ONE_ALLOCATOR_GUC).toBe('p77.connect_enabled');
    expect(oneAllocatorGucSql(true)).toBe("SELECT set_config('p77.connect_enabled', 'on', true)");
    expect(oneAllocatorGucSql(false, { scope: 'session' })).toBe("SELECT set_config('p77.connect_enabled', 'off', false)");
  });

  it('is importable from the auth barrel (@jetdevs/core/auth)', () => {
    expect(authBarrel.writersClosedTriggerSql).toBe(writersClosedTriggerSql);
    expect(authBarrel.oneAllocatorTriggerSql).toBe(oneAllocatorTriggerSql);
    expect(authBarrel.credentialVersionBumpTriggerSql).toBe(credentialVersionBumpTriggerSql);
    expect(authBarrel.ONE_ALLOCATOR_GUC).toBe(ONE_ALLOCATOR_GUC);
  });
});

// ---------------------------------------------------------------------------
// Integration: the triggers on a real database.
// ---------------------------------------------------------------------------

const admin = await openLocalTestDb();
const SCHEMA = `p77_trg_${randomBytes(4).toString('hex')}`;

interface Refusal {
  code: string;
  message: string;
}

/** Run `fn`; resolve the Postgres error it raised, or null when it succeeded. */
async function refusalOf(fn: () => Promise<unknown>): Promise<Refusal | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (!e.code) throw error;
    return { code: e.code, message: e.message ?? '' };
  }
}

describe.skipIf(!admin)('p77 trigger SQL templates — real local Postgres', () => {
  let h: LocalTestDb;
  let n = 0;
  const email = () => `u${++n}-${SCHEMA}@example.test`;

  beforeAll(async () => {
    await admin!.client.unsafe(`create schema ${SCHEMA}`);
    h = (await openLocalTestDb({ searchPath: SCHEMA }))!;
    // The p79 users column set the triggers reference (core db/schema/orgs.ts + p79 0011/0125).
    await h.client.unsafe(`
      create table users (
        id serial primary key,
        email varchar(255) not null,
        password text,
        credential_authority varchar(16) not null default 'local',
        credential_version integer not null default 1,
        connect_issuer varchar(255),
        connect_sub varchar(64),
        updated_at timestamptz not null default now()
      );
      create table password_reset_tokens (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        token varchar(255) not null,
        used_at timestamptz
      );
    `).simple();
    // Apply every template twice: the second apply must be a clean no-op.
    for (let i = 0; i < 2; i++) {
      await h.client.unsafe(writersClosedTriggerSql('users')).simple();
      await h.client.unsafe(oneAllocatorTriggerSql('users')).simple();
      await h.client.unsafe(credentialVersionBumpTriggerSql('users')).simple();
    }
  });

  afterAll(async () => {
    await h?.close();
    await admin!.client.unsafe(`drop schema if exists ${SCHEMA} cascade`);
    await admin!.close();
  });

  async function insertUser(
    authority: CredentialAuthority,
    fields: { password?: string | null; connectSub?: string | null } = {},
  ): Promise<number> {
    const [row] = await h.client`
      insert into users (email, password, credential_authority, connect_sub, connect_issuer)
      values (${email()}, ${fields.password ?? null}, ${authority}, ${fields.connectSub ?? null},
              ${fields.connectSub ? 'https://auth.test' : null})
      returning id`;
    return row!.id as number;
  }

  async function readUser(id: number) {
    const [row] = await h.client`
      select password, credential_authority, credential_version from users where id = ${id}`;
    return row as { password: string | null; credential_authority: string; credential_version: number };
  }

  /** A local row with a verifier walked the legal way to `target` (local → prepared → fenced). */
  async function walkedUser(target: 'local' | 'prepared' | 'fenced', password = 'h-original'): Promise<number> {
    const id = await insertUser('local', { password });
    if (target === 'local') return id;
    await h.client`update users set credential_authority = 'prepared' where id = ${id}`;
    if (target === 'prepared') return id;
    await h.client`update users set credential_authority = 'fenced' where id = ${id}`;
    return id;
  }

  it('the triggers exist exactly once each after two applies', async () => {
    const rows = await h.client`
      select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = ${SCHEMA} and not t.tgisinternal order by tgname`;
    expect(rows.map((r) => r.tgname)).toEqual([
      'users_bump_credential_version_trg',
      'users_invalidate_reset_tokens_at_flip_trg',
      'users_one_allocator_trg',
      'users_refuse_authority_rollback_trg',
      'users_refuse_local_verifier_when_closed_trg',
    ]);
  });

  // --- AC1: writers closed --------------------------------------------------

  describe('M2 writers closed', () => {
    it('AC1: a fenced row — any SQL setting users.password is refused with the p79 error text', async () => {
      const id = await walkedUser('fenced');
      const refusal = await refusalOf(() => h.client`update users set password = 'h-new' where id = ${id}`);
      expect(refusal).toEqual({
        code: '23000',
        message: `local credential write refused for user ${id}: credential_authority is fenced (was fenced) — the password is not cadra-web's to write (p79 §9/§14)`,
      });
      expect((await readUser(id)).password).toBe('h-original');
    });

    it('a connect row — a password write is refused', async () => {
      const id = await insertUser('connect', { connectSub: 's-1' });
      const refusal = await refusalOf(() => h.client`update users set password = 'h-new' where id = ${id}`);
      expect(refusal?.code).toBe('23000');
      expect(refusal?.message).toBe(
        `local credential write refused for user ${id}: credential_authority is connect (was connect) — the password is not cadra-web's to write (p79 §9/§14)`,
      );
    });

    it('INSERT of a fenced/connect row carrying a password is refused', async () => {
      for (const authority of ['fenced', 'connect'] as const) {
        const refusal = await refusalOf(() => insertUser(authority, { password: 'h', connectSub: 's-ins' }));
        expect(refusal?.code).toBe('23000');
        expect(refusal?.message.startsWith(WRITERS_CLOSED_ERROR_PREFIX)).toBe(true);
        expect(refusal?.message).toContain(`credential_authority is ${authority} (was (new))`);
      }
    });

    it('0128: the one-statement bypass (leave the closed state AND write a password) is refused', async () => {
      const fenced = await walkedUser('fenced');
      const r1 = await refusalOf(
        () => h.client`update users set credential_authority = 'local', password = 'h-new' where id = ${fenced}`,
      );
      expect(r1?.message).toBe(
        `local credential write refused for user ${fenced}: credential_authority is local (was fenced) — the password is not cadra-web's to write (p79 §9/§14)`,
      );
      const connect = await insertUser('connect', { connectSub: 's-2' });
      const r2 = await refusalOf(
        () => h.client`update users set credential_authority = 'local', password = 'h-new' where id = ${connect}`,
      );
      expect(r2?.code).toBe('23000');
      expect((await readUser(connect)).credential_authority).toBe('connect');
    });

    it('NULLing the verifier on a closed row is allowed; a non-password update on a connect row is untouched', async () => {
      const fenced = await walkedUser('fenced');
      await h.client`update users set password = null where id = ${fenced}`;
      expect((await readUser(fenced)).password).toBeNull();
      const connect = await insertUser('connect', { connectSub: 's-3' });
      await h.client`update users set email = ${email()} where id = ${connect}`;
    });

    it('local and prepared rows still take password writes', async () => {
      for (const target of ['local', 'prepared'] as const) {
        const id = await walkedUser(target);
        await h.client`update users set password = 'h-changed' where id = ${id}`;
        expect((await readUser(id)).password).toBe('h-changed');
      }
    });

    it('the fence deletes the row’s unconsumed reset tokens — and only those', async () => {
      const id = await walkedUser('prepared');
      const other = await walkedUser('local');
      await h.client`
        insert into password_reset_tokens (user_id, token, used_at) values
          (${id}, 'unused-1', null), (${id}, 'unused-2', null), (${id}, 'used', now()), (${other}, 'other-unused', null)`;
      // prepared is not a fence: nothing deleted yet.
      expect((await h.client`select token from password_reset_tokens where user_id = ${id} order by token`).map((r) => r.token))
        .toEqual(['unused-1', 'unused-2', 'used']);

      await h.client`update users set credential_authority = 'fenced' where id = ${id}`;

      expect((await h.client`select token from password_reset_tokens where user_id = ${id}`).map((r) => r.token)).toEqual(['used']);
      expect((await h.client`select token from password_reset_tokens where user_id = ${other}`).map((r) => r.token)).toEqual([
        'other-unused',
      ]);
    });

    it('the Connect-born bind (local → connect, no verifier) also deletes unconsumed tokens', async () => {
      const id = await insertUser('local');
      await h.client`insert into password_reset_tokens (user_id, token) values (${id}, 'stale')`;
      await h.client`
        update users set connect_issuer = 'https://auth.test', connect_sub = 's-bind', credential_authority = 'connect'
        where id = ${id}`;
      expect(await h.client`select 1 from password_reset_tokens where user_id = ${id}`).toHaveLength(0);
    });
  });

  // --- AC2: authority rollback / §6.2 ---------------------------------------

  describe('M2 authority moves only along §6.2', () => {
    it('AC2: a connect row set back to local is refused with the p79 D8 text', async () => {
      const id = await insertUser('connect', { connectSub: 's-4' });
      const refusal = await refusalOf(() => h.client`update users set credential_authority = 'local' where id = ${id}`);
      expect(refusal).toEqual({
        code: '23000',
        message: `credential_authority rollback refused for user ${id}: connect → local — an activated identity never rolls back (p79 D8)`,
      });
      expect((await readUser(id)).credential_authority).toBe('connect');
    });

    it('fenced → prepared is refused with the p77 transition text', async () => {
      const id = await walkedUser('fenced');
      const refusal = await refusalOf(() => h.client`update users set credential_authority = 'prepared' where id = ${id}`);
      expect(refusal).toEqual({
        code: '23000',
        message: `credential_authority transition refused for user ${id}: fenced → prepared — not a p77 §6.2 transition`,
      });
    });

    it('one table, two enforcers: the trigger agrees with canTransition on all 16 ordered pairs', async () => {
      const disagreements: string[] = [];
      for (const from of CREDENTIAL_AUTHORITY) {
        for (const to of CREDENTIAL_AUTHORITY) {
          // No verifier, no binding: neither writers-closed nor the birth rule is in play.
          const id = await insertUser(from);
          const refusal = await refusalOf(
            () => h.client`update users set credential_authority = ${to} where id = ${id}`,
          );
          const accepted = refusal === null;
          if (refusal) {
            expect(refusal.code).toBe('23000');
            expect(
              refusal.message.startsWith(from === 'connect' ? AUTHORITY_ROLLBACK_ERROR_PREFIX : AUTHORITY_TRANSITION_ERROR_PREFIX),
            ).toBe(true);
          }
          // Writing the same value is not a transition: canTransition says no move, the trigger lets the no-op through.
          const expected = from === to ? true : canTransition(from, to);
          if (accepted !== expected) disagreements.push(`${from} → ${to}: trigger ${accepted}, canTransition ${expected}`);
          expect((await readUser(id)).credential_authority).toBe(accepted ? to : from);
        }
      }
      expect(disagreements).toEqual([]);
    });

    it('D9/M1b birth rule: only a verifier-less, Connect-bound local row may go straight to connect', async () => {
      const bound = await insertUser('local', { connectSub: 's-born' });
      await h.client`update users set credential_authority = 'connect' where id = ${bound}`;
      expect((await readUser(bound)).credential_authority).toBe('connect');

      const withVerifier = await insertUser('local', { password: 'h', connectSub: 's-has-pw' });
      const r1 = await refusalOf(() => h.client`update users set credential_authority = 'connect' where id = ${withVerifier}`);
      expect(r1?.message).toBe(
        `credential_authority transition refused for user ${withVerifier}: local → connect — not a p77 §6.2 transition`,
      );

      const unbound = await insertUser('local');
      const r2 = await refusalOf(() => h.client`update users set credential_authority = 'connect' where id = ${unbound}`);
      expect(r2?.message.startsWith(AUTHORITY_TRANSITION_ERROR_PREFIX)).toBe(true);

      // Dropping the verifier in the same statement does not qualify: OLD carried one, so it must be handed off.
      const r3 = await refusalOf(
        () => h.client`update users set credential_authority = 'connect', password = null where id = ${withVerifier}`,
      );
      expect(r3?.message.startsWith(AUTHORITY_TRANSITION_ERROR_PREFIX)).toBe(true);
    });

    it('the full handoff walk local → prepared → fenced → connect (flip) passes every trigger', async () => {
      const id = await walkedUser('fenced');
      await h.client`
        update users set credential_authority = 'connect', password = null, credential_version = 9 where id = ${id}`;
      expect(await readUser(id)).toEqual({ password: null, credential_authority: 'connect', credential_version: 9 });
    });
  });

  // --- AC4: one allocator ----------------------------------------------------

  describe('M3 one allocator', () => {
    const insertWithGuc = (value: string | null, password: string | null) =>
      h.client.begin(async (sql) => {
        if (value !== null) await sql.unsafe(`SELECT set_config('${ONE_ALLOCATOR_GUC}', '${value}', true)`);
        await sql.unsafe('insert into users (email, password) values ($1, $2)', [email(), password]);
      });

    it('AC4: GUC on → a users INSERT with a non-NULL password is refused', async () => {
      for (const on of ['on', 'ON', 'true', '1']) {
        const refusal = await refusalOf(() => insertWithGuc(on, 'h'));
        expect(refusal?.code).toBe('23000');
        expect(refusal?.message).toMatch(
          /^local user allocation refused: p77\.connect_enabled is on — Yobo Connect allocates every password-bearing identity; insert u\d+-p77_trg_[0-9a-f]+@example\.test with password NULL \(p77 M3\)$/,
        );
        expect(refusal?.message.startsWith(ONE_ALLOCATOR_ERROR_PREFIX)).toBe(true);
      }
    });

    it('AC4: GUC off, empty or unset → the same INSERT succeeds', async () => {
      await insertWithGuc('off', 'h');
      await insertWithGuc('', 'h');
      await insertWithGuc(null, 'h');
      // The transaction-scoped setting did not leak onto the pooled connection.
      await h.client`insert into users (email, password) values (${email()}, 'h')`;
    });

    it('GUC on → a Connect-born INSERT (password NULL) still succeeds', async () => {
      await insertWithGuc('on', null);
    });

    it('oneAllocatorGucSql(true) inside the transaction closes allocation', async () => {
      const refusal = await refusalOf(() =>
        h.client.begin(async (sql) => {
          await sql.unsafe(oneAllocatorGucSql(true));
          await sql.unsafe('insert into users (email, password) values ($1, $2)', [email(), 'h']);
        }),
      );
      expect(refusal?.message.startsWith(ONE_ALLOCATOR_ERROR_PREFIX)).toBe(true);
    });
  });

  // --- AC3: credential_version bump + 0137 -----------------------------------

  describe('M6 credential_version bump', () => {
    it('bumps on a local password change, per change, and never on a non-password update', async () => {
      const id = await walkedUser('local');
      expect((await readUser(id)).credential_version).toBe(1);
      await h.client`update users set password = 'h-2' where id = ${id}`;
      expect((await readUser(id)).credential_version).toBe(2);
      await h.client`update users set password = 'h-3' where id = ${id}`;
      expect((await readUser(id)).credential_version).toBe(3);
      await h.client`update users set email = ${email()} where id = ${id}`;
      await h.client`update users set password = 'h-3' where id = ${id}`; // same value: not a change
      expect((await readUser(id)).credential_version).toBe(3);
    });

    it('bumps on a prepared-row change and on NULLing a fenced row’s verifier without the flip', async () => {
      const prepared = await walkedUser('prepared');
      await h.client`update users set password = 'h-restage' where id = ${prepared}`;
      expect((await readUser(prepared)).credential_version).toBe(2);
      const fenced = await walkedUser('fenced');
      await h.client`update users set password = null where id = ${fenced}`;
      expect((await readUser(fenced)).credential_version).toBe(2);
    });

    it('AC3 (0137): the flip statement keeps credential_version = N — Connect’s, not local history + 1', async () => {
      // Local history: three password changes while local → version 4, then the legal walk to fenced.
      const id = await walkedUser('local', 'h-1');
      for (const pw of ['h-2', 'h-3', 'h-4']) await h.client`update users set password = ${pw} where id = ${id}`;
      await h.client`update users set credential_authority = 'prepared' where id = ${id}`;
      await h.client`update users set credential_authority = 'fenced' where id = ${id}`;
      expect(await readUser(id)).toEqual({ password: 'h-4', credential_authority: 'fenced', credential_version: 4 });

      // The flip: authority connect, retired verifier NULLed, version := Connect's N (2) — one statement.
      await h.client`
        update users set credential_authority = 'connect', password = null, credential_version = 2 where id = ${id}`;
      expect(await readUser(id)).toEqual({ password: null, credential_authority: 'connect', credential_version: 2 });
    });

    it('a connect row’s mirror moves only when written explicitly', async () => {
      const id = await insertUser('connect', { connectSub: 's-mirror' });
      await h.client`update users set credential_version = 7 where id = ${id}`;
      await h.client`update users set password = null where id = ${id}`;
      expect((await readUser(id)).credential_version).toBe(7);
    });
  });
});

/**
 * p107 ACC-001 — access service, PURE (no database).
 * Code format/normalization, `evaluateCode` reasons, `validate` over a stub
 * query chain, and the `decideAccess` matrix per mode. The DB-backed ACs live
 * in `access.db.test.ts` (real local Postgres).
 */
import { describe, expect, it } from 'vitest';

import { CODE_ALPHABET, CODE_RE, generateCode, isValidCodeFormat, normalizeCode } from './codes';
import {
  AccessOwnerRefFormatError,
  createAccessService,
  decideAccess,
  evaluateCode,
  hashAccessToken,
  isValidOwnerRef,
  type AccessDb,
} from './service';
import type { AccessCode, ValidateResult } from './types';

const NOW = new Date('2026-10-02T12:00:00Z');

function code(over: Partial<AccessCode> = {}): AccessCode {
  return {
    id: 1,
    code: 'ABCD2345',
    kind: 'campaign',
    ownerUserId: null,
    ownerRef: null,
    app: 'cadra',
    maxUses: null,
    uses: 0,
    expiresAt: null,
    tag: null,
    grantsAccess: true,
    boundEmail: null,
    status: 'active',
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** Minimal drizzle select chain: select().from().where().limit() → rows. */
function stubDb(rows: unknown[]): AccessDb & { calls: number } {
  const state = { calls: 0 };
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy', 'offset']) chain[m] = () => chain;
  chain.then = (resolve: (r: unknown[]) => unknown) => resolve(rows);
  return Object.assign(state, {
    select: () => {
      state.calls++;
      return chain;
    },
  }) as unknown as AccessDb & { calls: number };
}

describe('codes', () => {
  it('normalizes by trimming and upper-casing', () => {
    expect(normalizeCode('  summer-26 ')).toBe('SUMMER-26');
    expect(isValidCodeFormat(' abcd ')).toBe(true);
    expect(isValidCodeFormat('ab')).toBe(false);
    expect(isValidCodeFormat('ab cd')).toBe(false);
    expect(isValidCodeFormat('x'.repeat(33))).toBe(false);
  });

  it('generates codes from the Crockford alphabet without 0/O/1/I', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(8);
      expect(CODE_RE.test(c)).toBe(true);
      expect(c).not.toMatch(/[0O1I]/);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(() => generateCode(3)).toThrow();
  });

  it('hashes tokens with sha256 hex', () => {
    expect(hashAccessToken('t')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('evaluateCode', () => {
  const ev = (row: AccessCode | null, extra: { email?: string; emailVerified?: boolean; requireGrant?: boolean } = {}) =>
    evaluateCode(row, { now: NOW, ...extra });

  it('gives a distinct reason for each failure', () => {
    expect(ev(null)).toEqual({ ok: false, reason: 'not_found' });
    expect(ev(code({ status: 'revoked' }))).toMatchObject({ ok: false, reason: 'revoked' });
    expect(ev(code({ expiresAt: new Date(NOW.getTime() - 1) }))).toMatchObject({ ok: false, reason: 'expired' });
    expect(ev(code({ maxUses: 3, uses: 3 }))).toMatchObject({ ok: false, reason: 'exhausted' });
    expect(ev(code({ boundEmail: 'a@x.test' }), { email: 'b@x.test' })).toMatchObject({ reason: 'wrong_email' });
    expect(ev(code({ grantsAccess: false }), { requireGrant: true })).toMatchObject({ reason: 'no_access' });
  });

  it('revoked wins over expired; expiry is exclusive at now', () => {
    expect(ev(code({ status: 'revoked', expiresAt: new Date(0) }))).toMatchObject({ reason: 'revoked' });
    expect(ev(code({ expiresAt: NOW }))).toMatchObject({ reason: 'expired' });
    expect(ev(code({ expiresAt: new Date(NOW.getTime() + 1) })).ok).toBe(true);
  });

  it('matches bound email case-insensitively and allows unlimited codes', () => {
    expect(ev(code({ boundEmail: 'a@x.test' }), { email: ' A@X.test ', emailVerified: true }).ok).toBe(true);
    expect(ev(code({ maxUses: null, uses: 10_000 })).ok).toBe(true);
    expect(ev(code({ grantsAccess: false })).ok).toBe(true); // grant only checked when asked
  });

  it('a bound code needs a verified email (no squatting an invite by typing its address)', () => {
    const bound = code({ boundEmail: 'a@x.test' });
    expect(ev(bound, { email: 'a@x.test' })).toMatchObject({ ok: false, reason: 'email_unverified' });
    expect(ev(bound, { email: 'a@x.test', emailVerified: false })).toMatchObject({ reason: 'email_unverified' });
    // wrong_email still wins: an unverified stranger learns nothing new.
    expect(ev(bound, { email: 'b@x.test', emailVerified: false })).toMatchObject({ reason: 'wrong_email' });
    // An unbound code does not care.
    expect(ev(code(), { email: 'a@x.test', emailVerified: false }).ok).toBe(true);
  });
});

describe('validate (stub db)', () => {
  const svc = createAccessService({ app: 'cadra', now: () => NOW });

  it('does not query for a code with an invalid shape', async () => {
    const db = stubDb([code()]);
    expect(await svc.validate(db, { code: 'a b' })).toEqual({ ok: false, reason: 'not_found' });
    expect(db.calls).toBe(0);
  });

  it('reports expired and revoked distinctly from the looked-up row', async () => {
    const expired = await svc.validate(stubDb([code({ expiresAt: new Date(0) })]), { code: 'abcd2345' });
    const revoked = await svc.validate(stubDb([code({ status: 'revoked' })]), { code: 'abcd2345' });
    expect(expired).toMatchObject({ ok: false, reason: 'expired' });
    expect(revoked).toMatchObject({ ok: false, reason: 'revoked' });
    expect(await svc.validate(stubDb([]), { code: 'abcd2345' })).toEqual({ ok: false, reason: 'not_found' });
    expect((await svc.validate(stubDb([code()]), { code: 'abcd2345' })).ok).toBe(true);
  });
});

describe('decideAccess matrix', () => {
  const valid = (over: Partial<AccessCode> = {}): ValidateResult => ({ ok: true, code: code({ id: 7, ...over }) });
  const bad: ValidateResult = { ok: false, reason: 'expired' };

  it('off: allow, never redeem', () => {
    expect(decideAccess({ mode: 'off', presented: valid() })).toEqual({ allow: true, mode: 'off', via: 'off' });
  });

  it('optional: allow; redeem only a valid code; grants_access ignored', () => {
    expect(decideAccess({ mode: 'optional' })).toEqual({ allow: true, mode: 'optional', via: 'no_code' });
    expect(decideAccess({ mode: 'optional', presented: valid({ grantsAccess: false }) })).toMatchObject({
      allow: true,
      via: 'code',
      codeId: 7,
    });
    expect(decideAccess({ mode: 'optional', presented: bad })).toEqual({
      allow: true,
      mode: 'optional',
      via: 'no_code',
      ignoredCodeReason: 'expired',
    });
  });

  it('required: (a) granting code, (b) waitlist, (c) bound invite, else refuse', () => {
    expect(decideAccess({ mode: 'required', presented: valid() })).toMatchObject({ allow: true, via: 'code', codeId: 7 });
    expect(decideAccess({ mode: 'required', waitlistEntryId: 3 })).toMatchObject({
      allow: true,
      via: 'waitlist',
      waitlistEntryId: 3,
    });
    expect(decideAccess({ mode: 'required', presented: valid({ grantsAccess: false }), waitlistEntryId: 3 })).toMatchObject({
      via: 'waitlist',
      codeId: 7,
    });
    expect(decideAccess({ mode: 'required', boundInviteCodeId: 9 })).toMatchObject({
      allow: true,
      via: 'bound_invite',
      codeId: 9,
    });
    expect(decideAccess({ mode: 'required' })).toEqual({ allow: false, mode: 'required', reason: 'code_required' });
    expect(decideAccess({ mode: 'required', presented: bad })).toEqual({ allow: false, mode: 'required', reason: 'expired' });
    expect(decideAccess({ mode: 'required', presented: valid({ grantsAccess: false }) })).toEqual({
      allow: false,
      mode: 'required',
      reason: 'no_access',
    });
  });
});

describe('decide (stub db)', () => {
  it('fails closed with `unavailable` when the settings read errors', async () => {
    const svc = createAccessService({ app: 'cadra', now: () => NOW });
    const broken = {
      select: () => {
        throw new Error('connection refused');
      },
    } as unknown as AccessDb;
    expect(await svc.decide(broken, { email: 'a@x.test', emailVerified: true })).toEqual({ allow: false, mode: null, reason: 'unavailable' });
  });

  it('missing settings row → off → allow', async () => {
    const svc = createAccessService({ app: 'cadra', now: () => NOW });
    expect(await svc.decide(stubDb([]), { email: 'a@x.test', emailVerified: false, code: 'whatever' })).toEqual({
      allow: true,
      mode: 'off',
      via: 'off',
    });
  });
});

describe('owner ref (YMS-474)', () => {
  it('accepts <system>:<path> lower-case refs', () => {
    for (const r of ['yobo:user:526', 'yobo:user:1', 'ya:x', 'cadra-x_1:chat:wa:abc_9-z']) expect(isValidOwnerRef(r)).toBe(true);
  });
  it('rejects junk, phones, emails, upper case, empty halves and over-long refs', () => {
    for (const r of [
      '',
      'yobo',
      'yobo:',
      ':user:1',
      'Yobo:user:1',
      'yobo:User:1',
      '1yobo:user:1',
      'yobo:+6281234',
      'yobo:a@b.com',
      'yobo:user 1',
      'y:user:1',
      `yobo:${'a'.repeat(91)}`,
      `${'a'.repeat(33)}:user:1`,
      42,
      null,
    ]) expect(isValidOwnerRef(r)).toBe(false);
    expect(isValidOwnerRef(`yobo:${'a'.repeat(90)}`)).toBe(true);
  });
  it('getOrIssuePersonalCodeForRef refuses a bad ref before touching the db', async () => {
    const svc = createAccessService({ app: 'yobo' });
    const db = new Proxy({}, { get: () => { throw new Error('db touched'); } }) as unknown as AccessDb;
    await expect(svc.getOrIssuePersonalCodeForRef(db, 'yobo:+6281234')).rejects.toBeInstanceOf(AccessOwnerRefFormatError);
  });
});

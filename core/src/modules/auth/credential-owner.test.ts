/**
 * The credential owner port: resolver selection and defaults, the adapter
 * over the legacy yes/no guard, the typed refusal shapes, the UI read helper,
 * and `verifyLocalCredential`'s kind matrix including the constant-time
 * refusal.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  askCredentialOwner,
  CredentialOwnedElsewhereError,
  credentialOwnerOf,
  credentialRedirect,
  FROZEN_CREDENTIAL_MESSAGE,
  fromLocalCredentialGuard,
  frozenCredentialMessage,
  isCredentialRedirect,
  localOnlyOwner,
  selectCredentialOwnerResolver,
  type CredentialOwner,
  type ExternalCredentialOwner,
} from './credential-owner';
import { verifyLocalCredential } from './verify-local-credential';

const external: ExternalCredentialOwner = {
  kind: 'external',
  issuer: 'https://idp.example.com',
  providerId: 'idp',
  accountUrl: 'https://idp.example.com/account',
  resetUrl: 'https://idp.example.com/forgot',
  loginHint: 'owned@example.com',
};
const frozen: CredentialOwner = { kind: 'frozen', reason: 'migration in progress' };
const none: CredentialOwner = { kind: 'none' };
const local: CredentialOwner = { kind: 'local' };

const writeOps = ['register', 'invite', 'create', 'update', 'change-password', 'reset-request', 'reset'] as const;

describe('resolver selection and defaults', () => {
  it('localOnlyOwner answers local for every operation without looking at its args', async () => {
    for (const operation of [...writeOps, 'verify', 'login-form'] as const) {
      expect(await localOnlyOwner({ db: null, operation, user: null, email: null })).toEqual(local);
    }
  });

  it('askCredentialOwner with no resolver is local', async () => {
    expect(await askCredentialOwner(undefined, { db: {}, operation: 'register', user: null, email: 'a@b.c' })).toEqual(local);
  });

  it('selectCredentialOwnerResolver: resolver wins over guard, guard is adapted, nothing means local', async () => {
    const resolver = vi.fn().mockResolvedValue(none);
    const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'guarded' });
    const args = { db: {}, operation: 'create' as const, user: null, email: 'a@b.c' };

    expect(await selectCredentialOwnerResolver({ resolveCredentialOwner: resolver, canWriteLocalCredential: guard })(args)).toEqual(none);
    expect(guard).not.toHaveBeenCalled();

    expect(await selectCredentialOwnerResolver({ canWriteLocalCredential: guard })(args)).toEqual({ kind: 'frozen', reason: 'guarded' });
    expect(guard).toHaveBeenCalledTimes(1);

    expect(selectCredentialOwnerResolver({})).toBe(localOnlyOwner);
    expect(selectCredentialOwnerResolver(undefined)).toBe(localOnlyOwner);
  });
});

describe('fromLocalCredentialGuard (adapter)', () => {
  it('allow → local, refuse → frozen carrying the reason, for every write operation, with the guard args passed through', async () => {
    for (const operation of writeOps) {
      const allow = vi.fn().mockResolvedValue({ allowed: true });
      const refuse = vi.fn().mockResolvedValue({ allowed: false, reason: `no ${operation}` });
      const args = { db: { tag: operation }, operation, user: { id: 1 }, email: 'a@b.c' };

      expect(await fromLocalCredentialGuard(allow)(args)).toEqual(local);
      expect(allow).toHaveBeenCalledWith({ db: { tag: operation }, operation, user: { id: 1 }, email: 'a@b.c' });

      expect(await fromLocalCredentialGuard(refuse)(args)).toEqual({ kind: 'frozen', reason: `no ${operation}` });
    }
  });

  it('never asks the guard on the read side: verify and login-form are local', async () => {
    const refuse = vi.fn().mockResolvedValue({ allowed: false, reason: 'nope' });
    const adapted = fromLocalCredentialGuard(refuse);
    expect(await adapted({ db: {}, operation: 'verify', user: { id: 1 }, email: null })).toEqual(local);
    expect(await adapted({ db: {}, operation: 'login-form', user: null, email: 'a@b.c' })).toEqual(local);
    expect(refuse).not.toHaveBeenCalled();
  });

  it('accepts a synchronous guard', async () => {
    expect(await fromLocalCredentialGuard(() => ({ allowed: false, reason: 'sync' }))({ db: {}, operation: 'reset', user: null, email: null }))
      .toEqual({ kind: 'frozen', reason: 'sync' });
  });
});

describe('typed refusal shapes', () => {
  it('CredentialOwnedElsewhereError carries OWNED_ELSEWHERE, the owner, both urls and the operation', () => {
    const err = new CredentialOwnedElsewhereError(external, 'invite');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CredentialOwnedElsewhereError');
    expect(err.code).toBe('OWNED_ELSEWHERE');
    expect(err.owner).toBe(external);
    expect(err.accountUrl).toBe(external.accountUrl);
    expect(err.resetUrl).toBe(external.resetUrl);
    expect(err.operation).toBe('invite');
    expect(err.message).toContain(external.issuer);
  });

  it('frozenCredentialMessage uses the reason, else the neutral "try again shortly" text', () => {
    expect(frozenCredentialMessage({ kind: 'frozen', reason: 'fenced' })).toBe('fenced');
    expect(frozenCredentialMessage({ kind: 'frozen', reason: '' })).toBe(FROZEN_CREDENTIAL_MESSAGE);
    expect(FROZEN_CREDENTIAL_MESSAGE).toMatch(/try again shortly/);
  });

  it('credentialRedirect points at accountUrl and is recognised by isCredentialRedirect', () => {
    const r = credentialRedirect(external);
    expect(r).toEqual({
      redirect: external.accountUrl,
      ownedBy: 'external',
      issuer: external.issuer,
      providerId: external.providerId,
      accountUrl: external.accountUrl,
      resetUrl: external.resetUrl,
      loginHint: external.loginHint,
    });
    expect(isCredentialRedirect(r)).toBe(true);
    expect(isCredentialRedirect({ id: 7, email: 'a@b.c' })).toBe(false);
    expect(isCredentialRedirect(null)).toBe(false);
    // loginHint is omitted, not set to undefined, when the owner has none.
    const { loginHint: _omit, ...noHint } = external;
    expect(Object.keys(credentialRedirect(noHint))).not.toContain('loginHint');
  });
});

describe('credentialOwnerOf (UI read helper)', () => {
  it('asks as login-form by default with the user email, and defaults to local', async () => {
    const resolver = vi.fn().mockResolvedValue(external);
    const user = { id: 7, email: 'owned@example.com' };
    expect(await credentialOwnerOf({ resolveCredentialOwner: resolver, db: 'DB' }, user)).toBe(external);
    expect(resolver).toHaveBeenCalledWith({ db: 'DB', operation: 'login-form', user, email: 'owned@example.com' });

    expect(await credentialOwnerOf({}, user)).toEqual(local);
    expect(await credentialOwnerOf({ resolveCredentialOwner: resolver }, null, { email: 'x@y.z', operation: 'verify' })).toBe(external);
    expect(resolver).toHaveBeenLastCalledWith({ db: null, operation: 'verify', user: null, email: 'x@y.z' });
  });
});

describe('verifyLocalCredential', () => {
  const UNVERIFIABLE = 'hashed:$nobody-knows-this$';
  const user = { id: 7, email: 'owned@example.com', password: 'hashed:Right!Pass1' };

  function deps(owner: CredentialOwner | undefined) {
    const comparePassword = vi.fn(async (p: string, h: string) => h === `hashed:${p}`);
    return {
      deps: {
        db: 'DB',
        ...(owner && { resolveCredentialOwner: vi.fn().mockResolvedValue(owner) }),
        comparePassword,
        unverifiableHash: UNVERIFIABLE,
      },
      comparePassword,
    };
  }

  it('local: compares against the stored hash — match, and mismatch', async () => {
    const good = deps(local);
    await expect(verifyLocalCredential(good.deps, { user, password: 'Right!Pass1' })).resolves.toEqual({ ok: true, kind: 'local', owner: local });
    expect(good.comparePassword).toHaveBeenCalledTimes(1);
    expect(good.comparePassword).toHaveBeenCalledWith('Right!Pass1', user.password);

    const bad = deps(local);
    await expect(verifyLocalCredential(bad.deps, { user, password: 'Wrong' })).resolves.toEqual({ ok: false, kind: 'local', reason: 'mismatch', owner: local });
    expect(bad.comparePassword).toHaveBeenCalledTimes(1);
  });

  it('asks the resolver as verify with the user and email', async () => {
    const d = deps(local);
    await verifyLocalCredential(d.deps, { user, password: 'x' });
    expect(d.deps.resolveCredentialOwner).toHaveBeenCalledWith({ db: 'DB', operation: 'verify', user, email: user.email });
  });

  it.each([
    ['external', external],
    ['frozen', frozen],
    ['none', none],
  ] as const)('%s: exactly ONE compare, against unverifiableHash, never the stored hash; refusal names the kind', async (kind, owner) => {
    const d = deps(owner);
    const result = await verifyLocalCredential(d.deps, { user, password: 'Right!Pass1' });
    expect(result).toEqual({ ok: false, kind, reason: 'owned-elsewhere', owner });
    expect(d.comparePassword).toHaveBeenCalledTimes(1);
    expect(d.comparePassword).toHaveBeenCalledWith('Right!Pass1', UNVERIFIABLE);
    expect(d.comparePassword).not.toHaveBeenCalledWith(expect.anything(), user.password);
  });

  it('local with no stored hash, or no user row, still performs one compare against unverifiableHash', async () => {
    const noHash = deps(local);
    await expect(verifyLocalCredential(noHash.deps, { user: { ...user, password: null }, password: 'x' }))
      .resolves.toEqual({ ok: false, kind: 'local', reason: 'no-password', owner: local });
    expect(noHash.comparePassword).toHaveBeenCalledTimes(1);
    expect(noHash.comparePassword).toHaveBeenCalledWith('x', UNVERIFIABLE);

    const noUser = deps(local);
    await expect(verifyLocalCredential(noUser.deps, { user: null, email: 'ghost@example.com', password: 'x' }))
      .resolves.toEqual({ ok: false, kind: 'local', reason: 'no-user', owner: local });
    expect(noUser.comparePassword).toHaveBeenCalledTimes(1);
    expect(noUser.comparePassword).toHaveBeenCalledWith('x', UNVERIFIABLE);
    expect(noUser.deps.resolveCredentialOwner).toHaveBeenCalledWith(expect.objectContaining({ user: null, email: 'ghost@example.com' }));
  });

  it('with no resolver at all every credential is local (the default)', async () => {
    const d = deps(undefined);
    await expect(verifyLocalCredential(d.deps, { user, password: 'Right!Pass1' })).resolves.toMatchObject({ ok: true, kind: 'local' });
  });

  it('a legacy guard alone never affects verification: the adapter answers local on the read side', async () => {
    const comparePassword = vi.fn(async (p: string, h: string) => h === `hashed:${p}`);
    const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'nope' });
    await expect(
      verifyLocalCredential({ canWriteLocalCredential: guard, comparePassword, unverifiableHash: UNVERIFIABLE }, { user, password: 'Right!Pass1' }),
    ).resolves.toMatchObject({ ok: true, kind: 'local' });
    expect(guard).not.toHaveBeenCalled();
  });
});

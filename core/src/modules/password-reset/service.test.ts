import { describe, expect, it, vi } from 'vitest';

import { createPasswordResetService } from './service';

/**
 * A fake drizzle client: the service only needs select/insert/update/delete
 * chains, so each builder records the call and returns whatever the test
 * queued for that step.
 */
function createFakeDb(rows: { users?: any[]; tokens?: any[] }) {
  const calls = { inserted: [] as any[], updated: [] as any[], deleted: 0 };
  let selectCall = 0;

  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => Promise.resolve(result),
      then: (res: any) => Promise.resolve(result).then(res),
    };
    return c;
  };

  const db: any = {
    select: (shape: any) => {
      selectCall += 1;
      // Query order in the flow: user lookup, then token lookup, then user password.
      const source =
        shape && 'password' in shape
          ? rows.users ?? []
          : shape && ('expiresAt' in shape || 'userId' in shape)
            ? rows.tokens ?? []
            : rows.users ?? [];
      return chain(source);
    },
    insert: (table: any) => ({
      values: (v: any) => {
        calls.inserted.push({ table, values: v });
        return Promise.resolve();
      },
    }),
    update: (table: any) => ({
      set: (v: any) => ({
        where: () => {
          calls.updated.push({ table, values: v });
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: () => {
        calls.deleted += 1;
        return Promise.resolve();
      },
    }),
    transaction: (fn: any) => fn(db),
    // p77: the credential-write seam's three SET LOCALs land here.
    execute: async () => [],
    __calls: calls,
    __selectCalls: () => selectCall,
  };

  return db;
}

const tables = {
  users: { id: 'users.id', email: 'users.email', password: 'users.password', name: 'users.name', firstName: 'users.firstName', updatedAt: 'users.updatedAt' },
  passwordResetTokens: { id: 't.id', userId: 't.userId', token: 't.token', expiresAt: 't.expiresAt', usedAt: 't.usedAt' },
  authLogs: { id: 'l.id' },
} as any;

function build(rows: Parameters<typeof createFakeDb>[0], overrides: Record<string, unknown> = {}) {
  const db = createFakeDb(rows);
  const sendResetEmail = vi.fn().mockResolvedValue(true);
  const service = createPasswordResetService({
    runPrivileged: (fn: any) => fn(db),
    tables,
    hashPassword: async (pw: string) => `hashed:${pw}`,
    comparePassword: async (pw: string, hash: string) => hash === `hashed:${pw}`,
    sendResetEmail,
    baseUrl: 'https://app.example.com',
    logger: { error: vi.fn(), warn: vi.fn() } as any,
    ...overrides,
  });
  return { service, db, sendResetEmail };
}

describe('password reset service', () => {
  describe('requestReset', () => {
    it('issues a token and emails a link when the account exists', async () => {
      const { service, db, sendResetEmail } = build({
        users: [{ id: 7, email: 'user@example.com', name: 'User', firstName: 'Us' }],
      });

      const result = await service.requestReset({ email: 'User@Example.com  ' });

      expect(result).toEqual({ success: true });
      expect(db.__calls.deleted).toBe(1); // outstanding links superseded
      expect(db.__calls.inserted).toHaveLength(1);
      const link = sendResetEmail.mock.calls[0][0].resetLink;
      expect(link).toMatch(/^https:\/\/app\.example\.com\/reset-password\?token=[a-f0-9]{64}$/);
      expect(sendResetEmail.mock.calls[0][0].to).toBe('user@example.com');
    });

    it('reports success and issues nothing for an unknown address', async () => {
      const { service, db, sendResetEmail } = build({ users: [] });

      const result = await service.requestReset({ email: 'nobody@example.com' });

      expect(result).toEqual({ success: true });
      expect(db.__calls.inserted).toHaveLength(0);
      expect(sendResetEmail).not.toHaveBeenCalled();
    });

    it('still reports success when delivery fails', async () => {
      const { service } = build(
        { users: [{ id: 7, email: 'user@example.com', name: null, firstName: null }] },
        { sendResetEmail: vi.fn().mockRejectedValue(new Error('smtp down')) },
      );

      await expect(service.requestReset({ email: 'user@example.com' })).resolves.toEqual({
        success: true,
      });
    });
  });

  describe('validateToken', () => {
    it('rejects a missing token', async () => {
      const { service } = build({});
      await expect(service.validateToken(null)).resolves.toEqual({
        valid: false,
        reason: 'invalid',
      });
    });

    it('rejects an unknown token', async () => {
      const { service } = build({ tokens: [] });
      await expect(service.validateToken('nope')).resolves.toEqual({
        valid: false,
        reason: 'invalid',
      });
    });

    it('reports an elapsed token as expired', async () => {
      const { service } = build({
        tokens: [{ id: 1, expiresAt: new Date(Date.now() - 1000) }],
      });
      await expect(service.validateToken('stale')).resolves.toEqual({
        valid: false,
        reason: 'expired',
      });
    });

    it('accepts a live token', async () => {
      const { service } = build({
        tokens: [{ id: 1, expiresAt: new Date(Date.now() + 60_000) }],
      });
      await expect(service.validateToken('good')).resolves.toEqual({ valid: true });
    });
  });

  describe('canWriteLocalCredential guard (caller-injected)', () => {
    const liveToken = [{ id: 1, userId: 7, expiresAt: new Date(Date.now() + 60_000) }];
    const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass123', ownedElsewhere: true };

    it('requestReset: a refused mint still answers success, but issues no token and sends no email', async () => {
      const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'owned elsewhere' });
      const { service, db, sendResetEmail } = build(
        { users: [owned] },
        { canWriteLocalCredential: guard },
      );

      const result = await service.requestReset({ email: 'owned@example.com' });

      expect(result).toEqual({ success: true });
      expect(db.__calls.inserted).toHaveLength(0);
      expect(db.__calls.deleted).toBe(0);
      expect(sendResetEmail).not.toHaveBeenCalled();
      // The guard sees the WHOLE row, not a projection — the app's rule may
      // live in any column.
      expect(guard).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'reset-request', user: owned, email: 'owned@example.com' }),
      );
    });

    it('resetPassword: a refused write is reported as refused and writes nothing', async () => {
      const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'owned elsewhere' });
      const { service, db } = build(
        { tokens: liveToken, users: [owned] },
        { canWriteLocalCredential: guard },
      );

      const result = await service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });

      expect(result).toEqual({ ok: false, error: 'owned elsewhere', reason: 'refused' });
      expect(db.__calls.updated).toHaveLength(0);
      expect(db.__calls.inserted).toHaveLength(0);
      expect(guard).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'reset', user: owned }),
      );
    });

    it('an allowing guard changes nothing about the happy path', async () => {
      const { service, db } = build(
        { tokens: liveToken, users: [owned] },
        { canWriteLocalCredential: async () => ({ allowed: true }) },
      );

      const result = await service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });

      expect(result).toEqual({ ok: true });
      expect(db.__calls.updated[0].values.password).toBe('hashed:Str0ng!Pass');
    });

    it('no guard injected: every write is allowed (pre-existing consumers unchanged)', async () => {
      const { service, db } = build({ tokens: liveToken, users: [owned] });
      const result = await service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });
      expect(result).toEqual({ ok: true });
      expect(db.__calls.updated[0].values.password).toBe('hashed:Str0ng!Pass');
    });
  });

  describe('resolveCredentialOwner — the routing port (STORY-039)', () => {
    const liveToken = [{ id: 1, userId: 7, expiresAt: new Date(Date.now() + 60_000) }];
    const owned = { id: 7, email: 'owned@example.com', password: 'hashed:Old!Pass123' };
    const externalOwner = (forwardResetRequest?: (email: string) => Promise<void>) => ({
      kind: 'external' as const,
      issuer: 'https://idp.example.com',
      providerId: 'idp',
      accountUrl: 'https://idp.example.com/account',
      resetUrl: 'https://idp.example.com/forgot',
      ...(forwardResetRequest && { forwardResetRequest }),
    });
    const frozen = { kind: 'frozen' as const, reason: 'migration in progress' };
    const none = { kind: 'none' as const };
    const resolving = (owner: unknown) => vi.fn().mockResolvedValue(owner);

    describe('requestReset', () => {
      it('external with forwardResetRequest: forwards EXACTLY once with the normalised email, mints nothing, sends nothing, silent success', async () => {
        const forward = vi.fn().mockResolvedValue(undefined);
        const resolver = resolving(externalOwner(forward));
        const { service, db, sendResetEmail } = build({ users: [owned] }, { resolveCredentialOwner: resolver });

        await expect(service.requestReset({ email: '  Owned@Example.com ' })).resolves.toEqual({ success: true });

        expect(forward).toHaveBeenCalledTimes(1);
        expect(forward).toHaveBeenCalledWith('owned@example.com');
        expect(db.__calls.inserted).toHaveLength(0);
        expect(db.__calls.deleted).toBe(0);
        expect(sendResetEmail).not.toHaveBeenCalled();
        expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ operation: 'reset-request', user: owned, email: 'owned@example.com' }));
      });

      it('external without forwardResetRequest: silent success, nothing minted or sent', async () => {
        const { service, db, sendResetEmail } = build({ users: [owned] }, { resolveCredentialOwner: resolving(externalOwner()) });
        await expect(service.requestReset({ email: owned.email })).resolves.toEqual({ success: true });
        expect(db.__calls.inserted).toHaveLength(0);
        expect(sendResetEmail).not.toHaveBeenCalled();
      });

      it('a failing forward is logged and swallowed: the response shape does not change', async () => {
        const logger = { error: vi.fn(), warn: vi.fn() };
        const forward = vi.fn().mockRejectedValue(new Error('owner down'));
        const { service } = build({ users: [owned] }, { resolveCredentialOwner: resolving(externalOwner(forward)), logger });
        await expect(service.requestReset({ email: owned.email })).resolves.toEqual({ success: true });
        expect(forward).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(1);
      });

      it.each([
        ['frozen', frozen],
        ['none', none],
      ])('%s: silent success, nothing minted, no email', async (_kind, owner) => {
        const { service, db, sendResetEmail } = build({ users: [owned] }, { resolveCredentialOwner: resolving(owner) });
        await expect(service.requestReset({ email: owned.email })).resolves.toEqual({ success: true });
        expect(db.__calls.inserted).toHaveLength(0);
        expect(db.__calls.deleted).toBe(0);
        expect(sendResetEmail).not.toHaveBeenCalled();
      });

      it('local, and no resolver, mint and email identically', async () => {
        for (const resolver of [resolving({ kind: 'local' }), undefined]) {
          const { service, db, sendResetEmail } = build({ users: [owned] }, { resolveCredentialOwner: resolver });
          await expect(service.requestReset({ email: owned.email })).resolves.toEqual({ success: true });
          expect(db.__calls.deleted).toBe(1);
          expect(db.__calls.inserted).toHaveLength(1);
          expect(sendResetEmail).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe('resetPassword (consume)', () => {
      it('external: refused with the owner resetUrl as redirect; no compare, no hash, nothing written', async () => {
        const hashPassword = vi.fn(async (pw: string) => `hashed:${pw}`);
        const comparePassword = vi.fn(async () => false);
        const { service, db } = build({ tokens: liveToken, users: [owned] }, { resolveCredentialOwner: resolving(externalOwner()), hashPassword, comparePassword });

        const result = await service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });

        expect(result).toMatchObject({ ok: false, reason: 'refused', redirect: 'https://idp.example.com/forgot' });
        expect(db.__calls.updated).toHaveLength(0);
        expect(db.__calls.inserted).toHaveLength(0);
        expect(hashPassword).not.toHaveBeenCalled();
        expect(comparePassword).not.toHaveBeenCalled();
      });

      it('frozen: refused with the reason, nothing hashed or written', async () => {
        const hashPassword = vi.fn(async (pw: string) => `hashed:${pw}`);
        const { service, db } = build({ tokens: liveToken, users: [owned] }, { resolveCredentialOwner: resolving(frozen), hashPassword });
        await expect(service.resetPassword({ token: 'good', password: 'Str0ng!Pass' })).resolves.toEqual({ ok: false, error: 'migration in progress', reason: 'refused' });
        expect(db.__calls.updated).toHaveLength(0);
        expect(hashPassword).not.toHaveBeenCalled();
      });

      it('none: the link points at nobody — invalid, nothing hashed or written', async () => {
        const hashPassword = vi.fn(async (pw: string) => `hashed:${pw}`);
        const { service, db } = build({ tokens: liveToken, users: [owned] }, { resolveCredentialOwner: resolving(none), hashPassword });
        await expect(service.resetPassword({ token: 'good', password: 'Str0ng!Pass' })).resolves.toMatchObject({ ok: false, reason: 'invalid' });
        expect(db.__calls.updated).toHaveLength(0);
        expect(hashPassword).not.toHaveBeenCalled();
      });

      it('local, and no resolver, write identically', async () => {
        for (const resolver of [resolving({ kind: 'local' }), undefined]) {
          const { service, db } = build({ tokens: liveToken, users: [owned] }, { resolveCredentialOwner: resolver });
          await expect(service.resetPassword({ token: 'good', password: 'Str0ng!Pass' })).resolves.toEqual({ ok: true });
          expect(db.__calls.updated[0].values.password).toBe('hashed:Str0ng!Pass');
        }
      });

      it('resolveCredentialOwner wins over a refusing guard', async () => {
        const guard = vi.fn().mockResolvedValue({ allowed: false, reason: 'guard says no' });
        const { service, db } = build({ tokens: liveToken, users: [owned] }, { resolveCredentialOwner: resolving({ kind: 'local' }), canWriteLocalCredential: guard });
        await expect(service.resetPassword({ token: 'good', password: 'Str0ng!Pass' })).resolves.toEqual({ ok: true });
        expect(db.__calls.updated[0].values.password).toBe('hashed:Str0ng!Pass');
        expect(guard).not.toHaveBeenCalled();
      });
    });

    it('guard alone ≡ fromLocalCredentialGuard(guard) on reset-request and reset, allow and refuse', async () => {
      const { fromLocalCredentialGuard } = await import('../auth/credential-owner');
      for (const verdict of [{ allowed: true }, { allowed: false, reason: 'owned elsewhere' }]) {
        const guard = async () => verdict as any;
        const run = async (deps: Record<string, unknown>) => {
          const req = build({ users: [owned] }, deps);
          const requested = await req.service.requestReset({ email: owned.email });
          const con = build({ tokens: liveToken, users: [owned] }, deps);
          const consumed = await con.service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });
          return {
            requested,
            requestWrites: { inserted: req.db.__calls.inserted.length, emails: req.sendResetEmail.mock.calls.length },
            consumed,
            consumeWrites: con.db.__calls.updated.length,
          };
        };
        const viaGuard = await run({ canWriteLocalCredential: guard });
        const viaAdapter = await run({ resolveCredentialOwner: fromLocalCredentialGuard(guard) });
        expect(viaAdapter).toEqual(viaGuard);
        if (!verdict.allowed) {
          expect(viaGuard).toEqual({
            requested: { success: true },
            requestWrites: { inserted: 0, emails: 0 },
            consumed: { ok: false, error: 'owned elsewhere', reason: 'refused' },
            consumeWrites: 0,
          });
        }
      }
    });
  });

  describe('resetPassword', () => {
    const liveToken = [{ id: 1, userId: 7, expiresAt: new Date(Date.now() + 60_000) }];

    it('rejects a password that fails the policy', async () => {
      const { service } = build({ tokens: liveToken, users: [{ password: null }] });

      const result = await service.resetPassword({ token: 'good', password: 'short' });

      expect(result).toEqual({
        ok: false,
        error: 'Password must be at least 8 characters',
        reason: 'validation',
      });
    });

    it('rejects an unknown or expired token', async () => {
      const { service } = build({ tokens: [], users: [] });

      const result = await service.resetPassword({ token: 'stale', password: 'Str0ng!Pass' });

      expect(result).toEqual({
        ok: false,
        error: 'Reset link is invalid or has expired. Please request a new one',
        reason: 'expired',
      });
    });

    it('rejects reusing the current password', async () => {
      const { service } = build({
        tokens: liveToken,
        users: [{ password: 'hashed:Str0ng!Pass' }],
      });

      const result = await service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });

      expect(result).toEqual({
        ok: false,
        error: 'New password must be different from your current password',
        reason: 'validation',
      });
    });

    it('writes the hash, marks the token used, and logs the event', async () => {
      const { service, db } = build({
        tokens: liveToken,
        users: [{ password: 'hashed:Old!Pass123' }],
      });

      const result = await service.resetPassword({
        token: 'good',
        password: 'Str0ng!Pass',
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      });

      expect(result).toEqual({ ok: true });
      expect(db.__calls.updated[0].values.password).toBe('hashed:Str0ng!Pass');
      expect(db.__calls.updated[1].values.usedAt).toBeInstanceOf(Date);
      expect(db.__calls.inserted[0].values).toMatchObject({
        userId: 7,
        eventType: 'password_reset',
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      });
    });

    it('runs onPasswordChanged inside the write', async () => {
      const onPasswordChanged = vi.fn().mockResolvedValue(undefined);
      const { service } = build(
        { tokens: liveToken, users: [{ password: null }] },
        { onPasswordChanged },
      );

      await service.resetPassword({ token: 'good', password: 'Str0ng!Pass' });

      expect(onPasswordChanged).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 7 }),
      );
    });
  });
});

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

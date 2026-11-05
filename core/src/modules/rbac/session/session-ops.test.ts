import { describe, expect, it, vi } from 'vitest';

import { AuthErrorCode } from '../../auth/types';
import {
  AuthErrors,
  createAuthResponse,
  formatErrorForLogging,
  getRetryDelay,
  isRetryableError,
  isValidAuthResponse,
} from '../../auth/auth-errors';
import type { PermissionEventPayload, UserRoleStore } from './index';
import { createServerActionAuth, createUserRoleOperations, validateServerActionInput } from './index';

describe('auth errors', () => {
  it('retry rules and response shape', () => {
    expect(isRetryableError(AuthErrors.rateLimited(30))).toBe(true);
    expect(getRetryDelay(AuthErrors.rateLimited(30))).toBe(30);
    expect(getRetryDelay(AuthErrors.rateLimited())).toBe(60);
    expect(isRetryableError(AuthErrors.invalidCredentials())).toBe(false);
    const res = createAuthResponse(false, undefined, AuthErrors.sessionExpired());
    expect(isValidAuthResponse(res)).toBe(true);
    expect(res.error?.code).toBe(AuthErrorCode.SESSION_EXPIRED);
    expect(isValidAuthResponse({ success: true })).toBe(false);
  });

  it('strips secrets from log context', () => {
    const log = formatErrorForLogging(AuthErrors.invalidToken(), { userId: 1, password: 'p', refreshToken: 't' });
    expect(log.context).toEqual({ userId: 1 });
  });
});

describe('user role operations', () => {
  const payload: PermissionEventPayload = {
    currentOrgPermissions: [],
    globalPermissions: [],
    isUserActive: true,
    hasAnyOrgAccess: true,
    activeOrganizations: [1],
    shouldMaintainSession: true,
    timestamp: 0,
  };
  function setup(refusal: string | null = null) {
    const store: UserRoleStore<{ id: number }> = {
      insert: vi.fn(async (rows) => rows.map((_r, i) => ({ id: i + 1 }))),
      remove: vi.fn(async () => ({ rows: [{ id: 1 }], userIds: [5, 5, 6] })),
      setActive: vi.fn(async () => ({ rows: [], userIds: [] })),
    };
    const publish = vi.fn(async () => undefined);
    const ops = createUserRoleOperations({
      store,
      publish,
      loadPayload: async () => payload,
      refuseAssignment: async () => refusal,
    });
    return { ops, store, publish };
  }

  it('assign writes then broadcasts on the user channel', async () => {
    const { ops, publish } = setup();
    await ops.assignUserRole({ userId: 5, orgId: 1, roleId: 9 });
    expect(publish).toHaveBeenCalledWith('permissions:user:5', payload);
  });

  it('refused assignment never writes', async () => {
    const { ops, store, publish } = setup('This role can only be assigned by platform staff');
    await expect(ops.assignUserRole({ userId: 5, orgId: 1, roleId: 1 })).rejects.toThrow(/platform staff/);
    expect(store.insert).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('remove broadcasts each affected user once; empty filter refused; broadcast failure does not fail the write', async () => {
    const { ops, publish } = setup();
    publish.mockRejectedValueOnce(new Error('redis down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(ops.removeUserRole({ roleId: 9 })).resolves.toEqual([{ id: 1 }]);
    expect(publish).toHaveBeenCalledTimes(2);
    await expect(ops.removeUserRole({})).rejects.toThrow(/filter/);
  });
});

describe('server action auth', () => {
  const session = { user: { id: 7, currentOrgId: 1, permissions: ['report:read'] } };

  it('allows a held permission, denies a missing one, refuses no session / no org', async () => {
    const onPermissionDenied = vi.fn();
    const wrap = createServerActionAuth({ getSession: async () => session, onPermissionDenied });
    const read = wrap(async (ctx) => ctx.orgId, { requiredPermission: 'report:read' });
    await expect(read()).resolves.toBe(1);
    const del = wrap(async () => 'x', { requiredPermission: 'report:delete', name: 'deleteReport' });
    await expect(del()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(onPermissionDenied).toHaveBeenCalledWith({ action: 'deleteReport', userId: 7, orgId: 1, permission: 'report:delete' });

    const anon = createServerActionAuth({ getSession: async () => null })(async () => 1);
    await expect(anon()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const noOrg = createServerActionAuth({ getSession: async () => ({ user: { id: 7 } }) })(async () => 1);
    await expect(noOrg()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('access gate and real-time resolver override the session claims', async () => {
    const gated = createServerActionAuth({ getSession: async () => session, checkAccess: async () => 'No access' });
    await expect(gated(async () => 1)()).rejects.toThrow('No access');
    const live = createServerActionAuth({ getSession: async () => session, resolvePermissions: async () => [] });
    await expect(live(async () => 1, { requiredPermission: 'report:read' })()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validateServerActionInput', () => {
    const schema = {
      safeParse: (i: unknown) =>
        typeof i === 'string' ? ({ success: true, data: i } as const) : ({ success: false, error: { message: 'bad' } } as const),
    };
    expect(validateServerActionInput(schema, 'a')).toBe('a');
    expect(() => validateServerActionInput(schema, 1)).toThrow('Invalid input: bad');
  });
});

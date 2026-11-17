import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import type { OrgSwitchLookup, SessionOrgAccess, UserRoleRow } from './index';
import {
  assertPermission,
  assertPlatformPermission,
  assertSessionOrgMembership,
  assertSystemUser,
  buildSessionRbac,
  hasSystemRole,
  invalidateRoleSessions,
  isSessionStale,
  needsRbacRefresh,
  parseSessionOrgAccess,
  refreshSessionClaims,
  sessionOrgAccessQuery,
  SESSION_ORG_ACCESS_ENDED_MESSAGE,
  toSessionUser,
} from './index';

const ORG_A = 1;
const ORG_B = 2;

function row(orgId: number | null, role: Partial<NonNullable<UserRoleRow['role']>>, slugs: string[]): UserRoleRow {
  return {
    orgId,
    role: {
      name: 'r',
      orgId: null,
      isActive: true,
      isSystemRole: false,
      isGlobalRole: false,
      ...role,
      rolePermissions: slugs.map((slug) => ({ permission: { slug } })),
    },
  };
}

const adminTemplateA = row(ORG_A, { name: 'Admin', isGlobalRole: true }, ['admin:full_access', 'user:read']);
const editorB = row(ORG_B, { name: 'Editor', orgId: ORG_B }, ['deal:update']);

describe('permission check allow/deny', () => {
  it('scopes permissions to the active org and ignores role names', () => {
    const rbac = buildSessionRbac([adminTemplateA, editorB], ORG_A);
    expect(rbac.permissions).toEqual(['admin:full_access', 'user:read']);
    expect(rbac.isSystemUser).toBe(false);
  });

  it('drops another org custom role attached to this org, global template at system scope, inactive roles', () => {
    const foreign = row(ORG_A, { orgId: ORG_B }, ['x:y']);
    const unscopedTemplate = row(null, { isGlobalRole: true }, ['user:delete']);
    const inactive = row(ORG_A, { isActive: false }, ['z:z']);
    expect(buildSessionRbac([foreign, unscopedTemplate, inactive], ORG_A).permissions).toEqual([]);
  });

  it('assertPermission allows a held slug and denies otherwise, reporting the denial', async () => {
    const onDenied = vi.fn();
    const ctx = { user: { id: 7, permissions: ['user:read'] }, orgId: ORG_A };
    await expect(assertPermission(ctx, 'user:read', { onDenied })).resolves.toBeUndefined();
    await expect(assertPermission(ctx, 'user:delete', { onDenied, path: 'user.delete' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(assertPermission({ user: null }, 'user:read', { onDenied })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(assertPermission({ user: { id: 7 }, orgId: null }, 'user:read')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(onDenied).toHaveBeenCalledWith({ userId: 7, orgId: ORG_A, path: 'user.delete', permission: 'user:delete' });
  });
});

describe('session invalidation', () => {
  it('marks every distinct holder stale once', async () => {
    const markSessionsStale = vi.fn(async () => undefined);
    const n = await invalidateRoleSessions({ findUsersByRoles: async () => [3, 4, 3], markSessionsStale }, [10, 11]);
    expect(n).toBe(2);
    expect(markSessionsStale).toHaveBeenCalledWith([3, 4]);
    expect(await invalidateRoleSessions({ findUsersByRoles: async () => [1], markSessionsStale }, [])).toBe(0);
  });

  it('a token loaded before the stale marker, older than the TTL, or for another org needs a refresh', () => {
    expect(isSessionStale(1_000, 2_000)).toBe(true);
    expect(isSessionStale(3_000, new Date(2_000))).toBe(false);
    const token = { currentOrgId: ORG_A, permissions: [], rbacOrgId: ORG_A, rbacLoadedAt: 1_000 };
    expect(needsRbacRefresh(token, { now: 2_000 })).toBe(false);
    expect(needsRbacRefresh(token, { now: 1_000 + 5 * 60 * 1000 })).toBe(true);
    expect(needsRbacRefresh({ ...token, rbacOrgId: ORG_B }, { now: 2_000 })).toBe(true);
  });

  it('refuses a session whose user left the org; lets platform staff and api keys through', async () => {
    const ctx = { session: { user: { id: '7', currentOrgId: '1' } } };
    const gone: SessionOrgAccess = { userActive: true, member: false, systemUser: false };
    await expect(assertSessionOrgMembership(ctx, async () => gone)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: SESSION_ORG_ACCESS_ENDED_MESSAGE,
    });
    await expect(assertSessionOrgMembership(ctx, async () => ({ ...gone, systemUser: true }))).resolves.toBeUndefined();
    await expect(assertSessionOrgMembership({ ...ctx, isApiKeyContext: true }, async () => gone)).resolves.toBeUndefined();
    expect(parseSessionOrgAccess({ rows: [{ user_active: true, member: true, system_user: false }] })).toEqual({
      userActive: true,
      member: true,
      systemUser: false,
    });
  });

  it('system_user only counts an ACTIVE system role (inactive role row does not grant staff bypass)', () => {
    const text = new PgDialect().sqlToQuery(sessionOrgAccessQuery(7, 1)).sql.replace(/\s+/g, ' ');
    expect(text).toContain('ur.is_active = true AND r.is_active = true AND r.is_system_role = true');
  });
});

describe('org switch claim refresh', () => {
  function lookup(current: number | null, members: number[]): OrgSwitchLookup {
    return {
      getCurrentOrgId: async () => current,
      hasActiveMembership: async (_u, orgId) => members.includes(orgId),
      setCurrentOrgId: async () => undefined,
    };
  }
  const loadRows = async (_userId: number, orgId: number | null) =>
    [adminTemplateA, editorB].filter((r) => r.orgId === orgId);

  it('on update, moves to the DB org when still a member and reloads that org permissions', async () => {
    const token: Record<string, unknown> = { currentOrgId: ORG_A, permissions: ['user:read'], rbacOrgId: ORG_A, rbacLoadedAt: 100 };
    const res = await refreshSessionClaims(token, { loadRows, orgSwitch: lookup(ORG_B, [ORG_A, ORG_B]) }, { userId: 7, trigger: 'update', now: 200 });
    expect(res).toEqual({ orgSwitched: true, rbacReloaded: true });
    expect(token.currentOrgId).toBe(ORG_B);
    expect(token.permissions).toEqual(['deal:update']);
    expect(toSessionUser(token, 7)).toMatchObject({ currentOrgId: ORG_B, permissions: ['deal:update'], isSystemUser: false });
  });

  it('keeps the org when membership is gone, and ignores the DB org without an update trigger', async () => {
    const token: Record<string, unknown> = { currentOrgId: ORG_A, permissions: ['user:read'], rbacOrgId: ORG_A, rbacLoadedAt: 100 };
    const refused = await refreshSessionClaims(token, { loadRows, orgSwitch: lookup(ORG_B, [ORG_A]) }, { userId: 7, trigger: 'update', now: 200 });
    expect(refused.orgSwitched).toBe(false);
    expect(token.currentOrgId).toBe(ORG_A);
    const plain = await refreshSessionClaims(token, { loadRows, orgSwitch: lookup(ORG_B, [ORG_A, ORG_B]) }, { userId: 7, now: 200 });
    expect(plain).toEqual({ orgSwitched: false, rbacReloaded: false });
  });

  it('fails closed when the role read throws', async () => {
    const token: Record<string, unknown> = { currentOrgId: ORG_A };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await refreshSessionClaims(token, { loadRows: async () => { throw new Error('db down'); }, orgSwitch: lookup(null, []) }, { userId: 7, trigger: 'signIn' });
    expect(token.permissions).toEqual([]);
    expect(token.isSystemUser).toBe(false);
  });
});

describe('platform staff check', () => {
  it('staff status comes from is_system_role, never from admin:* or a role name', () => {
    const orgAdmin = buildSessionRbac([adminTemplateA], ORG_A);
    expect(orgAdmin.isSystemUser).toBe(false);
    const staff = buildSessionRbac([row(null, { name: 'Anything', isSystemRole: true }, ['admin:org_management'])], ORG_A);
    expect(staff.isSystemUser).toBe(true);
    expect(hasSystemRole([{ isGlobalRole: true }])).toBe(false);
    expect(hasSystemRole([null, { isSystemRole: true }])).toBe(true);
  });

  it('assertSystemUser / assertPlatformPermission gate on staff status AND the admin:* slug', () => {
    expect(() => assertSystemUser({ isSystemUser: false })).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => assertSystemUser({ isSystemUser: true })).not.toThrow();
    const orgOwner = { isSystemUser: false, permissions: ['admin:full_access'] };
    expect(() => assertPlatformPermission(orgOwner, 'admin:full_access')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => assertPlatformPermission({ isSystemUser: true, permissions: [] }, 'admin:full_access')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => assertPlatformPermission({ isSystemUser: true, permissions: ['admin:full_access'] }, 'admin:full_access')).not.toThrow();
    expect(() => assertPlatformPermission({ isSystemUser: true, permissions: ['user:read'] }, 'user:read')).toThrow(/not a platform permission/);
  });
});

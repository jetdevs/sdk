/**
 * Permission checks + session invalidation, ported from the app cluster
 * `src/lib/{trpc-permissions,real-time-permissions,session-invalidation}.ts`
 * (started from cadra-web; core-saas/crm copies are older/near-identical).
 *
 * Fixes carried over vs the app copies:
 *  - no role-name bypass (cadra/core-saas/crm `getUserPermissions` gave every
 *    permission to roles NAMED admin/owner/super);
 *  - real-time reads are org-scoped through `buildSessionRbac`
 *    (`getUserPermissionsRealTime` used to union every org's roles).
 * Db reads and the audit sink are injected.
 */
import { TRPCError } from '@trpc/server';

import type { LoadUserRoleRows } from './session-rbac';
import { buildSessionRbac } from './session-rbac';

/** Exact-slug check against a held set. */
export function hasPermissionSlug(held: readonly string[] | null | undefined, required: string): boolean {
  return (held ?? []).includes(required);
}

/** Real-time (bypasses the session) org-scoped permission list. Fails closed. */
export async function getUserPermissionsRealTime(
  loadRows: LoadUserRoleRows,
  userId: number,
  orgId: number | null,
): Promise<string[]> {
  try {
    return buildSessionRbac(await loadRows(userId, orgId), orgId).permissions;
  } catch (err) {
    console.error('[rbac] real-time permission read failed', { userId, orgId, err });
    return [];
  }
}

export async function checkUserPermissionRealTime(
  loadRows: LoadUserRoleRows,
  userId: number,
  orgId: number | null,
  required: string,
): Promise<boolean> {
  return hasPermissionSlug(await getUserPermissionsRealTime(loadRows, userId, orgId), required);
}

export type AccessDeniedSink = (event: {
  userId?: number;
  orgId?: number;
  path: string;
  permission: string;
}) => void | Promise<void>;

export interface PermissionGuardCtx {
  user?: { id?: number; permissions?: readonly string[] | null } | null;
  orgId?: number | null;
}

/**
 * Throws UNAUTHORIZED (no user), FORBIDDEN (no org / missing permission).
 * Reads the held set from `ctx.user.permissions` (the session claims), or from
 * `resolve` when given (real-time).
 */
export async function assertPermission(
  ctx: PermissionGuardCtx,
  required: string,
  opts: {
    path?: string;
    onDenied?: AccessDeniedSink;
    resolve?: (userId: number, orgId: number) => Promise<readonly string[]>;
  } = {},
): Promise<void> {
  const path = opts.path ?? 'unknown';
  const userId = ctx.user?.id;
  if (userId == null) {
    await opts.onDenied?.({ path, permission: required });
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required for this operation.' });
  }
  const orgId = ctx.orgId ?? null;
  if (orgId == null) {
    await opts.onDenied?.({ userId, path, permission: required });
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User must be associated with an org to perform this action.' });
  }
  const held = opts.resolve ? await opts.resolve(userId, orgId) : ctx.user?.permissions;
  if (!hasPermissionSlug(held, required)) {
    await opts.onDenied?.({ userId, orgId, path, permission: required });
    throw new TRPCError({ code: 'FORBIDDEN', message: `Permission denied. Required permission: ${required}` });
  }
}

export interface SessionInvalidationDeps {
  /** DISTINCT user ids holding any of `roleIds` via an active user_roles row. */
  findUsersByRoles(roleIds: readonly number[]): Promise<number[]>;
  /**
   * Mark these users' sessions stale. The app copies bump `users.updated_at`;
   * a session store / redis epoch works too. The token pass must compare it.
   */
  markSessionsStale(userIds: readonly number[]): Promise<void>;
}

/** Call after a role's permissions change. Returns the number of users affected. */
export async function invalidateRoleSessions(deps: SessionInvalidationDeps, roleIds: readonly number[]): Promise<number> {
  if (roleIds.length === 0) return 0;
  const userIds = [...new Set(await deps.findUsersByRoles(roleIds))];
  if (userIds.length > 0) await deps.markSessionsStale(userIds);
  return userIds.length;
}

/**
 * Token side of invalidation: true when the session was issued before the
 * user's stale marker (e.g. users.updated_at), so its claims must reload.
 */
export function isSessionStale(rbacLoadedAt: unknown, staleSince: Date | number | null | undefined): boolean {
  if (staleSince == null) return false;
  const marker = typeof staleSince === 'number' ? staleSince : staleSince.getTime();
  const loadedAt = typeof rbacLoadedAt === 'number' ? rbacLoadedAt : 0;
  return loadedAt < marker;
}

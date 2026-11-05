/**
 * Session RBAC — the roles + permission slugs a session token carries.
 *
 * Ported from engage-app `src/server/auth/session-rbac.ts`. Auth-provider
 * neutral: the token is a plain record (NextAuth JWT, an OIDC session, any
 * cookie payload). The database read is injected (`LoadUserRoleRows`), so the
 * SDK never imports an app db client.
 *
 * Tenant gate (assignmentApplies), given the token's active org:
 *  - org-scoped row (user_roles.org_id = active org): the role must be a global
 *    template (roles.org_id NULL) or that same org's own role.
 *  - system-scope row (user_roles.org_id NULL / legacy -1): counts ONLY for a
 *    true platform role (is_system_role). A global template assigned without an
 *    org must not grant its permissions in every org.
 *  - any other org: never. Inactive roles never count.
 *
 * No role-name checks anywhere: a role named "Admin" gets nothing for its name.
 */

export interface SessionRole {
  name: string;
  orgId: number | null;
  isSystemRole: boolean;
  isGlobalRole: boolean;
}

export interface SessionRbac {
  roles: SessionRole[];
  permissions: string[];
  /** True when an applied role is flagged is_system_role (platform staff). */
  isSystemUser: boolean;
}

export interface UserRoleRow {
  orgId: number | null;
  role: {
    name: string;
    orgId?: number | null;
    isActive?: boolean | null;
    isSystemRole?: boolean | null;
    isGlobalRole?: boolean | null;
    rolePermissions?: ReadonlyArray<{ permission?: { slug?: string | null } | null }> | null;
  } | null;
}

/**
 * Reads the user's ACTIVE user_roles rows (with role → rolePermissions →
 * permission) for `orgId` plus system scope (org_id NULL / -1). Must use the
 * privileged client (no org RLS context exists inside a jwt callback), and must
 * return org-scoped rows only while the user is an active org member of an
 * active org (see org_members.status) — pass `orgId = null` otherwise.
 */
export type LoadUserRoleRows = (userId: number, orgId: number | null) => Promise<ReadonlyArray<UserRoleRow>>;

export function assignmentApplies(row: UserRoleRow, activeOrgId: number | null): boolean {
  const role = row.role;
  if (!role || role.isActive === false) return false;
  const systemScope = row.orgId == null || row.orgId === -1;
  if (systemScope) return role.isSystemRole === true;
  if (activeOrgId == null || row.orgId !== activeOrgId) return false;
  return role.orgId == null || role.orgId === activeOrgId;
}

/** Pure: user_roles rows → session shape. */
export function buildSessionRbac(rows: ReadonlyArray<UserRoleRow>, activeOrgId: number | null): SessionRbac {
  const roles: SessionRole[] = [];
  const slugs = new Set<string>();
  for (const row of rows) {
    if (!row.role || !assignmentApplies(row, activeOrgId)) continue;
    roles.push({
      name: row.role.name,
      orgId: row.orgId,
      isSystemRole: row.role.isSystemRole === true,
      isGlobalRole: row.role.isGlobalRole === true,
    });
    for (const rp of row.role.rolePermissions ?? []) {
      const slug = rp.permission?.slug;
      if (slug) slugs.add(slug);
    }
  }
  return { roles, permissions: [...slugs], isSystemUser: roles.some((r) => r.isSystemRole) };
}

/**
 * How long a loaded permission set is trusted before the next request reloads
 * it. Bounded staleness: a revoked role stops working within this window.
 * Default = engage-app's current value (5 minutes). Caller-configurable.
 */
export const DEFAULT_RBAC_TTL_MS = 5 * 60 * 1000;

/** Claim names written onto the token. */
export interface SessionClaimKeys {
  /** The token's active org claim. Default `currentOrgId`. */
  org: string;
}

export const DEFAULT_SESSION_CLAIM_KEYS: SessionClaimKeys = { org: 'currentOrgId' };

export type SessionToken = Record<string, unknown>;

export function readTokenOrgId(token: SessionToken, keys: SessionClaimKeys = DEFAULT_SESSION_CLAIM_KEYS): number | null {
  const value = token[keys.org];
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return value != null && Number.isInteger(n) && n > 0 ? n : null;
}

/** True when the token's RBAC is missing, loaded for another org, or older than the TTL. */
export function needsRbacRefresh(
  token: SessionToken,
  opts: { now?: number; ttlMs?: number; keys?: SessionClaimKeys } = {},
): boolean {
  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs ?? DEFAULT_RBAC_TTL_MS;
  if (!Array.isArray(token.permissions)) return true;
  if ((token.rbacOrgId ?? null) !== readTokenOrgId(token, opts.keys)) return true;
  const loadedAt = typeof token.rbacLoadedAt === 'number' ? token.rbacLoadedAt : 0;
  return now - loadedAt >= ttlMs;
}

/**
 * Stamp roles + permissions onto the token. Never throws: a load failure
 * leaves an empty set (fail closed) and logs, so sign-in still completes.
 */
export async function stampSessionRbac(
  token: SessionToken,
  loadRows: LoadUserRoleRows,
  userId: number,
  orgId: number | null,
  now: number = Date.now(),
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  try {
    const rbac = buildSessionRbac(await loadRows(userId, orgId), orgId);
    token.roles = rbac.roles;
    token.permissions = rbac.permissions;
    token.isSystemUser = rbac.isSystemUser;
    token.rbacOrgId = orgId;
    token.rbacLoadedAt = now;
  } catch (err) {
    console.error('[auth] loading roles/permissions for the session failed', { userId, orgId, err });
    token.roles = [];
    token.permissions = [];
    token.isSystemUser = false;
    token.rbacOrgId = orgId;
    token.rbacLoadedAt = 0;
  }
}

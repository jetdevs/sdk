/**
 * Auth-provider-neutral jwt / session callback helpers.
 *
 * Wraps session-rbac + org-switch into the two calls every auth layer makes:
 *  - `refreshSessionClaims` — run on every token pass (NextAuth `jwt`
 *    callback, an OIDC session refresh, a cookie re-sign). Handles org switch
 *    (only when `trigger === 'update'`) and the RBAC TTL reload.
 *  - `toSessionUser` — copy the claims onto the client-visible session user.
 * The app injects its db reads; nothing here imports a db client.
 */
import type { OrgSwitchLookup } from './org-switch';
import { resolveSwitchedOrg } from './org-switch';
import type { LoadUserRoleRows, SessionClaimKeys, SessionRole, SessionToken } from './session-rbac';
import {
  DEFAULT_RBAC_TTL_MS,
  DEFAULT_SESSION_CLAIM_KEYS,
  needsRbacRefresh,
  readTokenOrgId,
  stampSessionRbac,
} from './session-rbac';

export interface RefreshSessionClaimsDeps {
  loadRows: LoadUserRoleRows;
  orgSwitch: OrgSwitchLookup;
}

export interface RefreshSessionClaimsOptions {
  userId: number;
  /** `'update'` = the client asked for a refresh after `userOrg.switchOrg`. */
  trigger?: 'signIn' | 'update' | 'refresh' | string;
  now?: number;
  /** Default DEFAULT_RBAC_TTL_MS (engage-app's current 5 minutes). */
  ttlMs?: number;
  keys?: SessionClaimKeys;
}

export interface RefreshSessionClaimsResult {
  orgSwitched: boolean;
  rbacReloaded: boolean;
}

/** Mutates `token`. Never throws on db failure (stampSessionRbac fails closed). */
export async function refreshSessionClaims(
  token: SessionToken,
  deps: RefreshSessionClaimsDeps,
  opts: RefreshSessionClaimsOptions,
): Promise<RefreshSessionClaimsResult> {
  const keys = opts.keys ?? DEFAULT_SESSION_CLAIM_KEYS;
  const now = opts.now ?? Date.now();
  let orgSwitched = false;

  if (opts.trigger === 'update') {
    try {
      const result = await resolveSwitchedOrg(deps.orgSwitch, opts.userId, readTokenOrgId(token, keys));
      if (result.switched) {
        token[keys.org] = result.orgId;
        orgSwitched = true;
      }
    } catch (err) {
      console.error('[auth] org switch lookup failed — keeping session org', { userId: opts.userId, err });
    }
  }

  const ttlMs = opts.ttlMs ?? DEFAULT_RBAC_TTL_MS;
  const stale = orgSwitched || opts.trigger === 'signIn' || needsRbacRefresh(token, { now, ttlMs, keys });
  if (stale) {
    await stampSessionRbac(token, deps.loadRows, opts.userId, readTokenOrgId(token, keys), now);
  }
  return { orgSwitched, rbacReloaded: stale };
}

export interface SessionUserClaims {
  id: number;
  currentOrgId: number | null;
  roles: SessionRole[];
  permissions: string[];
  isSystemUser: boolean;
}

/** Token → session user claims. Missing/garbled claims become the empty (deny) set. */
export function toSessionUser(
  token: SessionToken,
  userId: number,
  keys: SessionClaimKeys = DEFAULT_SESSION_CLAIM_KEYS,
): SessionUserClaims {
  const permissions = Array.isArray(token.permissions)
    ? (token.permissions as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  const roles = Array.isArray(token.roles) ? (token.roles as SessionRole[]) : [];
  return {
    id: userId,
    currentOrgId: readTokenOrgId(token, keys),
    roles,
    permissions,
    isSystemUser: token.isSystemUser === true,
  };
}

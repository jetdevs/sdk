/**
 * Org switch → session claim refresh.
 *
 * Ported from engage-app `src/server/auth/org-switch.ts`, Connect id mapping
 * removed. `userOrg.switchOrg` (SDK `modules/user-org`) checks access and
 * writes `users.current_org_id`; the client then asks the auth layer to
 * refresh its session (NextAuth `update()`, an OIDC refresh endpoint, ...).
 * `resolveSwitchedOrg` decides what the session org becomes on that pass.
 *
 * Never trusts the client: any refresh payload is ignored. The target is
 * re-read from the DB (`users.current_org_id`) and accepted only if the user
 * still holds an active role in that org AND is an active member of that
 * active org (the lookup's `hasActiveMembership`). Anything else keeps the
 * org the token already carries.
 */

export interface OrgSwitchLookup {
  /** users.current_org_id as last written by `userOrg.switchOrg`. */
  getCurrentOrgId(userId: number): Promise<number | null>;
  /** Active role in the org + org_members.status = 'active' + orgs.is_active. */
  hasActiveMembership(userId: number, orgId: number): Promise<boolean>;
  /** Writes users.current_org_id (privileged; caller has checked membership). */
  setCurrentOrgId(userId: number, orgId: number): Promise<void>;
}

export interface OrgSwitchResult {
  orgId: number | null;
  switched: boolean;
}

export async function resolveSwitchedOrg(
  lookup: OrgSwitchLookup,
  userId: number,
  currentOrgId: number | null,
): Promise<OrgSwitchResult> {
  const keep: OrgSwitchResult = { orgId: currentOrgId, switched: false };
  if (!Number.isInteger(userId) || userId <= 0) return keep;

  const target = await lookup.getCurrentOrgId(userId);
  if (target == null || target === currentOrgId) return keep;

  if (!(await lookup.hasActiveMembership(userId, target))) {
    console.warn('[auth] org switch refused — no active membership', { userId, target });
    return keep;
  }
  return { orgId: target, switched: true };
}

/**
 * Keep `users.current_org_id` equal to the token's org (SDK `auth.getCurrentUser`
 * reads the column). Writes only after the membership gate; never throws.
 * Returns true when the column now matches.
 */
export async function syncCurrentOrgId(
  lookup: OrgSwitchLookup,
  userId: number,
  tokenOrgId: number | null,
): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0 || tokenOrgId == null) return false;
  try {
    if ((await lookup.getCurrentOrgId(userId)) === tokenOrgId) return true;
    if (!(await lookup.hasActiveMembership(userId, tokenOrgId))) {
      console.warn('[auth] current_org_id sync skipped — no active membership', { userId, tokenOrgId });
      return false;
    }
    await lookup.setCurrentOrgId(userId, tokenOrgId);
    return true;
  } catch (err) {
    console.error('[auth] current_org_id sync failed', { userId, tokenOrgId, err });
    return false;
  }
}

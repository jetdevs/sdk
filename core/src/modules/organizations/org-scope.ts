/**
 * Org scope for handlers that accept an org id in their input.
 *
 * The router factory already refuses a foreign org before a handler runs.
 * These handlers repeat the check against the ACTOR, not against
 * `service.orgId`: `service.orgId` is the org the request already runs in, so
 * comparing the input with it can never fail once a layer above has honoured
 * the client's value.
 */

interface OrgScopeActor {
  isSystemUser?: boolean;
  orgId?: number | null;
  effectiveOrgId?: number | null;
}

/**
 * True when `inputOrgId` names an org the actor may not act in: the actor is
 * not a platform system user and the org is not its own (the org a custom
 * domain locks it to, else its session org).
 */
export function namesForeignOrg(
  inputOrgId: number | null | undefined,
  actor: OrgScopeActor | null | undefined
): boolean {
  if (inputOrgId == null) {
    return false;
  }
  if (actor?.isSystemUser === true) {
    return false;
  }
  const ownOrgId = actor?.effectiveOrgId ?? actor?.orgId ?? null;
  return inputOrgId !== ownOrgId;
}

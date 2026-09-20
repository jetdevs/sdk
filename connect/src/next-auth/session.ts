import type { ConnectUserinfo } from '../types/index.js'

/**
 * Map Connect OIDC claims onto the NextAuth JWT token in the `jwt` callback.
 * Only acts for the Connect provider — pass `providerId` to match the id you
 * configured on `ConnectProvider` (defaults to `'connect'`). Copies canonical
 * org_id / org_role / sub so they survive into the session callback, plus the
 * issuer and the p79 epoch claims (specs.md §10.3). org_id may be ABSENT
 * (system/global users), and so may the epoch claims.
 *
 * Epoch keys are namespaced `connect*` on the token because the RP's JWT is a
 * shared namespace; on the `user` object returned by the profile callback they
 * keep their wire names.
 */
export function mapConnectClaimsToToken(
  token: Record<string, unknown>,
  args: {
    account?: { provider?: string } | null
    profile?: (ConnectUserinfo & { org_id?: number; org_role?: string }) | null
    /** Provider id to match — defaults to `'connect'`. */
    providerId?: string
    /**
     * Issuer to record when the profile omits `iss` — pass the same `baseUrl`
     * given to `ConnectProvider`, so the token carries the whole
     * `(issuer, sub)` pair (specs.md §5).
     */
    issuer?: string
  },
): void {
  if (args.account?.provider !== (args.providerId ?? 'connect')) return
  const profile = args.profile
  if (!profile) return
  if (profile.sub != null) token.connectSub = String(profile.sub)
  const orgId = (profile as { org_id?: number }).org_id
  if (orgId != null) token.connectOrgId = orgId
  const orgRole = (profile as { org_role?: string }).org_role
  if (orgRole != null) token.connectOrgRole = orgRole
  // specs.md §10.3 — the epoch reaches no further than this callback unless it
  // is copied here, and without it no authenticated transport of the
  // authentication-time credential version exists.
  const issuer = profile.iss ?? args.issuer
  if (issuer != null) token.connectIssuer = issuer
  if (profile.cv != null) token.connectCv = profile.cv
  if (profile.aeid != null) token.connectAeid = profile.aeid
  const grantId = profile.grant_id ?? profile.grantId
  if (grantId != null) token.connectGrantId = grantId
}

/**
 * Apply the resolved LOCAL org id onto the session in the `session` callback.
 * The caller maps canonical token.connectOrgId → local org id (via the RP's
 * orgs.connect_org_id) BEFORE calling this. When localOrgId is null (system/global
 * or unmapped), currentOrgId is left unset.
 */
export function applyConnectOrgToSession(
  session: { user?: Record<string, unknown> },
  args: { localOrgId: number | null; orgRole: string | null },
): void {
  if (!session.user) return
  if (args.localOrgId != null) {
    session.user.currentOrgId = args.localOrgId
    session.user.orgId = args.localOrgId
  }
  if (args.orgRole != null) session.user.connectOrgRole = args.orgRole
}

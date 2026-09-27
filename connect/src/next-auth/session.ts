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
 *
 * ABSENCE IS AN ASSERTION. When a Connect profile arrives carrying no epoch
 * claim, the matching token key is DELETED rather than left as it was. A token
 * that keeps a `connectCv` the IdP has stopped asserting is a stale epoch
 * surviving a re-authentication, which is exactly the fail-open this epoch
 * exists to close. The `connect*` identity and org keys are deliberately NOT
 * treated this way: they are resolved state, not an enforcement input, and
 * clearing an org on a profile that merely omitted it would sign a user out of
 * their org.
 *
 * This reads the `profile` NextAuth hands the `jwt` callback. Feeding the epoch
 * from an introspection response instead is an open STORY-010/014 decision, not
 * an oversight — reopening it costs this function's `profile` argument, the
 * `IntrospectionResponse` type in `../types/index.js` (which has no epoch
 * fields today) and the tests below; it does not cost the token key names,
 * which are the consumer-facing contract either way.
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
  // Configuration first, the payload only as a fallback for a caller that
  // passed no `issuer` — the same rule `ConnectProvider` applies to
  // `connectIssuer` (an issuer read off the response body is not a trust
  // anchor).
  const issuer = args.issuer ?? profile.iss
  if (issuer != null) token.connectIssuer = issuer
  // specs.md §10.3 — the epoch reaches no further than this callback unless it
  // is copied here, and without it no authenticated transport of the
  // authentication-time credential version exists. Set-or-delete per key: see
  // ABSENCE IS AN ASSERTION above.
  if (profile.cv != null) token.connectCv = profile.cv
  else delete token.connectCv
  if (profile.aeid != null) token.connectAeid = profile.aeid
  else delete token.connectAeid
  const grantId = profile.grant_id ?? profile.grantId
  if (grantId != null) token.connectGrantId = grantId
  else delete token.connectGrantId
}

/**
 * Apply the resolved LOCAL org id onto the session in the `session` callback.
 * The caller maps canonical token.connectOrgId → local org id (via the RP's
 * orgs.connect_org_id) BEFORE calling this. When localOrgId is null (system/global
 * or unmapped), currentOrgId is left unset.
 *
 * The epoch claims are deliberately NOT copied onto the session, and adding
 * them would be a regression rather than a completion. The NextAuth session is
 * client-readable; the epoch is a server-side enforcement input, and a value a
 * client can read is a value a client can be tempted to trust. It stays on the
 * JWT, where `mapConnectClaimsToToken` puts it.
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

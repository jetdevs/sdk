import type { ConnectUserinfo } from '../types/index.js'

/**
 * Map Yobo Connect OIDC claims onto the NextAuth JWT token in the `jwt` callback.
 * Only acts for the `yobo-connect` provider. Copies canonical org_id / org_role / sub
 * so they survive into the session callback. org_id may be ABSENT (system/global users).
 */
export function mapConnectClaimsToToken(
  token: Record<string, unknown>,
  args: {
    account?: { provider?: string } | null
    profile?: (ConnectUserinfo & { org_id?: number; org_role?: string }) | null
  },
): void {
  if (args.account?.provider !== 'yobo-connect') return
  const profile = args.profile
  if (!profile) return
  if (profile.sub != null) token.connectSub = String(profile.sub)
  const orgId = (profile as { org_id?: number }).org_id
  if (orgId != null) token.connectOrgId = orgId
  const orgRole = (profile as { org_role?: string }).org_role
  if (orgRole != null) token.connectOrgRole = orgRole
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

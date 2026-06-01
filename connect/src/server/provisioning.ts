/**
 * Server-side client for a relying party to provision canonical identities,
 * orgs, and memberships into the Connect IdP over its internal
 * provisioning API. Authenticated with a per-RP `X-Internal-API-Key`.
 *
 * This is the "app-driven, synced" provisioning model (Approach 1): when an RP
 * creates a user / org / invite locally, it mirrors that into the canonical
 * directory so returning logins via Connect SSO resolve a stable
 * `org_id` claim. All endpoints are idempotent — safe to retry.
 *
 * SERVER ONLY — never import from client/browser code (it carries the internal
 * API key). Lives in `@jetdevs/connect/server`.
 */

/** Org-level platform role carried on a membership (distinct from local RBAC). */
export type OrgPlatformRole = 'owner' | 'admin' | 'member'

/** Membership lifecycle state in the canonical directory. */
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'removed'

/**
 * The relying party a canonical org originated from (C5 keying). A free-form
 * key chosen by each RP to identify itself (e.g. its app slug). Kept as `string`
 * so the SDK is not coupled to any specific set of consuming applications.
 */
export type SourceSystem = string

export interface ConnectProvisioningConfig {
  /** Base URL of the Connect IdP (no trailing slash required). */
  baseUrl: string
  /** Per-RP internal API key (sent as `X-Internal-API-Key`). */
  internalApiKey: string
  /** Injectable for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export class ConnectProvisioningClient {
  private readonly baseUrl: string
  private readonly key: string
  private readonly fetchImpl: typeof fetch

  constructor(config: ConnectProvisioningConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.key = config.internalApiKey
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': this.key,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = typeof res.text === 'function' ? await res.text() : ''
      throw new Error(`[connect-provisioning] ${path} failed: ${res.status} ${detail}`)
    }
    return (await res.json()) as T
  }

  findOrCreateUser(args: { email: string; name?: string; image?: string }) {
    return this.post<{ sub: string; created: boolean }>(
      '/api/internal/users/find-or-create',
      args,
    )
  }

  // C5: canonical orgs are keyed on (sourceSystem, sourceOrgRef) — never slug.
  findOrCreateOrg(args: { name: string; sourceSystem: SourceSystem; sourceOrgRef: string }) {
    return this.post<{ orgId: number; created: boolean }>(
      '/api/internal/orgs/find-or-create',
      args,
    )
  }

  upsertMembership(args: {
    sub: string
    orgId: number
    status?: MembershipStatus
    role?: OrgPlatformRole
  }) {
    return this.post<{ membership: unknown }>(
      '/api/internal/memberships/upsert',
      args,
    )
  }

  // C4: clientId is NOT sent — the caller is identified by its per-RP key.
  // Called at ACCEPTANCE / first login (Task 20), never at invite time (C2).
  setClientOrgBinding(args: { sub: string; orgId: number }) {
    return this.post<{ ok: boolean }>(
      '/api/internal/client-org-binding/set',
      args,
    )
  }

  /**
   * C3: make a provisioned canonical user *loginable* via Connect SSO.
   * Provisioning a user (find-or-create + membership) is NOT enough — the IdP's
   * signIn guard rejects a user with no login role, and `users.password` stays
   * NULL. This sets a credential (NON-CLOBBERING) and/or grants the minimal
   * org-scoped "Connect User" login role on `orgId`. At least one of
   * password/orgId is required; both optional so the onboarding wizard can call
   * it at register time (credential, org not created yet) and again at finalize
   * (orgId → login role). Idempotent.
   */
  setCredentialAndLoginRole(args: { sub: string; password?: string; orgId?: number }) {
    return this.post<{ credentialSet: boolean; loginRoleGranted: boolean }>(
      '/api/internal/credentials/set',
      args,
    )
  }

  /**
   * C2: invite-time provisioning is user → org → membership(status='active')
   * ONLY. The per-client org binding is NOT written here — it is set at
   * acceptance / first login (Task 20) once the membership is `active`, so a
   * second invite can never silently rebind an already-active user.
   * Returns the canonical sub + canonical org id; the RP stores these as
   * connect_sub / connect_org_id and binds the pending app role locally.
   */
  async provisionInvite(args: {
    email: string
    name?: string
    orgName: string
    sourceSystem: SourceSystem
    sourceOrgRef: string
    role?: OrgPlatformRole
  }): Promise<{ sub: string; canonicalOrgId: number }> {
    const user = await this.findOrCreateUser({ email: args.email, name: args.name })
    const org = await this.findOrCreateOrg({
      name: args.orgName,
      sourceSystem: args.sourceSystem,
      sourceOrgRef: args.sourceOrgRef,
    })
    await this.upsertMembership({
      sub: user.sub,
      orgId: org.orgId,
      status: 'active', // C2: app-driven grant; the invite UX is the gate.
      role: args.role ?? 'member',
    })
    // NO setClientOrgBinding here (C2) — the binding is set at first login.
    return { sub: user.sub, canonicalOrgId: org.orgId }
  }
}

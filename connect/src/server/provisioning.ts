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
 * The relying party a canonical org originated from (C5 keying).
 * A source system: a key of the IdP's `connect_source_systems` registry
 * (p77 STORY-041), validated at runtime (`isSourceSystemKey`). The historical
 * union survives as the deprecated `KnownSourceSystem`.
 */
export type SourceSystem = string
export type { KnownSourceSystem } from '../adapter/index.js'

/** `POST /api/internal/connect/identity/register` (p77 D25) — the RP's local user ref for a Connect subject. */
export interface RegisterIdentityArgs {
  /** The numeric Connect subject (`users.connect_sub`). */
  sub: string
  /** The RP's own local user id (`users.id`), as a string. */
  sourceUserRef: string
}
export interface RegisterIdentityResult {
  /** true = 201 (the mapping row was inserted); false = 200 (already mapped to this subject — idempotent). */
  created: boolean
}

/**
 * Every answer from `identity/register` that is not a 200/201 `{ ok: true }`.
 * `code` is the route's `error` string (`ref_conflict`, `subject_unknown`,
 * `subject_inactive`, `invalid_body`, `unauthorized`, `scope_not_permitted`,
 * `source_system_not_permitted`, `db_unavailable`), or `unreachable` (no HTTP
 * answer) / `unexpected` (an answer outside the contract, a 2xx included).
 */
export type RegisterIdentityErrorCode =
  | 'ref_conflict'
  | 'subject_unknown'
  | 'subject_inactive'
  | 'invalid_body'
  | 'unauthorized'
  | 'scope_not_permitted'
  | 'source_system_not_permitted'
  | 'db_unavailable'
  | 'unreachable'
  | 'unexpected'

const REGISTER_ERROR_CODES: ReadonlySet<string> = new Set<RegisterIdentityErrorCode>([
  'ref_conflict',
  'subject_unknown',
  'subject_inactive',
  'invalid_body',
  'unauthorized',
  'scope_not_permitted',
  'source_system_not_permitted',
  'db_unavailable',
])

export class ConnectIdentityRegisterError extends Error {
  readonly kind = 'connect_identity_register_error' as const
  constructor(
    readonly code: RegisterIdentityErrorCode,
    /** HTTP status; 0 when Connect gave no answer. */
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `[connect-provisioning] identity/register refused: ${status} ${code}`)
    this.name = 'ConnectIdentityRegisterError'
  }
}

/**
 * Duck-typed (never `instanceof`: tsup bundles each entry unsplit, so a class
 * can exist in two copies — STORY-001/b). True for any register refusal.
 */
export function isConnectIdentityRegisterError(err: unknown): err is ConnectIdentityRegisterError {
  return (err as { kind?: unknown } | null)?.kind === 'connect_identity_register_error'
}
/** `409 ref_conflict`: the RP's ref is mapped to ANOTHER Connect user — logged, never rebound (D25). */
export function isIdentityRefConflict(err: unknown): boolean {
  return isConnectIdentityRegisterError(err) && err.code === 'ref_conflict'
}

export interface ConnectProvisioningConfig {
  /** Base URL of the Connect IdP (no trailing slash required). */
  baseUrl: string
  /** Per-RP internal API key (sent as `X-Internal-API-Key`). */
  internalApiKey: string
  /** Injectable for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Per-request budget for `registerIdentity`, ms (default 10 000). */
  registerTimeoutMs?: number
}

export class ConnectProvisioningClient {
  private readonly baseUrl: string
  private readonly key: string
  private readonly fetchImpl: typeof fetch

  private readonly registerTimeoutMs: number

  constructor(config: ConnectProvisioningConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.key = config.internalApiKey
    this.fetchImpl = config.fetchImpl ?? fetch
    this.registerTimeoutMs = config.registerTimeoutMs ?? 10_000
  }

  /**
   * p77 D25 — register `(this RP's system, sourceUserRef) → sub` in Connect's
   * `rp_identity_map`, after the RP's local commit that stamped the pair.
   * Scope `identity:register` on the RP's key; never an operator token.
   *
   * DEFAULT-DENY: resolves ONLY for a 200/201 whose body is `{ ok: true }`.
   * Every other outcome throws `ConnectIdentityRegisterError` — a 2xx outside
   * the contract (`unexpected`), a network failure or timeout (`unreachable`),
   * and every refusal by its route code. `409 ref_conflict` is the one the
   * caller must log and never "fix" by rebinding (`isIdentityRefConflict`).
   * The RP stamps `users.connect_mapped_at` only on a resolved call; anything
   * else leaves the row for the `sweep-mappings` retry.
   */
  async registerIdentity(args: RegisterIdentityArgs): Promise<RegisterIdentityResult> {
    const path = '/api/internal/connect/identity/register'
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Internal-API-Key': this.key,
        },
        body: JSON.stringify({ sub: args.sub, sourceUserRef: args.sourceUserRef }),
        signal: AbortSignal.timeout(this.registerTimeoutMs),
      })
    } catch (err) {
      throw new ConnectIdentityRegisterError(
        'unreachable',
        0,
        `[connect-provisioning] identity/register unreachable: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    const body = (json ?? {}) as { ok?: unknown; created?: unknown; error?: unknown }
    if ((res.status === 200 || res.status === 201) && body.ok === true) {
      return { created: res.status === 201 }
    }
    const code =
      typeof body.error === 'string' && REGISTER_ERROR_CODES.has(body.error) && !(res.status >= 200 && res.status < 300)
        ? (body.error as RegisterIdentityErrorCode)
        : 'unexpected'
    throw new ConnectIdentityRegisterError(code, res.status)
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

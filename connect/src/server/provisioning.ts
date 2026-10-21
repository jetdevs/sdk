/**
 * Server-side client for a relying party to provision canonical identities,
 * orgs, and memberships into the Connect IdP over its internal
 * provisioning API. Authenticated with a per-RP `X-Internal-API-Key`.
 *
 * This is the "app-driven, synced" provisioning model (Approach 1): when an RP
 * creates a user / org / invite locally, it mirrors that into the canonical
 * directory so returning logins via Connect SSO resolve a stable
 * `org_id` claim. Onboarding proof exchange is one-use; never retry it.
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

/** Retire this RP's exact local reference while preserving the canonical identity. */
export interface DisconnectApplicationIdentityArgs {
  /** Canonical positive signed 32-bit Connect subject, without leading zeroes. */
  sub: string
  /** Nonblank RP-local user reference, at most 64 characters; never normalized. */
  sourceUserRef: string
}

export interface DisconnectApplicationIdentityResult {
  status: 'disconnected' | 'already_disconnected'
  sub: string
  sourceUserRef: string
  canonicalIdentityPreserved: true
  counts: {
    grantsRevoked: number
    clientBindingsCleared: number
    mappingsRetired: number
  }
}

export type DisconnectApplicationIdentityErrorCode =
  | RegisterIdentityErrorCode
  | 'mapping_unknown'
  | 'client_mismatch'
  | 'maintenance'
  | 'timeout'

const DISCONNECT_ERROR_CODES: ReadonlySet<string> = new Set([
  ...REGISTER_ERROR_CODES,
  'mapping_unknown',
  'client_mismatch',
  'maintenance',
])

export class ConnectIdentityDisconnectError extends Error {
  readonly kind = 'connect_identity_disconnect_error' as const
  constructor(
    readonly code: DisconnectApplicationIdentityErrorCode,
    /** HTTP status; 0 when no HTTP response was received or input is invalid. */
    readonly status: number,
  ) {
    super(`[connect-provisioning] identity/disconnect refused: ${status} ${code}`)
    this.name = 'ConnectIdentityDisconnectError'
  }
}

/** Duck-typed for independently bundled server entrypoints, like register errors. */
export function isConnectIdentityDisconnectError(err: unknown): err is ConnectIdentityDisconnectError {
  return (err as { kind?: unknown } | null)?.kind === 'connect_identity_disconnect_error'
}

export interface PrepareOnboardingIdentityArgs {
  state: string
  nonce: string
  codeChallenge: string
  expectedEmail?: string
  method?: 'password' | 'google'
  preflight?: boolean
}

export type PrepareOnboardingIdentityResult =
  | { kind: 'not_required' }
  | { kind: 'required'; authorizationUrl: string; expiresIn: number }

export interface ExchangeOnboardingIdentityArgs {
  code: string
  codeVerifier: string
  nonce: string
  state: string
  redirectUri: string
}

/** Identity evidence only: no OIDC tokens, roles or organization claims. */
export interface ExchangeOnboardingIdentityResult {
  issuer: string
  sub: string
  email: string
  emailVerified: boolean
  name?: string
  nonce: string
  state: string
  clientId: string
}

export type OnboardingIdentityErrorCode =
  | 'invalid_body' | 'unauthorized' | 'scope_not_permitted' | 'source_system_not_permitted'
  | 'client_mismatch' | 'subject_unknown' | 'subject_inactive' | 'email_mismatch'
  | 'identity_changed' | 'invalid_proof' | 'request_expired' | 'already_used'
  | 'request_mismatch' | 'maintenance' | 'db_unavailable'
  | 'timeout' | 'unreachable' | 'unexpected'

const ONBOARDING_ERROR_CODES: ReadonlySet<string> = new Set<OnboardingIdentityErrorCode>([
  'invalid_body', 'unauthorized', 'scope_not_permitted', 'source_system_not_permitted',
  'client_mismatch', 'subject_unknown', 'subject_inactive', 'email_mismatch',
  'identity_changed', 'invalid_proof', 'request_expired', 'already_used',
  'request_mismatch', 'maintenance', 'db_unavailable',
])

export class ConnectOnboardingIdentityError extends Error {
  readonly kind = 'connect_onboarding_identity_error' as const
  constructor(
    readonly code: OnboardingIdentityErrorCode,
    /** HTTP status; 0 for invalid local input or no HTTP response. */
    readonly status: number,
  ) {
    super(`[connect-provisioning] onboarding identity refused: ${status} ${code}`)
    this.name = 'ConnectOnboardingIdentityError'
  }
}

/** Duck-typed for independently bundled server entrypoints. */
export function isConnectOnboardingIdentityError(err: unknown): err is ConnectOnboardingIdentityError {
  return (err as { kind?: unknown } | null)?.kind === 'connect_onboarding_identity_error'
}

function isOnboardingToken(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && !/[^A-Za-z0-9_-]/u.test(value)
}

function isOnboardingEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && !/[\u0000-\u001f\u007f]/u.test(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
}

function onboardingUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || !/^https?:\/\//u.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value) || value.includes('#')) return undefined
  try {
    const url = new URL(value)
    if (url.username || url.password) return undefined
    return url
  } catch {
    return undefined
  }
}

export interface GetClientOrgBindingArgs {
  sub: string
}

export interface GetClientOrgBindingResult {
  sub: string
  orgId: number | null
}

export type ClientOrgBindingErrorCode =
  | 'invalid_body' | 'unauthorized' | 'scope_not_permitted' | 'unknown_client'
  | 'db_unavailable' | 'timeout' | 'unreachable' | 'unexpected'

const BINDING_ERROR_CODES: ReadonlySet<string> = new Set([
  'invalid_body', 'unauthorized', 'scope_not_permitted', 'unknown_client', 'db_unavailable',
])

export class ConnectClientOrgBindingError extends Error {
  readonly kind = 'connect_client_org_binding_error' as const
  constructor(readonly code: ClientOrgBindingErrorCode, readonly status: number) {
    super(`[connect-provisioning] client-org-binding/get refused: ${status} ${code}`)
    this.name = 'ConnectClientOrgBindingError'
  }
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
  /** Per-request budget for `disconnectApplicationIdentity`, ms (default 10 000). */
  disconnectTimeoutMs?: number
  /** Per-request budget for the two onboarding identity methods, ms (default 10 000). */
  onboardingTimeoutMs?: number
}

export class ConnectProvisioningClient {
  private readonly baseUrl: string
  private readonly key: string
  private readonly fetchImpl: typeof fetch

  private readonly registerTimeoutMs: number
  private readonly disconnectTimeoutMs: number
  private readonly onboardingTimeoutMs: number

  constructor(config: ConnectProvisioningConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.key = config.internalApiKey
    this.fetchImpl = config.fetchImpl ?? fetch
    this.registerTimeoutMs = config.registerTimeoutMs ?? 10_000
    this.disconnectTimeoutMs = config.disconnectTimeoutMs ?? 10_000
    this.onboardingTimeoutMs = config.onboardingTimeoutMs ?? 10_000
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

  /**
   * Requires the RP key's `identity:disconnect` scope. No automatic retries.
   * Resolves only for HTTP 200 with a validated exact sub/ref echo; every other
   * outcome throws ConnectIdentityDisconnectError with a stable code/status.
   */
  async disconnectApplicationIdentity(args: DisconnectApplicationIdentityArgs): Promise<DisconnectApplicationIdentityResult> {
    const sub = args?.sub
    const sourceUserRef = args?.sourceUserRef
    if (
      typeof sub !== 'string' || !/^[1-9]\d*$/.test(sub) || Number(sub) > 2_147_483_647 ||
      typeof sourceUserRef !== 'string' || !sourceUserRef.trim() || sourceUserRef.length > 64
    ) {
      throw new ConnectIdentityDisconnectError('invalid_body', 0)
    }
    let res: Response
    let signal: AbortSignal | undefined
    try {
      signal = AbortSignal.timeout(this.disconnectTimeoutMs)
      res = await this.fetchImpl(`${this.baseUrl}/api/internal/connect/identity/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Internal-API-Key': this.key,
        },
        body: JSON.stringify({ sub, sourceUserRef }),
        signal,
      })
    } catch {
      throw new ConnectIdentityDisconnectError(signal?.aborted ? 'timeout' : 'unreachable', 0)
    }
    let json: unknown
    try {
      json = await res.json()
    } catch {
      throw new ConnectIdentityDisconnectError(signal.aborted ? 'timeout' : 'unexpected', res.status)
    }
    const body = (json ?? {}) as Partial<DisconnectApplicationIdentityResult> & { error?: unknown }
    const counts = body.counts
    if (
      res.status === 200 && (body.status === 'disconnected' || body.status === 'already_disconnected') &&
      body.sub === sub && body.sourceUserRef === sourceUserRef && body.canonicalIdentityPreserved === true &&
      counts && [counts.grantsRevoked, counts.clientBindingsCleared, counts.mappingsRetired].every(
        (count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0,
      )
    ) {
      return body as DisconnectApplicationIdentityResult
    }
    const code =
      !(res.status >= 200 && res.status < 300) && typeof body.error === 'string' && DISCONNECT_ERROR_CODES.has(body.error)
        ? (body.error as DisconnectApplicationIdentityErrorCode)
        : 'unexpected'
    throw new ConnectIdentityDisconnectError(code, res.status)
  }

  /** Requires the RP key's `onboarding:identity` scope. No automatic retries. */
  async prepareOnboardingIdentity(args: PrepareOnboardingIdentityArgs): Promise<PrepareOnboardingIdentityResult> {
    const state = args?.state
    const nonce = args?.nonce
    const codeChallenge = args?.codeChallenge
    const expectedEmail = args?.expectedEmail
    const method = args?.method
    const preflight = args?.preflight
    if (
      !args || typeof args !== 'object' || Array.isArray(args) || !isOnboardingToken(state, 32, 128) || !isOnboardingToken(nonce, 32, 128) ||
      !isOnboardingToken(codeChallenge, 43, 43) || (expectedEmail !== undefined && !isOnboardingEmail(expectedEmail)) ||
      (method !== undefined && method !== 'password' && method !== 'google') ||
      (preflight !== undefined && typeof preflight !== 'boolean') || (preflight === true && expectedEmail === undefined)
    ) throw new ConnectOnboardingIdentityError('invalid_body', 0)
    const body = await this.callOnboardingIdentity('prepare', { state, nonce, codeChallenge, expectedEmail, method, preflight })
    if (body.kind === 'not_required' && preflight === true) return { kind: 'not_required' }
    const url = onboardingUrl(body.authorizationUrl)
    if (
      body.kind === 'required' && url && url.origin === new URL(this.baseUrl).origin &&
      url.pathname === '/api/connect/onboarding/authorize' &&
      Array.from(url.searchParams.keys()).length === 1 && !!url.searchParams.get('request')?.trim() &&
      typeof body.expiresIn === 'number' && Number.isSafeInteger(body.expiresIn) && body.expiresIn >= 1 && body.expiresIn <= 600
    ) return { kind: 'required', authorizationUrl: body.authorizationUrl as string, expiresIn: body.expiresIn }
    throw new ConnectOnboardingIdentityError('unexpected', 200)
  }

  /** Consumes a one-use proof; returns sanitized identity evidence, never business tokens. */
  async exchangeOnboardingIdentity(args: ExchangeOnboardingIdentityArgs): Promise<ExchangeOnboardingIdentityResult> {
    const code = args?.code
    const codeVerifier = args?.codeVerifier
    const nonce = args?.nonce
    const state = args?.state
    const redirectUri = args?.redirectUri
    const callback = onboardingUrl(redirectUri)
    if (
      !args || typeof args !== 'object' || Array.isArray(args) || typeof code !== 'string' || code.length !== 64 || /[^a-fA-F0-9]/u.test(code) ||
      !isOnboardingToken(codeVerifier, 43, 128) || !isOnboardingToken(nonce, 32, 128) || !isOnboardingToken(state, 32, 128) ||
      !callback || (callback.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname))
    ) throw new ConnectOnboardingIdentityError('invalid_body', 0)
    const body = await this.callOnboardingIdentity('exchange', { code, codeVerifier, nonce, state, redirectUri })
    if (
      body.issuer === this.baseUrl && typeof body.sub === 'string' && /^[1-9][0-9]*$/u.test(body.sub) &&
      !/\s/u.test(body.sub) && Number(body.sub) <= 2_147_483_647 && isOnboardingEmail(body.email) &&
      typeof body.emailVerified === 'boolean' && body.nonce === nonce && body.state === state &&
      typeof body.clientId === 'string' && !!body.clientId.trim() && (body.name === undefined || typeof body.name === 'string')
    ) {
      return {
        issuer: body.issuer, sub: body.sub, email: body.email, emailVerified: body.emailVerified,
        ...(body.name === undefined ? {} : { name: body.name }), nonce, state, clientId: body.clientId,
      }
    }
    throw new ConnectOnboardingIdentityError('unexpected', 200)
  }

  private async callOnboardingIdentity(path: 'prepare' | 'exchange', input: object): Promise<Record<string, unknown>> {
    let res: Response
    let signal: AbortSignal | undefined
    try {
      signal = AbortSignal.timeout(this.onboardingTimeoutMs)
      res = await this.fetchImpl(`${this.baseUrl}/api/internal/connect/onboarding/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Internal-API-Key': this.key },
        body: JSON.stringify(input),
        signal,
        redirect: 'error',
      })
    } catch {
      throw new ConnectOnboardingIdentityError(signal?.aborted ? 'timeout' : 'unreachable', 0)
    }
    let json: unknown
    try {
      json = await res.json()
    } catch {
      throw new ConnectOnboardingIdentityError(signal.aborted ? 'timeout' : 'unexpected', res.status)
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new ConnectOnboardingIdentityError('unexpected', res.status)
    const body = json as Record<string, unknown>
    if (res.status === 200) return body
    const code = !(res.status >= 200 && res.status < 300) && typeof body.error === 'string' && ONBOARDING_ERROR_CODES.has(body.error)
      ? body.error as OnboardingIdentityErrorCode : 'unexpected'
    throw new ConnectOnboardingIdentityError(code, res.status)
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

  /** Reads only this caller's selected-org binding; requires `provisioning`. No retries. */
  async getClientOrgBinding(args: GetClientOrgBindingArgs): Promise<GetClientOrgBindingResult> {
    const sub = args?.sub
    if (typeof sub !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(sub) || /\s/u.test(sub) || Number(sub) > 2_147_483_647) {
      throw new ConnectClientOrgBindingError('invalid_body', 0)
    }
    let res: Response
    let signal: AbortSignal | undefined
    try {
      signal = AbortSignal.timeout(10_000)
      res = await this.fetchImpl(`${this.baseUrl}/api/internal/client-org-binding/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Internal-API-Key': this.key },
        body: JSON.stringify({ sub }), signal, redirect: 'error',
      })
    } catch {
      throw new ConnectClientOrgBindingError(signal?.aborted ? 'timeout' : 'unreachable', 0)
    }
    let json: unknown
    try {
      json = await res.json()
    } catch {
      throw new ConnectClientOrgBindingError(signal.aborted ? 'timeout' : 'unexpected', res.status)
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new ConnectClientOrgBindingError('unexpected', res.status)
    const body = json as Record<string, unknown>
    if (res.status === 200 && body.sub === sub && (body.orgId === null || (
      typeof body.orgId === 'number' && Number.isInteger(body.orgId) && body.orgId > 0 && body.orgId <= 2_147_483_647
    ))) return { sub, orgId: body.orgId }
    const code = !(res.status >= 200 && res.status < 300) && typeof body.error === 'string' && BINDING_ERROR_CODES.has(body.error)
      ? body.error as ClientOrgBindingErrorCode : 'unexpected'
    throw new ConnectClientOrgBindingError(code, res.status)
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
   * @deprecated p131 (Connect-owned invites): creating a user + an ACTIVE
   * membership at invite time violates I2 ("an invite creates no account").
   * Use `InvitesClient` (below) against the Connect invites API
   * (`@jetdevs/core/invites`); the account is created only on accept, on
   * Connect. Spec: `_context/cadra/_specs/p131-connect-invites/`
   * (implementation.md P19). Kept for existing callers only.
   *
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

// ---------------------------------------------------------------------------
// p131 — Connect-owned invites, RP side.
// ---------------------------------------------------------------------------

/** What the RP sends to create an invite (P5/P6/P7). No password field, ever (I1). */
export interface CreateConnectInviteArgs {
  email: string
  /** The RP's role id, stored opaque on Connect (P6). */
  roleRef: string
  roleName: string
  sourceOrgRef: string
  orgName: string
  invitedBySub: string
  invitedByName?: string | null
  /** Where Connect sends the person after accept; origin must be a registered redirect origin (P7). */
  appUrl: string
}

export interface CreateConnectInviteResult {
  id: number
  status: ConnectInviteStatus
  expiresAt: string
  connectOrgId: number
  emailSent: boolean
  superseded: boolean
}

export type ConnectInviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired'

export interface ConnectInvite {
  id: number
  email: string
  roleRef: string
  roleName: string
  status: ConnectInviteStatus
  invitedBySub: string
  invitedByName: string | null
  expiresAt: string
  createdAt: string
  acceptedAt: string | null
  cancelledAt: string | null
  provisionState: 'none' | 'pending' | 'done' | 'refused'
}

/** A non-2xx answer from the Connect invites API. `code` is the route's `error` string. */
export class ConnectInvitesError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`[connect-invites] ${status} ${code}`)
    this.name = 'ConnectInvitesError'
  }
}

export interface InvitesClientConfig {
  baseUrl: string
  /** Per-RP internal API key (sent as `X-Internal-API-Key`; needs scope `invites:write`). */
  internalApiKey: string
  fetchImpl?: typeof fetch
  /** Per-request budget, ms (default 10 000). */
  timeoutMs?: number
}

/**
 * Calls Connect's invites API (`@jetdevs/core/invites` handlers mounted at
 * `/api/internal/invites`). The caller (client id + source system) is derived
 * by Connect from the key — never sent. I1: no method accepts or sends a
 * password; request bodies are built from an explicit field list, so a stray
 * `password` on the args object is dropped.
 */
export class InvitesClient {
  private readonly baseUrl: string
  private readonly key: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(config: InvitesClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.key = config.internalApiKey
    this.fetchImpl = config.fetchImpl ?? fetch
    this.timeoutMs = config.timeoutMs ?? 10_000
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-Internal-API-Key': this.key,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      throw new ConnectInvitesError(0, err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unreachable')
    }
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    if (!res.ok) {
      const code = json && typeof (json as { error?: unknown }).error === 'string' ? (json as { error: string }).error : 'unexpected'
      throw new ConnectInvitesError(res.status, code)
    }
    if (json === null || typeof json !== 'object') throw new ConnectInvitesError(res.status, 'unexpected')
    return json as T
  }

  create(args: CreateConnectInviteArgs): Promise<CreateConnectInviteResult> {
    return this.call('POST', '/api/internal/invites', {
      email: args.email,
      roleRef: args.roleRef,
      roleName: args.roleName,
      sourceOrgRef: args.sourceOrgRef,
      orgName: args.orgName,
      invitedBySub: args.invitedBySub,
      invitedByName: args.invitedByName ?? null,
      appUrl: args.appUrl,
    })
  }

  async list(sourceOrgRef: string): Promise<ConnectInvite[]> {
    const r = await this.call<{ invites?: ConnectInvite[] }>(
      'GET',
      `/api/internal/invites?orgRef=${encodeURIComponent(sourceOrgRef)}`,
    )
    return Array.isArray(r.invites) ? r.invites : []
  }

  /**
   * POST /api/internal/invites/:id/resend — body `{ sourceOrgRef }` (required).
   * Connect only resends when the invite belongs to that org; anything else
   * is `not_found` (404).
   */
  resend(
    id: number,
    sourceOrgRef: string,
  ): Promise<{ id: number; status: ConnectInviteStatus; expiresAt: string; emailSent: boolean }> {
    return this.call('POST', `/api/internal/invites/${encodeURIComponent(String(id))}/resend`, { sourceOrgRef })
  }

  /**
   * POST /api/internal/invites/:id/cancel — body `{ sourceOrgRef }` (required).
   * Connect only cancels when the invite belongs to that org; anything else
   * is `not_found` (404).
   */
  cancel(id: number, sourceOrgRef: string): Promise<{ id: number; status: ConnectInviteStatus }> {
    return this.call('POST', `/api/internal/invites/${encodeURIComponent(String(id))}/cancel`, { sourceOrgRef })
  }

  cancelByEmail(args: { sourceOrgRef: string; email: string }): Promise<{ cancelled: number }> {
    return this.call('POST', '/api/internal/invites/cancel-by-email', {
      sourceOrgRef: args.sourceOrgRef,
      email: args.email,
    })
  }
}

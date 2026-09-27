/**
 * p77 STORY-004 — `HandoffTransport`: the RP's HTTP client for Connect's
 * handoff plane (specs.md §4.2, §5.2 `./server/handoff`, D23).
 *
 * WHY. The handoff driver runs INSIDE each relying party (crm, yobo) over that
 * RP's `RpAdapter`; the only thing that crosses a process boundary is the
 * RP's own call to Connect. This module pins those calls — path, body,
 * answer — in one place so the receivers (STORY-008 `handoff/*`,
 * `identity/register`; STORY-010 `email-held`, `reset-forward`) and every
 * caller agree on the contract by construction. The shapes below are the
 * contract; the result file of STORY-004 lists them for the receiver stories.
 *
 * THE OPERATOR TOKEN (D23, §6.5). Every Connect call made inside a leased
 * operator op forwards the `cutover_operator+jwt` as `X-Cutover-Operator`;
 * Connect checks it in-process against the switch row and answers
 * `403 operator_superseded` once the `jti` has rotated. The transport takes
 * the token as a PROVIDER (`operatorToken()`), resolved per call, so a route
 * builds one transport per request and a rotation is seen by the very next
 * call. The mapping sweep (D25) never carries it — `identityRegister` sends
 * the RP key alone.
 *
 * NEVER LOG A VERIFIER. `handoff/prepare` and `handoff/activate` carry the
 * bcrypt hash for an `import` row; nothing here prints a body.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/credential-handoff.ts (the
 * `post` / `ConnectReply` transport half; the four p79 routes became nine).
 */

import type { HandoffClass, RpSystem } from '../../adapter/index.js'

export const CONNECT_INTERNAL_BASE_PATH = '/api/internal/connect'

/** Every route the RP calls, relative to `${issuer}/api/internal/connect`. */
export const CONNECT_HANDOFF_ROUTES = {
  classify: 'handoff/classify',
  prepare: 'handoff/prepare',
  activate: 'handoff/activate',
  activateExisting: 'handoff/activate-existing',
  fail: 'handoff/fail',
  state: 'handoff/state',
  identityRegister: 'identity/register',
  emailHeld: 'email-held',
  resetForward: 'reset-forward',
} as const

export type ConnectHandoffRoute = (typeof CONNECT_HANDOFF_ROUTES)[keyof typeof CONNECT_HANDOFF_ROUTES]

export interface HandoffTransportConfig {
  /** The Connect issuer, e.g. `https://auth.yobolabs.ai`. Trailing slashes are stripped. */
  issuer: string
  /** This RP's entry in Connect's `INTERNAL_KEYS_JSON` (`X-Internal-API-Key`). */
  rpKey: string
  /** This RP's system name — sent as `X-Service-Name`; Connect binds the caller by the key, not the header. */
  system: RpSystem
  /**
   * The operator token to forward on every handoff call made inside a leased op (D23). Resolved
   * per call; `null`/`undefined` sends no header (the flag-on application path). The sweep never
   * consults it.
   */
  operatorToken?: () => string | null | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** One Connect answer. `status: 0` is a transport failure (`error` says what). */
export interface ConnectReply<T = any> {
  status: number
  json: T | null
  error: string | null
}

/** A reply the driver treats as transient: retry later, the row stays where it is. */
export const isTransientReply = (r: ConnectReply): boolean => r.status === 0 || r.status >= 500

// ---------------------------------------------------------------------------
// Bodies and answers — the pinned contract
// ---------------------------------------------------------------------------

/** `POST handoff/classify` — read-only; writes and stages nothing (§6.2 step 1, D10). */
export interface ClassifyRequest {
  sourceUserRef: string
  hasVerifier: boolean
  /** sha256 of the RP's verifier, or null. */
  digest: string | null
  /** `users.updated_at` (ISO). */
  revision: string | null
  /** The manifest's election; Connect answers `409 class_mismatch` when its rule disagrees. Absent for an application caller. */
  expectedClass?: HandoffClass
}
/** 200 → `{ handoffClass }`; 409 `{ error: 'class_mismatch', handoffClass }`; 404 `{ error: 'subject_not_mapped' }`. */
export interface ClassifyAnswer {
  handoffClass: HandoffClass
}

/** `POST handoff/prepare` — step (3): stages for `import`, persists the class on the receipt; idempotent per `(source_system, source_user_ref)`. */
export interface PrepareRequest {
  handoffId: string
  sourceUserRef: string
  handoffClass: HandoffClass
  hasVerifier: boolean
  digest: string | null
  revision: string | null
  /** `import` only — the verifier Connect stages. Never present for adopt | retire | recover. */
  source?: { verifier: string; revision: string }
}
/**
 * 200 → `{ outcome: 'staged' | 'restaged' | 'recorded', handoffClass }` (`recorded` = nothing to stage);
 * 409 `{ error: 'class_changed', handoffClass }`; 409 `already_activated`; 409 `handoff_failed`;
 * 409 `quarantined`; 404 `subject_not_mapped`; 403 `operator_superseded`.
 */
export interface PrepareAnswer {
  outcome: 'staged' | 'restaged' | 'recorded'
  handoffClass: HandoffClass
}

/** `POST handoff/activate` — `import` only: compare-and-set on the staged verifier, then promote. */
export interface ActivateRequest {
  handoffId: string
  sourceUserRef: string
  source: { verifier: string; revision: string }
}
/**
 * 200 → `{ outcome: 'activated' | 'already_activated' | 'restaged' | 'not_staged' | 'quarantined', credentialVersion? }`;
 * 409 `handoff_failed`; 409 `quarantined`; 409 `already_activated`; 404 `subject_not_mapped`; 403 `operator_superseded`.
 */
export interface ActivateAnswer {
  outcome: 'activated' | 'already_activated' | 'restaged' | 'not_staged' | 'quarantined'
  credentialVersion?: number
  reason?: string
}

/** `POST handoff/activate-existing` — adopt | retire | recover: Connect writes the retired receipt, touches no password. */
export interface ActivateExistingRequest {
  handoffId: string
  sourceUserRef: string
  handoffClass: Exclude<HandoffClass, 'import'>
}
/**
 * 200 → `{ outcome: 'activated' | 'already_activated' | 'no_connect_credential_yet', via?, credentialVersion? }`;
 * 409 `canonical_pending` (retire: the source RP's row not yet activated — transient);
 * 409 `handoff_failed`; 409 `already_activated`; 409 `staged_verifier_present`; 404 `subject_not_mapped`; 403 `operator_superseded`.
 */
export interface ActivateExistingAnswer {
  outcome: 'activated' | 'already_activated' | 'no_connect_credential_yet'
  via?: 'password' | 'google' | 'retired'
  credentialVersion?: number
}

/** `POST handoff/fail` — addressed by `(caller.sourceSystem, sourceUserRef)`; `handoffId` optional (`409 handoff_mismatch` when it names another). */
export interface FailRequest {
  sourceUserRef: string
  handoffId?: string
  reason: string
}
/** 200 → `{ outcome: 'failed' | 'already_failed' | 'nothing_to_fail' }`; 409 `already_activated`; 409 `handoff_mismatch`; 404 `subject_not_mapped`. */
export interface FailAnswer {
  outcome: 'failed' | 'already_failed' | 'nothing_to_fail'
}

/** `POST handoff/state` — Connect's receipt for the caller's row, and its credential version (the flip's mirror value). */
export interface StateRequest {
  sourceUserRef: string
}
export interface StateAnswer {
  found: boolean
  userId?: number
  credentialVersion?: number
  handoffId?: string
  handoffClass?: HandoffClass
  state?: 'prepared' | 'activated' | 'failed'
}

/** `POST identity/register` (D25) — RP key only, never an operator token. */
export interface IdentityRegisterRequest {
  sub: string
  sourceUserRef: string
}
/** 200|201 → `{ ok: true }`; 409 `ref_conflict`; 404 `subject_unknown`; 409 `subject_inactive`. */
export interface IdentityRegisterAnswer {
  ok: true
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export interface HandoffTransport {
  readonly issuer: string
  readonly system: RpSystem
  classify(body: ClassifyRequest): Promise<ConnectReply<ClassifyAnswer & { error?: string }>>
  prepare(body: PrepareRequest): Promise<ConnectReply<PrepareAnswer & { error?: string }>>
  activate(body: ActivateRequest): Promise<ConnectReply<ActivateAnswer & { error?: string }>>
  activateExisting(body: ActivateExistingRequest): Promise<ConnectReply<ActivateExistingAnswer & { error?: string }>>
  fail(body: FailRequest): Promise<ConnectReply<FailAnswer & { error?: string }>>
  state(body: StateRequest): Promise<ConnectReply<StateAnswer & { error?: string }>>
  /** No operator token, by construction (D25: the sweep runs under the RP key alone). */
  identityRegister(body: IdentityRegisterRequest): Promise<ConnectReply<IdentityRegisterAnswer & { error?: string }>>
  /** Raw access for the owner client and tests. `withOperator` defaults to true. */
  post<T = any>(route: ConnectHandoffRoute, body: unknown, opts?: { withOperator?: boolean }): Promise<ConnectReply<T>>
}

const DEFAULT_TIMEOUT_MS = 10_000

export function createHandoffTransport(cfg: HandoffTransportConfig): HandoffTransport {
  const issuer = (cfg.issuer ?? '').trim().replace(/\/+$/, '')
  if (!issuer) throw new Error('createHandoffTransport: issuer is required')
  if (!cfg.rpKey) throw new Error('createHandoffTransport: rpKey is required')
  const base = `${issuer}${CONNECT_INTERNAL_BASE_PATH}/`

  async function post<T>(
    route: ConnectHandoffRoute,
    body: unknown,
    opts: { withOperator?: boolean } = {},
  ): Promise<ConnectReply<T>> {
    const fetchImpl = cfg.fetchImpl ?? fetch
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Internal-API-Key': cfg.rpKey,
      'X-Service-Name': cfg.system,
    }
    if (opts.withOperator !== false) {
      const token = cfg.operatorToken?.()
      if (token) headers['X-Cutover-Operator'] = token
    }
    try {
      const res = await fetchImpl(base + route, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
      let json: T | null = null
      try {
        json = (await res.json()) as T
      } catch {
        json = null
      }
      return { status: res.status, json, error: null }
    } catch (err) {
      return { status: 0, json: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return {
    issuer,
    system: cfg.system,
    classify: (body) => post(CONNECT_HANDOFF_ROUTES.classify, body),
    prepare: (body) => post(CONNECT_HANDOFF_ROUTES.prepare, body),
    activate: (body) => post(CONNECT_HANDOFF_ROUTES.activate, body),
    activateExisting: (body) => post(CONNECT_HANDOFF_ROUTES.activateExisting, body),
    fail: (body) => post(CONNECT_HANDOFF_ROUTES.fail, body),
    state: (body) => post(CONNECT_HANDOFF_ROUTES.state, body),
    identityRegister: (body) => post(CONNECT_HANDOFF_ROUTES.identityRegister, body, { withOperator: false }),
    post,
  }
}

/** The error string Connect put in the body, or the status when it put none. */
export function replyError(r: ConnectReply): string {
  const e = (r.json as { error?: unknown } | null)?.error
  return typeof e === 'string' && e ? e : String(r.status)
}

/** `403 operator_superseded` — the op must stop writing (§6.5). */
export function isOperatorSuperseded(r: ConnectReply): boolean {
  return r.status === 403 && replyError(r) === 'operator_superseded'
}

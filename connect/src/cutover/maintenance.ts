/**
 * p77 STORY-005 — `EstateMaintenance`: the switch commands `on | off |
 * extend | status` and the operator mint (D26, §6.3 steps 1 and 6, §6.5,
 * G2, G10; feedback P77-13 / P77-23 / P77-24).
 *
 * ARM (`on`) — the proof, not the flag. (a) POSITIVE CONTROL with the probe
 * identity BEFORE the row is written: a real silent authorize into each RP
 * must issue a session (the path reaches that RP's `signIn`), and a
 * wrong-password POST at yobo, crm and the IdP must answer
 * `CredentialsSignin` (the path reaches `authorize`). A failed control means
 * the probes could not tell a gate from a broken surface, so nothing is
 * armed. (b) The row: `active: true`, a fresh jti, `since`, `reason`,
 * `operator`. (c) The 45 s settle — the 15 s RP cache, the 10 s write
 * deadline and the 10 s statement bound of `withCredentialWrite`, plus
 * margin: every credential write admitted before the row has committed or
 * been refused. (d) The PROVIDER-SPECIFIC probes, every surface: the silent
 * authorize into each RP → `Location: /maintenance` and no session cookie;
 * the credentials POST at yobo, crm, the IdP (and superhost's demo where
 * served) → `error=maintenance`; the three bridge mints → 503; every
 * `/maintenance` page → 200. ANYTHING ELSE — a 404, a `CredentialsSignin`, a
 * CSRF 4xx, a redirect to the IdP's login, a 200 with a session cookie — is a
 * failed probe named with the surface and the reason; `armed` is not
 * printed and the switch STAYS ON (G2: a surface still admitting logins
 * while rows move is the one state the design exists to prevent).
 *
 * The surfaces are supplied by the caller (STORY-036 drives real NextAuth
 * flows with a CSRF cookie jar); this module owns the CLASSIFICATION of what
 * came back, so the command, G2 and the acceptance tests judge one way.
 *
 * LIFT (`off`, `off --abort`) — every lift begins the same way (P77-13
 * round 5, and the STORY-005 half of the round-6 decision, recorded in the
 * result file and specs.md §12):
 *   (i)   ROTATE: one row write sets a fresh jti and `lifting_since`. Every
 *         token minted before it is dead at Connect (D23's in-process check)
 *         and at every RP's live check; the tick mints nothing while
 *         `lifting_since` is set; `--execute` refuses `lifting`. The lifter
 *         mints its own tokens from the new jti (`forLifter`).
 *   (ii)  GATE (a): the advisory lock must be free (a live driver →
 *         `409 lift_refused lock`).
 *   (iii) DRAIN every RP — the `drain` op, under the lifter's token — BEFORE
 *         any release, count or gate. `drainLeases` (STORY-004) drains EVERY
 *         unfinished lease, expired or not, and returns only after every
 *         transaction that claimed one has committed or rolled back; an RP
 *         whose drain fails refuses the lift (`lift_refused drain`) — the
 *         lift never proceeds on an RP it could not prove quiet.
 *   Then the contract `first_activation_at` selects (P77-23):
 *   - PRE-ACTIVATION (NULL — every repair window; a cutover nothing moved
 *     in): with `--abort`, `release` for every open handoff each RP's
 *     `state` lists; then (b0) every RP reports `prepared + fenced = 0`
 *     (`off` without `--abort` → `409 lift_refused open_handoffs` while one
 *     exists). `eligibleLocal` and the flags are NOT gated.
 *   - POST-ACTIVATION: `--abort` → `409 activated_roll_forward_only`; `off`
 *     runs (b) `eligibleLocal + prepared + fenced = 0` on every RP, (c) crm
 *     and yobo `flagEnabled` (served), (d) G1, (e) G5 — `409 lift_refused
 *     <gate>` at the first failing gate.
 *   A refused lift clears `lifting_since` and KEEPS the rotated jti (every
 *   command mints from the row when it starts, so nothing held a token
 *   across the lift). A completed lift sets `active: false`, `jti: null`,
 *   `lifted_at`, and reports the window's duration and extensions.
 *
 * EXTEND records `extended_until` and the extension; the switch never lifts
 * itself. STATUS is the row, its age, and every RP's `state` (incl.
 * `inFlightOps`). MINT is `mintOperatorToken` (refused while lifting unless
 * for the lifter).
 */

import type { RpSystem } from '../adapter/index.js'
import type { ConnectEnv, HandoffOp, RpStateAnswer } from '../next-auth/internal-routes.js'
import { CUTOVER_RP_ORDER } from './classify.js'
import type { EstateLock } from './estate.js'
import { replyError, type RpOpsClient } from './rp-client.js'
import { mintOperatorToken, OFF_SWITCH_ROW, newSwitchJti, type MaintenanceSwitchRow, type MaintenanceSwitchStore, type OperatorTokenSigner } from './switch.js'

// =============================================================================
// Probes — what a surface answered, and how it is judged
// =============================================================================

export type ProbeKind = 'silent-authorize' | 'credentials' | 'bridge' | 'page'
export type ProbePhase = 'positive' | 'paused'

/** What one probe of one surface observed. The caller does the HTTP; this module judges. */
export interface ProbeObservation {
  status: number
  /** The `Location` header of a redirect, if any. */
  location?: string | null
  /** Every `Set-Cookie` header, if any. */
  setCookie?: string[]
  /** For a page: the body text. */
  bodyText?: string | null
  /** A transport failure (nothing answered). */
  transportError?: string | null
}

export interface ProbeSurface {
  /** e.g. `crm silent-authorize`, `yobo credentials`, `superhost bridge`, `idp /maintenance`. */
  name: string
  kind: ProbeKind
  /** Which control phase(s) this surface takes part in. Default: both for silent-authorize/credentials; paused only for bridge/page. */
  phases?: ProbePhase[]
  run(phase: ProbePhase): Promise<ProbeObservation>
}

export interface ProbeVerdict {
  surface: string
  kind: ProbeKind
  phase: ProbePhase
  ok: boolean
  reason: string | null
  observed: string
}

const SESSION_COOKIE_RE = /(^|;\s*|__Secure-|__Host-)next-auth\.session-token=|(^|;\s*)(__Secure-)?authjs\.session-token=|(^|;\s*)session=/i

export function hasSessionCookie(setCookie: readonly string[] | undefined): boolean {
  return (setCookie ?? []).some((c) => SESSION_COOKIE_RE.test(c) && !/=;|=\s*;|max-age=0|expires=thu, 01 jan 1970/i.test(c))
}

function isRedirect(status: number): boolean {
  return status === 302 || status === 303 || status === 307 || status === 301
}

function pathOf(location: string | null | undefined): string {
  if (!location) return ''
  try {
    return new URL(location, 'http://x').pathname
  } catch {
    return location
  }
}

/**
 * The one judgement the command, G2 and the acceptance tests share. A
 * failure is named with its reason — never evidence of the gate.
 */
export function classifyProbe(kind: ProbeKind, phase: ProbePhase, obs: ProbeObservation, ctx: { issuerLoginPaths?: string[]; maintenancePath?: string; pausedText?: string } = {}): { ok: boolean; reason: string | null; observed: string } {
  const maintenancePath = ctx.maintenancePath ?? '/maintenance'
  const loginPaths = ctx.issuerLoginPaths ?? ['/login', '/api/auth/signin', '/oauth/authorize']
  const loc = obs.location ?? null
  const cookie = hasSessionCookie(obs.setCookie)
  const observed = obs.transportError ? `transport: ${obs.transportError}` : `${obs.status}${loc ? ` → ${loc}` : ''}${cookie ? ' +session-cookie' : ''}`
  if (obs.transportError) return { ok: false, reason: 'unreachable', observed }
  if (obs.status === 404) return { ok: false, reason: 'not_found', observed }
  const locPath = pathOf(loc)
  const toIdpLogin = isRedirect(obs.status) && loginPaths.some((p) => locPath === p || locPath.startsWith(`${p}/`))
  const errorParam = (() => {
    try {
      return loc ? new URL(loc, 'http://x').searchParams.get('error') : null
    } catch {
      return null
    }
  })()

  if (kind === 'silent-authorize') {
    if (phase === 'positive') {
      if (toIdpLogin) return { ok: false, reason: 'redirect_to_idp_login', observed }
      if (obs.status >= 400 && obs.status < 500) return { ok: false, reason: 'csrf_4xx', observed }
      if (!cookie) return { ok: false, reason: 'no_session_issued', observed }
      return { ok: true, reason: null, observed }
    }
    if (cookie) return { ok: false, reason: 'session_issued', observed }
    if (toIdpLogin) return { ok: false, reason: 'redirect_to_idp_login', observed }
    if (obs.status >= 400 && obs.status < 500) return { ok: false, reason: 'csrf_4xx', observed }
    if (isRedirect(obs.status) && (locPath === maintenancePath || locPath.startsWith(`${maintenancePath}/`))) return { ok: true, reason: null, observed }
    return { ok: false, reason: isRedirect(obs.status) ? 'redirect_elsewhere' : `unexpected_${obs.status}`, observed }
  }

  if (kind === 'credentials') {
    if (obs.status >= 400 && obs.status < 500) return { ok: false, reason: 'csrf_4xx', observed }
    if (phase === 'positive') {
      if (isRedirect(obs.status) && errorParam === 'CredentialsSignin') return { ok: true, reason: null, observed }
      if (cookie) return { ok: false, reason: 'session_issued_for_wrong_password', observed }
      return { ok: false, reason: errorParam ? `error_${errorParam}` : `unexpected_${obs.status}`, observed }
    }
    if (cookie) return { ok: false, reason: 'session_issued', observed }
    if (errorParam === 'CredentialsSignin') return { ok: false, reason: 'credentials_signin', observed }
    if (toIdpLogin) return { ok: false, reason: 'redirect_to_idp_login', observed }
    if (isRedirect(obs.status) && errorParam === 'maintenance') return { ok: true, reason: null, observed }
    return { ok: false, reason: errorParam ? `error_${errorParam}` : `unexpected_${obs.status}`, observed }
  }

  if (kind === 'bridge') {
    if (phase === 'positive') return { ok: obs.status < 500, reason: obs.status < 500 ? null : `unexpected_${obs.status}`, observed }
    if (obs.status === 503) return { ok: true, reason: null, observed }
    if (cookie || obs.status === 200) return { ok: false, reason: 'mint_admitted', observed }
    return { ok: false, reason: `unexpected_${obs.status}`, observed }
  }

  // page
  if (obs.status !== 200) return { ok: false, reason: `unexpected_${obs.status}`, observed }
  if (ctx.pausedText && obs.bodyText != null && !obs.bodyText.includes(ctx.pausedText)) return { ok: false, reason: 'paused_text_missing', observed }
  return { ok: true, reason: null, observed }
}

// =============================================================================
// The commands
// =============================================================================

export interface EstateMaintenanceDeps {
  env: ConnectEnv
  issuer: string
  store: MaintenanceSwitchStore
  sign: OperatorTokenSigner
  /** Every RP registered for the environment (`CONNECT_RP_ORIGINS_JSON`) — the token audience and the drain/state set. */
  rps: Partial<Record<RpSystem, RpOpsClient>>
  /** The RP set the token is minted for; default = the keys of `rps`. */
  audience?: readonly RpSystem[]
  lock: Pick<EstateLock, 'tryAcquire' | 'release'> | { isHeld(env: ConnectEnv): Promise<boolean> }
  probes?: readonly ProbeSurface[]
  probeContext?: { issuerLoginPaths?: string[]; maintenancePath?: string; pausedText?: string }
  /** Gates (d) G1 and (e) G5 for the post-activation lift. Default: pass. */
  gates?: { g1?: () => Promise<{ ok: boolean; reason?: string }>; g5?: (system: RpSystem, client: RpOpsClient) => Promise<{ ok: boolean; reason?: string }> }
  settleMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  log?: (line: string) => void
  /** The token's ops for the lift. */
  liftOps?: HandoffOp[]
}

export const ARM_SETTLE_MS = 45_000
export const WINDOW_BUDGET_MS = 60 * 60 * 1000

export type ArmResult =
  | { armed: true; jti: string; since: string; probes: ProbeVerdict[] }
  | { armed: false; status: 409 | 412 | 500; error: 'already_armed' | 'positive_control_failed' | 'probe_failed' | 'probe_identity_missing'; failures: ProbeVerdict[]; jti: string | null }

export type LiftGate = 'lock' | 'drain' | 'open_handoffs' | 'counts' | 'flag' | 'g1' | 'g5' | 'state'

export type LiftResult =
  | { lifted: true; jti: null; durationMs: number; extensions: MaintenanceSwitchRow['extensions']; drained: Partial<Record<RpSystem, number>>; released: Array<{ system: RpSystem; sourceUserRef: string; outcome: string }> }
  | { lifted: false; status: 409; error: 'lift_refused'; gate: LiftGate; detail: string; rotatedJti: string; drained: Partial<Record<RpSystem, number>> }
  | { lifted: false; status: 409; error: 'activated_roll_forward_only'; firstActivationAt: string; rotatedJti: string; drained: Partial<Record<RpSystem, number>> }
  | { lifted: false; status: 409; error: 'not_armed' }

export interface StatusResult {
  row: MaintenanceSwitchRow
  ageMs: number | null
  overBudget: boolean
  rps: Partial<Record<RpSystem, RpStateAnswer | { error: string }>>
}

const DEFAULT_LIFT_OPS: HandoffOp[] = ['drain', 'release', 'reconcile']

export class EstateMaintenance {
  private readonly now: () => Date
  private readonly sleep: (ms: number) => Promise<void>
  private readonly log: (line: string) => void

  constructor(private readonly deps: EstateMaintenanceDeps) {
    this.now = deps.now ?? (() => new Date())
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.log = deps.log ?? (() => {})
  }

  private audience(): RpSystem[] {
    return [...(this.deps.audience ?? (Object.keys(this.deps.rps) as RpSystem[]))]
  }

  async readRow(): Promise<MaintenanceSwitchRow> {
    return (await this.deps.store.read()) ?? OFF_SWITCH_ROW
  }

  /** `mintOperatorToken` from the row as it stands (refused while lifting unless for the lifter). */
  async mintOperatorToken(ops: readonly HandoffOp[], opts: { forLifter?: boolean } = {}): Promise<string> {
    const m = await mintOperatorToken({ store: this.deps.store, sign: this.deps.sign, issuer: this.deps.issuer, env: this.deps.env, audience: this.audience(), ops, forLifter: opts.forLifter, now: this.now })
    return m.token
  }

  private async runProbes(phase: ProbePhase): Promise<ProbeVerdict[]> {
    const out: ProbeVerdict[] = []
    for (const s of this.deps.probes ?? []) {
      const phases = s.phases ?? (s.kind === 'silent-authorize' || s.kind === 'credentials' ? ['positive', 'paused'] : ['paused'])
      if (!phases.includes(phase)) continue
      let obs: ProbeObservation
      try {
        obs = await s.run(phase)
      } catch (err) {
        obs = { status: 0, transportError: err instanceof Error ? err.message : String(err) }
      }
      const v = classifyProbe(s.kind, phase, obs, this.deps.probeContext)
      out.push({ surface: s.name, kind: s.kind, phase, ok: v.ok, reason: v.reason, observed: v.observed })
      this.log(`probe ${phase} ${s.name}: ${v.ok ? 'ok' : `FAILED ${v.reason}`} (${v.observed})`)
    }
    return out
  }

  /** `on --reason <text>`: the positive control, the row, the settle, the paused probes. */
  async arm(input: { reason: string; operator: string; probeIdentityPresent?: boolean }): Promise<ArmResult> {
    const row = await this.readRow()
    if (row.active) return { armed: false, status: 409, error: 'already_armed', failures: [], jti: row.jti }
    if (input.probeIdentityPresent === false) return { armed: false, status: 412, error: 'probe_identity_missing', failures: [], jti: null }

    const positive = await this.runProbes('positive')
    const controlFailures = positive.filter((p) => !p.ok)
    if (controlFailures.length > 0) {
      this.log(`positive control FAILED on ${controlFailures.map((f) => `${f.surface} (${f.reason})`).join(', ')}; nothing armed`)
      return { armed: false, status: 412, error: 'positive_control_failed', failures: controlFailures, jti: null }
    }

    const jti = newSwitchJti()
    const since = this.now().toISOString()
    await this.deps.store.write({ ...OFF_SWITCH_ROW, active: true, jti, since, reason: input.reason, operator: input.operator })
    this.log(`row written: active, jti ${jti}, since ${since}; settling ${Math.round((this.deps.settleMs ?? ARM_SETTLE_MS) / 1000)} s`)
    await this.sleep(this.deps.settleMs ?? ARM_SETTLE_MS)

    const paused = await this.runProbes('paused')
    const failures = paused.filter((p) => !p.ok)
    if (failures.length > 0) {
      this.log(`NOT armed: ${failures.map((f) => `${f.surface} ${f.reason}`).join(', ')} — the switch stays on (G2); fix the surface and rerun, or off --abort`)
      return { armed: false, status: 500, error: 'probe_failed', failures, jti }
    }
    this.log('armed')
    return { armed: true, jti, since, probes: [...positive, ...paused] }
  }

  private async lockHeld(): Promise<boolean> {
    const lock = this.deps.lock
    if ('isHeld' in lock) return lock.isHeld(this.deps.env)
    const got = await lock.tryAcquire(this.deps.env)
    if (got) await lock.release(this.deps.env)
    return !got
  }

  private async readState(client: RpOpsClient): Promise<RpStateAnswer | { error: string }> {
    const r = await client.state()
    if (r.status !== 200 || !r.json?.state) return { error: r.status === 0 ? (r.error ?? 'transport') : `HTTP ${r.status} ${replyError(r)}` }
    return r.json.state
  }

  /** `off [--abort]` — rotate, gate (a), drain every RP, then the contract `first_activation_at` selects. */
  async lift(input: { abort?: boolean } = {}): Promise<LiftResult> {
    const row = await this.readRow()
    if (!row.active) return { lifted: false, status: 409, error: 'not_armed' }

    // (i) ROTATE — one row write, before anything else.
    const rotatedJti = newSwitchJti()
    const liftingSince = this.now().toISOString()
    const rotated: MaintenanceSwitchRow = { ...row, jti: rotatedJti, liftingSince }
    await this.deps.store.write(rotated)
    this.log(`lift: jti rotated (${row.jti} → ${rotatedJti}), lifting_since ${liftingSince}`)
    const drained: Partial<Record<RpSystem, number>> = {}
    const refuse = async (gate: LiftGate, detail: string): Promise<LiftResult> => {
      await this.deps.store.write({ ...rotated, liftingSince: null })
      this.log(`409 lift_refused ${gate}: ${detail} — the window stays on with the rotated jti`)
      return { lifted: false, status: 409, error: 'lift_refused', gate, detail, rotatedJti, drained }
    }

    // (ii) gate (a): no operator command holds the advisory lock.
    if (await this.lockHeld()) return refuse('lock', 'a connect:cutover driver holds the advisory lock')

    // (iii) DRAIN every RP under the lifter's token, before any release, count or gate.
    let token: string
    try {
      token = await this.mintOperatorToken(this.deps.liftOps ?? DEFAULT_LIFT_OPS, { forLifter: true })
    } catch (err) {
      return refuse('drain', `could not mint the lifter's token: ${err instanceof Error ? err.message : String(err)}`)
    }
    const clients = this.lifterClients(token)
    for (const [system, client] of clients) {
      const r = await client.drain()
      if (r.status !== 200 || typeof r.json?.expired !== 'number') return refuse('drain', `${system} drain answered ${r.status === 0 ? r.error : `HTTP ${r.status} ${replyError(r)}`}`)
      drained[system] = r.json.expired
      this.log(`drain ${system}: expired ${r.json.expired}`)
    }

    // The contract `first_activation_at` selects — re-read: Connect may have written it during the window.
    const current = await this.readRow()
    const firstActivationAt = current.firstActivationAt
    const released: Array<{ system: RpSystem; sourceUserRef: string; outcome: string }> = []

    if (firstActivationAt == null) {
      // PRE-ACTIVATION LIFT (P77-23): --abort releases every open handoff; then (b0).
      if (input.abort) {
        for (const [system, client] of clients) {
          const s = await this.readState(client)
          if ('error' in s) return refuse('state', `${system} state: ${s.error}`)
          for (const ref of s.openHandoffRefs ?? []) {
            const r = await client.release(ref, 'operator_abort')
            const outcome = r.status === 200 ? String(r.json?.outcome ?? 'released') : replyError(r)
            released.push({ system, sourceUserRef: ref, outcome })
            this.log(`abort release ${system}:${ref}: ${outcome}`)
          }
        }
      }
      for (const [system, client] of clients) {
        const s = await this.readState(client)
        if ('error' in s) return refuse('state', `${system} state: ${s.error}`)
        const open = s.counts.prepared + s.counts.fenced
        if (open > 0) return refuse('open_handoffs', `${system} reports prepared ${s.counts.prepared} + fenced ${s.counts.fenced}${input.abort ? ' after the abort releases' : ' (rerun with --abort to release them)'}`)
      }
    } else {
      // POST-ACTIVATION: roll forward only.
      if (input.abort) {
        await this.deps.store.write({ ...rotated, liftingSince: null })
        this.log(`409 activated_roll_forward_only: first activation at ${firstActivationAt}; fix the reported rows and rerun --execute`)
        return { lifted: false, status: 409, error: 'activated_roll_forward_only', firstActivationAt, rotatedJti, drained }
      }
      for (const [system, client] of clients) {
        const s = await this.readState(client)
        if ('error' in s) return refuse('state', `${system} state: ${s.error}`)
        const outside = s.counts.eligibleLocal + s.counts.prepared + s.counts.fenced
        if (outside > 0) return refuse('counts', `${system} reports eligibleLocal ${s.counts.eligibleLocal} prepared ${s.counts.prepared} fenced ${s.counts.fenced}`)
      }
      for (const system of CUTOVER_RP_ORDER) {
        const client = this.deps.rps[system]
        if (!client) continue
        const s = await this.readState(client)
        if ('error' in s) return refuse('state', `${system} state: ${s.error}`)
        if (!s.flagEnabled) return refuse('flag', `${system} does not serve YOBO_CONNECT_ENABLED=true`)
      }
      if (this.deps.gates?.g1) {
        const g = await this.deps.gates.g1()
        if (!g.ok) return refuse('g1', g.reason ?? 'G1 failed')
      }
      if (this.deps.gates?.g5) {
        for (const [system, client] of clients) {
          const g = await this.deps.gates.g5(system, client)
          if (!g.ok) return refuse('g5', `${system}: ${g.reason ?? 'G5 failed'}`)
        }
      }
    }

    // Complete: every operator token dies with the jti.
    const liftedAt = this.now()
    await this.deps.store.write({ ...current, active: false, jti: null, liftingSince: null, liftedAt: liftedAt.toISOString() })
    const durationMs = current.since ? liftedAt.getTime() - Date.parse(current.since) : 0
    this.log(`lifted at ${liftedAt.toISOString()}; the window lasted ${Math.round(durationMs / 60000)} min with ${current.extensions.length} extension(s)`)
    return { lifted: true, jti: null, durationMs, extensions: current.extensions, drained, released }
  }

  private lifterClients(token: string): Array<[RpSystem, RpOpsClient]> {
    // The lifter's calls carry ITS token whatever provider the given clients hold: wrap each.
    return (Object.entries(this.deps.rps) as Array<[RpSystem, RpOpsClient]>).map(([system, client]) => [system, client.withOperatorToken(() => token)])
  }

  /** `extend --minutes <n> --reason <text>`: recorded on the row and reported; repeatable. */
  async extend(input: { minutes: number; reason: string }): Promise<{ ok: true; extendedUntil: string; extensions: MaintenanceSwitchRow['extensions'] } | { ok: false; status: 409; error: 'not_armed' }> {
    const row = await this.readRow()
    if (!row.active) return { ok: false, status: 409, error: 'not_armed' }
    const at = this.now()
    const base = row.extendedUntil ? Math.max(Date.parse(row.extendedUntil), at.getTime()) : Math.max((row.since ? Date.parse(row.since) : at.getTime()) + WINDOW_BUDGET_MS, at.getTime())
    const extendedUntil = new Date(base + input.minutes * 60_000).toISOString()
    const extensions = [...row.extensions, { at: at.toISOString(), minutes: input.minutes, reason: input.reason }]
    await this.deps.store.write({ ...row, extendedUntil, extensions })
    this.log(`extended until ${extendedUntil}: ${input.reason}`)
    return { ok: true, extendedUntil, extensions }
  }

  /** `status`: the row, the window's age, per-RP `state` (incl. `inFlightOps`). */
  async status(): Promise<StatusResult> {
    const row = await this.readRow()
    const ageMs = row.active && row.since ? this.now().getTime() - Date.parse(row.since) : null
    const budgetEnd = row.extendedUntil ? Date.parse(row.extendedUntil) : row.since ? Date.parse(row.since) + WINDOW_BUDGET_MS : null
    const rps: StatusResult['rps'] = {}
    for (const [system, client] of Object.entries(this.deps.rps) as Array<[RpSystem, RpOpsClient]>) rps[system] = await this.readState(client)
    return { row, ageMs, overBudget: row.active && budgetEnd != null && this.now().getTime() > budgetEnd, rps }
  }
}

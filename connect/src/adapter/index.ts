/**
 * p77 STORY-003 — the `RpAdapter` contract (specs.md §5.2).
 *
 * WHY. Four relying parties (crm, yobo, commerce-app, superhost-app) each hold
 * a `users` table with the same three Connect columns and each must answer
 * the same questions to the estate driver in yobo-auth: what rows do you
 * hold, what authority does this one carry, fence it, flip it, release it.
 * p77 refuses to write that four times. This module is the in-process
 * contract every RP implements ONCE; `@jetdevs/connect/server/revocation`
 * and the `credentialHandoff` route factory (STORY-005) code against it, and
 * the estate driver speaks only HTTP to the routes.
 *
 * Types only — nothing here runs. The database seam (`RpSqlClient`) is a
 * driver-neutral `(text, params) => rows` pair so that this package carries
 * no drizzle, pg or postgres dependency; each RP wraps its own privileged
 * client with one of the structural helpers in
 * `../server/revocation/sql-client.ts`.
 *
 * @see specs.md §5.2 (the interface), §6.2 (fence rule per class), §6.3 step 6
 *      (what `state()` feeds), §6.5 (`drain`), D18, D23, D25.
 */

/**
 * p77 STORY-041 — a source system is a ROW in the IdP's
 * `connect_source_systems` registry, not a literal in this SDK: a business
 * joins Connect with a registry row, an OIDC client and an internal key, and
 * no SDK release. So a system is a `string` validated at runtime by its key
 * syntax (`isSourceSystemKey`); WHICH systems exist, which are relying
 * parties and the D10 driver order come from the IdP
 * (`@jetdevs/connect/cutover` `fetchSourceSystems`, the IdP's read-only
 * `GET /api/internal/connect/source-systems`) or from the caller's arguments.
 */
export const SOURCE_SYSTEM_KEY_RE = /^[a-z][a-z0-9_-]{1,31}$/

/** A source-system key: `^[a-z][a-z0-9_-]{1,31}$` (the registry's CHECK). Syntax only — registration is the IdP's. */
export function isSourceSystemKey(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_SYSTEM_KEY_RE.test(value)
}

/** A relying party that holds a `users` row with a Connect binding: a registry key. */
export type RpSystem = string

/**
 * @deprecated p77 STORY-041 — the historical literal union of the four Yobo
 * relying parties. Systems are IdP registry rows now; use `RpSystem` (a
 * validated string). Kept so no RP's annotations break.
 */
export type KnownRpSystem = 'crm' | 'yobo' | 'commerce' | 'superhost'

/**
 * @deprecated p77 STORY-041 — the historical literal union of every source
 * system (`org_source_system`, retired by the IdP's migration 0025). Use
 * `SourceSystem` (a validated string). Kept so no RP's annotations break.
 */
export type KnownSourceSystem = KnownRpSystem | 'cadra' | 'slides'

/** @deprecated p77 STORY-041 — `isSourceSystemKey` (validates the key syntax; there is no list any more). */
export const isRpSystem: (value: unknown) => value is RpSystem = isSourceSystemKey

/** `users.credential_authority` (specs.md §6.1; @jetdevs/core `CREDENTIAL_AUTHORITY`). */
export type RpCredentialAuthority = 'local' | 'prepared' | 'fenced' | 'connect'

/** The class Connect answers at `handoff/classify` and persists on the receipt (D10, §6.2). */
export type HandoffClass = 'import' | 'retire' | 'recover' | 'adopt'

/** `credential_handoff.state` (cadra-web 0131, unchanged). */
export type HandoffState = 'prepared' | 'fenced' | 'activated' | 'failed'

// ---------------------------------------------------------------------------
// The SQL seam
// ---------------------------------------------------------------------------

/**
 * One parameterised statement against the RP's PRIVILEGED connection (no RLS
 * context — the revocation receiver and the freshness gate run pre-org).
 * `$1..$n` placeholders; rows come back as plain objects keyed by column.
 */
export type SqlExecutor = (
  text: string,
  params?: readonly unknown[],
) => Promise<Array<Record<string, unknown>>>

/** What the revocation ledger needs of a database: statements, and a transaction that runs them. */
export interface RpSqlClient {
  execute: SqlExecutor
  /** Runs `fn` inside one transaction; a throw rolls back and rethrows. */
  transaction<T>(fn: (tx: { execute: SqlExecutor }) => Promise<T>): Promise<T>
}

// ---------------------------------------------------------------------------
// Rows the adapter reads and returns
// ---------------------------------------------------------------------------

/** One row of `inventory()` — everything the manifest builder classifies on (§6.2, D10). */
export interface RpUserInventoryRow {
  id: number
  uuid: string | null
  /** `lower(email)`; null for a phone-only identity. */
  email: string | null
  /** sha256 of the stored verifier, or null when `password IS NULL`. Never the hash itself. */
  passwordDigest: string | null
  /** `users.updated_at` at read time — the revision the fence compares (`expected_local_revision`). */
  passwordRevision: string | null
  isActive: boolean
  credentialAuthority: RpCredentialAuthority
  credentialVersion: number
  connectIssuer: string | null
  connectSub: string | null
  connectMappedAt: string | null
  /** Google (or other social) link rows bound to this user. */
  googleLinks: Array<{ provider: string; providerAccountId: string }>
  orgMemberships: Array<{ orgId: number; orgUuid: string | null; role: string | null }>
}

/** `readAuthority(userId)` — the three facts the freshness gate and the driver compare. */
export interface AuthorityRow {
  authority: RpCredentialAuthority
  /** `users.credential_version` — the local mirror. */
  version: number
  /** `password IS NULL`. */
  passwordIsNull: boolean
  /** The binding halves, so a caller can decide "Connect-bound" without a second read. */
  issuer: string | null
  sub: string | null
}

/** Why a `fence` was refused — the per-class rule of specs.md §6.2. */
export type FenceRefusal =
  /** No open handoff for this user. */
  | 'no_handoff'
  /** `prepare_acked_at IS NULL` — Connect has not confirmed the class (M5 trigger, P77-20). */
  | 'not_acked'
  /** The row is not `prepared` (already fenced, activated or failed). */
  | 'wrong_state'
  /** import: verifier digest ≠ pinned `source_digest` — re-stage from the row now. */
  | 'source_drift_under_fence'
  /** import: the local verifier is gone. */
  | 'verifier_missing'
  /** adopt | retire: digest or `updated_at` ≠ expected — a concurrent local password change. */
  | 'adopt_source_changed'
  /** recover: a local verifier appeared. */
  | 'local_verifier_appeared'
  /** The users row lock could not be taken (`FOR UPDATE NOWAIT`) — another operator holds it. */
  | 'in_flight'
  /** The operator lease was gone when the transaction began (§6.5 step 0). */
  | 'op_expired'

export type FenceResult =
  | {
      outcome: 'fenced'
      handoffId: string
      handoffClass: HandoffClass
      /** The digest the fence observed (import: the one it re-staged from). */
      digest: string | null
      revision: string | null
    }
  | { outcome: 'refused'; reason: FenceRefusal; handoffId: string | null }

/** `state()` — what the lift gates read (§6.3 step 6). */
export interface RpState {
  system: RpSystem
  /** The RP's schema lineage tag (the migration head it runs), for G1. */
  schemaTag: string
  /** `YOBO_CONNECT_ENABLED` as served by this process. */
  flagEnabled: boolean
  counts: {
    /** `local` rows that are not system identities and not phone-only. */
    eligibleLocal: number
    prepared: number
    fenced: number
    connect: number
    system: number
    phoneOnly: number
    /** Unfinished, unexpired operator leases (§6.5). */
    inFlightOps: number
  }
  /** Open (`prepared` | `fenced`) handoff rows. */
  openHandoffs: number
  /**
   * STORY-005: the local user refs of those open rows — what `off --abort`
   * releases (§6.3 step 6, "release for every row each RP's state lists").
   * Optional for a pilot adapter that never opens a handoff.
   */
  openHandoffRefs?: string[]
}

/** One `credential_handoff` row (cadra-web 0125/0131 + p77's `handoff_class`, `prepare_acked_at`, `fail_requested_at`). */
export interface HandoffRow {
  handoffId: string
  connectIssuer: string
  connectSub: string
  localUserId: number | null
  state: HandoffState
  handoffClass: HandoffClass
  sourceDigest: string | null
  sourceRevision: string | null
  expectedLocalDigest: string | null
  expectedLocalRevision: string | null
  preparedAt: string
  prepareAckedAt: string | null
  fencedAt: string | null
  activatedAt: string | null
  failedReason: string | null
  failRequestedAt: string | null
  failRequestedReason: string | null
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  lastOutcome: string | null
}

/**
 * `readLocalCredential(userId)` — the RP's own verifier, read for the handoff
 * driver (STORY-004): the ONLY place the hash leaves the RP is the RP's own
 * `handoff/prepare` / `handoff/activate` call to Connect (§6.2 `import`).
 * Never logged; the driver carries the digest everywhere else.
 */
export interface LocalCredentialRead {
  /** The stored bcrypt verifier, or null when `password IS NULL` (or not a bcrypt hash). */
  verifier: string | null
  /** sha256 hex of `verifier`; null when `verifier` is null. */
  digest: string | null
  /** `users.updated_at` as an ISO string — the revision the fence compares. */
  revision: string
  authority: RpCredentialAuthority
}

/** Access to this app's `credential_handoff` rows, over the RP's privileged client. */
export interface HandoffTableAccess {
  readHandoff(handoffId: string): Promise<HandoffRow | null>
  /** The one open (`prepared` | `fenced`) row for a user, or null (`credential_handoff_open_user_uq`). */
  readOpenHandoffForUser(userId: number): Promise<HandoffRow | null>
  /**
   * Open rows that are due (`next_attempt_at <= now()`), oldest first, for the reconciler (§6.4).
   * The reconciler's claim: implement it as `SELECT … FOR UPDATE SKIP LOCKED` in its own short
   * transaction (`RECONCILER_CLAIM_SQL` in `server/handoff/reconciler.ts` is the reference text),
   * so a row a live driver step holds at that instant is not returned. The per-step exclusion is
   * the users row lock `FOR UPDATE NOWAIT` inside `fence` / `release` (→ `in_flight`).
   */
  listDue(limit: number): Promise<HandoffRow[]>
  /**
   * §6.2 step (2) — ONE transaction under the users row lock: insert the row `prepared` with the
   * class Connect answered at `classify` AND move `users.credential_authority` local → prepared.
   * `prepare_acked_at` starts NULL (Connect has not heard of the row yet). A second open row for
   * the user is refused by `credential_handoff_open_user_uq` (throw; the driver resumes instead).
   */
  insert(row: {
    connectIssuer: string
    connectSub: string
    localUserId: number
    handoffClass: HandoffClass
    sourceDigest: string | null
    sourceRevision: string | null
    expectedLocalDigest: string | null
    expectedLocalRevision: string | null
  }): Promise<HandoffRow>
  /**
   * Move the row to `to` (or, with `to === row.state`, patch it in place) — the M5 transition
   * trigger enforces the machine, including "`prepared → fenced` refused while `prepare_acked_at`
   * IS NULL". The driver uses it for `prepare_acked_at`, the fenced re-pin, backoff and the
   * `fail_requested_*` pair; `failed` and `activated` are reached through `release` / the driver's
   * activation (flip first, then this transition).
   */
  transition(
    handoffId: string,
    to: HandoffState,
    patch?: Partial<
      Pick<
        HandoffRow,
        | 'sourceDigest'
        | 'sourceRevision'
        | 'prepareAckedAt'
        | 'failedReason'
        | 'failRequestedAt'
        | 'failRequestedReason'
        | 'lastError'
        | 'lastOutcome'
        | 'nextAttemptAt'
      >
    >,
  ): Promise<HandoffRow>
}

// ---------------------------------------------------------------------------
// The adapter — specs.md §5.2, verbatim
// ---------------------------------------------------------------------------

export interface RpAdapter {
  system: RpSystem
  /** The RP's privileged drizzle client (opaque here; see `RpSqlClient` for the seam this package uses). */
  db: unknown
  /** id, uuid, lower(email), password digest + revision, is_active, connect_issuer/sub, google link rows, org memberships. */
  inventory(): AsyncIterable<RpUserInventoryRow>
  /** Per-app rule; see §7. */
  isSystemIdentity(row: RpUserInventoryRow): boolean
  /** credential_authority, credential_version, password IS NULL. Throws when the user does not exist. */
  readAuthority(userId: number): Promise<AuthorityRow>
  /**
   * STORY-004: the RP's own verifier + revision for the handoff driver (`import` stages it at
   * Connect; `adopt`/`retire` pin its digest and revision). null when the user does not exist.
   */
  readLocalCredential(userId: number): Promise<LocalCredentialRead | null>
  /** schemaTag, flagEnabled, counts, openHandoffs — the lift gates read it (§6.3 step 6). */
  state(): Promise<RpState>
  /**
   * §6.5: expires every unfinished operator lease (`drainLeases` in `server/handoff/lease.ts` — one UPDATE
   * over every row `finished_at IS NULL AND outcome IS NULL`, persisting `outcome = 'drained'`);
   * returns only after every transaction holding a lease row has ended.
   */
  drain(): Promise<{ expired: number }>
  /**
   * users row lock (`FOR UPDATE NOWAIT` → `in_flight`), same tx as the handoff row; resolves the user's open
   * handoff itself; per-class rule (§6.2) against `expected` (the driver passes the row's pinned values:
   * import → `source_digest`; adopt | retire → `expected_local_*`; recover → nothing); refused `not_acked`
   * while prepare_acked_at IS NULL; a `fenced` row is re-asserted (idempotent). import digest drift is NOT a
   * refusal: the fence pins the digest it observes and answers it, and the driver re-stages from it.
   */
  fence(userId: number, expected: { digest?: string; revision?: string }): Promise<FenceResult>
  /** sets 'connect', password NULL, credential_version := connectCv, in ONE statement. Idempotent on a `connect` row. */
  flipToConnect(userId: number, connectCv: number): Promise<void>
  /**
   * resolves the user's open handoff server-side; back to 'local' on Connect's word only, never after activation;
   * no_handoff = nothing open for this user (D23). ONE transaction under the users row lock: authority
   * prepared|fenced → local AND the open row → `failed` with `failed_reason = coalesce(fail_requested_reason,
   * 'released')`. The driver calls it only after Connect's `handoff/fail` answered.
   */
  release(userId: number): Promise<'released' | 'no_handoff'>
  /** app-specific (yobo: onboarding resume access too). */
  invalidateLocalSessions(userId: number): Promise<void>
  /** §3.4; returns the affected-row count; sets connect_mapped_at. */
  stampIssuer(userIds: number[], issuer: string): Promise<number>
  /** §3.4; runs under SET LOCAL p77.binding_admin. */
  quarantineBinding(userId: number, reason: string): Promise<void>
  /** §3.5; locks both rows, rechecks, idempotent by receipt. */
  retireEmail(
    userId: number,
    survivingUserId: number,
    email: string,
    reason: string,
  ): Promise<'retired' | 'already_retired'>
  /** D18: is_active=false + ledger row. */
  deactivate(userId: number, reason: string): Promise<void>
  /** D25 sweep: connect_sub set, connect_mapped_at NULL. */
  unmappedBindings(limit: number): Promise<Array<{ userId: number; sub: string }>>
  /** D25: connect_mapped_at = now(). */
  markMapped(userId: number): Promise<void>
  /** D25: unmappedBindings → identity/register → markMapped; the `sweep-mappings` op (RP key only). */
  sweepMappings(limit: number): Promise<{ registered: number; conflicts: number }>
  /** credential_handoff rows for this app. */
  handoffTable: HandoffTableAccess
}

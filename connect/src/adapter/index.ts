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

/** The relying parties that hold a `users` row with a Connect binding. */
export type RpSystem = 'crm' | 'yobo' | 'commerce' | 'superhost'

export const RP_SYSTEMS: readonly RpSystem[] = ['crm', 'yobo', 'commerce', 'superhost'] as const

export function isRpSystem(value: unknown): value is RpSystem {
  return typeof value === 'string' && (RP_SYSTEMS as readonly string[]).includes(value)
}

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

/** Access to this app's `credential_handoff` rows, over the RP's privileged client. */
export interface HandoffTableAccess {
  readHandoff(handoffId: string): Promise<HandoffRow | null>
  /** The one open (`prepared` | `fenced`) row for a user, or null (`credential_handoff_open_user_uq`). */
  readOpenHandoffForUser(userId: number): Promise<HandoffRow | null>
  /** Open rows that are due (`next_attempt_at <= now()`), oldest first, for the reconciler (§6.4). */
  listDue(limit: number): Promise<HandoffRow[]>
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
  /** credential_authority, credential_version, password IS NULL. */
  readAuthority(userId: number): Promise<AuthorityRow>
  /** schemaTag, flagEnabled, counts, openHandoffs — the lift gates read it (§6.3 step 6). */
  state(): Promise<RpState>
  /**
   * §6.5: expires every unfinished operator lease (`UPDATE … WHERE finished_at IS NULL AND lease_until > now()`);
   * returns only after every transaction holding a lease row has ended.
   */
  drain(): Promise<{ expired: number }>
  /** users row lock, same tx as the handoff row; per-class rule (§6.2); refused while prepare_acked_at IS NULL. */
  fence(userId: number, expected: { digest?: string; revision?: string }): Promise<FenceResult>
  /** sets 'connect', password NULL, credential_version := connectCv, in ONE statement. */
  flipToConnect(userId: number, connectCv: number): Promise<void>
  /**
   * resolves the user's open handoff server-side; back to 'local' on Connect's word only, never after activation;
   * no_handoff = nothing open for this user (D23).
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

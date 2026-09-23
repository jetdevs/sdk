/**
 * Yobo Connect back-channel logout — the LOCAL REVOCATION record, and the
 * use-time check that reads it (specs.md §9.1, §9.2).
 *
 * WHY THIS IS IN THE SDK (p77 STORY-003). The ledger is keyed by the LOCAL
 * user id resolved from `(issuer, sub)` at receive time, plus the `sid`, so a
 * session that never carried a Connect token — yobo's OTP and chat-entry
 * sessions, which have only a local user id — is ended by the same
 * revocation as an OIDC session (§9.2). Four RPs writing that rule four ways
 * is four chances to key it on the wrong thing.
 *
 * A back-channel logout is two writes and one read:
 *
 *   1. CLAIM the `jti`, once and only once.
 *   2. RECORD that everything this subject (or this IdP session) authenticated
 *      before now is finished.
 *   3. At every later use of a credential, ask whether (2) has happened since
 *      the credential was minted.
 *
 * (1) AND (2) ARE ONE TRANSACTION, and the order inside it is not a style
 * choice. Claim-then-revoke across two statements burns the jti before the
 * revocation lands: if the second write fails, the sender's retry presents the
 * same token, the ledger says "already seen", the receiver returns a refusal —
 * and the session is never revoked by anything, ever. Revoke-then-claim has the
 * mirror problem, applying the revocation twice under a race. One transaction
 * has neither: a replay is decided by the unique key, and a crash rolls both
 * back so the retry genuinely retries.
 *
 * WHAT (3) COMPARES. A revocation is not a ban. The question is whether the
 * credential in hand was minted BEFORE the revocation, so a user who signs in
 * again afterwards gets a working session. That is the whole difference between
 * a logout and a disablement, and disablement is `users.is_active`, which is
 * already enforced elsewhere.
 *
 * TABLES (M4, cadra-web 0129 unchanged): `connect_logout_tokens
 * (connect_issuer, jti, expires_at)` with a unique key on `(connect_issuer,
 * jti)`, and `connect_session_revocations (id, connect_issuer, connect_sub,
 * connect_sid, local_user_id, jti, revoked_at DEFAULT now())`.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/connect-session-revocation.ts
 */

import type { RpSqlClient, SqlExecutor } from '../../adapter/index.js'
import type { VerifiedLogoutToken } from './logout-token.js'
import { observeCredentialVersion } from './freshness.js'

export type LogoutApplication =
  /** The token was accepted and the revocation is recorded. */
  | { outcome: 'applied'; revocationId: string; localUserId: number | null }
  /** This `(issuer, jti)` was accepted before. NOTHING was re-applied. */
  | { outcome: 'replay' }
  /** The write could not be made. TRANSIENT — the sender must retry. */
  | { outcome: 'unavailable' }

/**
 * Claim the token's `jti` and record the revocation, atomically.
 *
 * `local_user_id` is resolved here rather than at use time because this is the
 * one moment the `(issuer, sub)` pair is in hand and the binding can be read
 * cheaply. A `sid`-only token names no subject, so it resolves to null and is
 * enforceable only against a credential that carries the same `sid`.
 *
 * @param db privileged handle. The receiver is unauthenticated server-to-server
 *           traffic with no session and no org context, so an RLS-scoped
 *           client reads and writes nothing here.
 */
export async function applyLogoutToken(
  db: RpSqlClient | null | undefined,
  token: VerifiedLogoutToken,
  opts: { logger?: Pick<Console, 'error' | 'warn'> } = {},
): Promise<LogoutApplication> {
  const logger = opts.logger ?? console
  if (!db) return { outcome: 'unavailable' }

  try {
    return await db.transaction(async (tx) => {
      // The unique key on (connect_issuer, jti) IS the replay check. Asking
      // "have I seen this?" and then inserting would be two statements with a
      // race between them; ON CONFLICT DO NOTHING makes the database answer the
      // question and record the answer in one go.
      const claimed = await tx.execute(
        `INSERT INTO connect_logout_tokens (connect_issuer, jti, expires_at)
         VALUES ($1, $2, to_timestamp($3))
         ON CONFLICT (connect_issuer, jti) DO NOTHING
         RETURNING jti`,
        [token.issuer, token.jti, token.replayGuardUntil],
      )
      if (!claimed[0]) {
        // Already accepted. Return WITHOUT touching connect_session_revocations
        // — "the revocation is not re-applied" is the acceptance criterion, and
        // it is satisfied by there being no second insert, not by a later
        // dedupe.
        return { outcome: 'replay' as const }
      }

      // Resolve the binding to a local row. Read by the PAIR, never by `sub`
      // alone: two issuers allocate subjects from their own sequences, and a
      // bare-`sub` lookup here would revoke a stranger.
      let localUserId: number | null = null
      if (token.sub) {
        const bound = await tx.execute(
          `SELECT id FROM users WHERE connect_issuer = $1 AND connect_sub = $2 LIMIT 1`,
          [token.issuer, token.sub],
        )
        const row = bound[0] as { id: number | string } | undefined
        if (row) localUserId = Number(row.id)
      }

      const inserted = await tx.execute(
        `INSERT INTO connect_session_revocations
           (connect_issuer, connect_sub, connect_sid, local_user_id, jti)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [token.issuer, token.sub, token.sid, localUserId, token.jti],
      )
      const revocationId = String((inserted[0] as { id: string | number } | undefined)?.id ?? '')

      // The token names the version the IdP moved to. Raise the mirror
      // (`users.credential_version = GREATEST(current, cv)`) and the in-process
      // high-water mark HERE, in the transaction that claims the jti — so a
      // derived credential minted under the old version is refused on its
      // next use even when no session of this user ever introspects again.
      if (token.cv != null && token.sub) {
        await observeCredentialVersion(
          tx.execute,
          { userId: localUserId, issuer: token.issuer, sub: token.sub, cv: token.cv },
          Date.now(),
          logger,
        )
      }

      return { outcome: 'applied' as const, revocationId, localUserId }
    })
  } catch (err) {
    // TRANSIENT on purpose. A deadlock, a dropped connection or a full disk is
    // not "this token is invalid", and the receiver must not tell the sender's
    // outbox to stop retrying because of one.
    logger.error('[connect-revocation] back-channel logout could not be recorded:', err)
    return { outcome: 'unavailable' }
  }
}

/**
 * Drop replay-ledger rows whose guard window has passed.
 *
 * Safe because a token past `expires_at` is refused by the freshness check
 * whether or not the ledger still remembers it — the two windows are the same
 * window. Called opportunistically after an accepted token so the table stays
 * bounded without a cron; a failure is logged and ignored, since pruning is
 * housekeeping and must never fail a logout that already succeeded.
 */
export async function pruneExpiredLogoutTokens(
  execute: SqlExecutor | null | undefined,
  logger: Pick<Console, 'error'> = console,
): Promise<void> {
  if (!execute) return
  try {
    await execute(`DELETE FROM connect_logout_tokens WHERE expires_at < now()`)
  } catch (err) {
    logger.error('[connect-revocation] logout replay-ledger prune failed:', err)
  }
}

// ===========================================================================
// Use-time check
// ===========================================================================

export interface CredentialIdentity {
  /** Issuer half of the binding, when the credential carries it. */
  issuer?: string | null
  /** Connect subject, when the credential carries it. */
  sub?: string | null
  /** IdP session id, when the credential carries it. */
  sid?: string | null
  /** Local user id. The one identifier every RP session carries. */
  localUserId?: number | null
  /** When the credential was minted (its immutable `authTime`), in seconds since the epoch. */
  issuedAtSeconds: number
}

/** The newest matching ledger `revoked_at`, in seconds, or null when nothing matched. */
export interface RevocationRead {
  revoked: boolean
  revokedAfter: number | null
}

const tsToSeconds = (v: unknown): number | null => {
  if (v instanceof Date) return Math.floor(v.getTime() / 1000)
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? Math.floor(t / 1000) : null
  }
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  return null
}

/**
 * Has a back-channel logout landed since this credential was minted?
 *
 * Asked three ways because a credential may carry any of three identifiers, and
 * a logout may name any of two. The `sid` question is asked first because it is
 * the narrow one: a `sid`-scoped logout ends ONE IdP session, and answering it
 * through the subject would end all of them — so the subject and local-id
 * questions only ever match a logout that named no `sid` (D12).
 *
 * `local_user_id` is the workhorse: it is what an OTP or chat-entry session
 * carries, and a session minted before the Connect claims were wired through
 * is still ended by it (§9.2).
 */
export async function readConnectSessionRevocation(
  execute: SqlExecutor,
  identity: CredentialIdentity,
): Promise<RevocationRead> {
  const cutoff = identity.issuedAtSeconds
  const issuer = identity.issuer ?? null
  const sid = identity.sid ?? null
  const sub = identity.sub ?? null
  const localUserId = identity.localUserId ?? null

  if (sid && issuer) {
    const hit = await execute(
      `SELECT revoked_at FROM connect_session_revocations
        WHERE connect_issuer = $1 AND connect_sid = $2 AND revoked_at > to_timestamp($3)
        ORDER BY revoked_at DESC LIMIT 1`,
      [issuer, sid, cutoff],
    )
    if (hit[0]) return { revoked: true, revokedAfter: tsToSeconds(hit[0].revoked_at) }
  }

  // The two subject-wide questions below match only SUBJECT-WIDE rows
  // (`connect_sid IS NULL`). A sign-out at Connect sends `sid` AND `sub`, so
  // its row carries both; matching it by subject would end every browser the
  // user is signed in on and every credential derived from them, which is
  // exactly what a sign-out must not do. A credential event (a password
  // change, a disable) names no `sid`, and still ends them all.
  if (sub && issuer) {
    const hit = await execute(
      `SELECT revoked_at FROM connect_session_revocations
        WHERE connect_issuer = $1 AND connect_sub = $2 AND connect_sid IS NULL AND revoked_at > to_timestamp($3)
        ORDER BY revoked_at DESC LIMIT 1`,
      [issuer, sub, cutoff],
    )
    if (hit[0]) return { revoked: true, revokedAfter: tsToSeconds(hit[0].revoked_at) }
  }

  if (localUserId != null) {
    const hit = await execute(
      `SELECT revoked_at FROM connect_session_revocations
        WHERE local_user_id = $1 AND connect_sid IS NULL AND revoked_at > to_timestamp($2)
        ORDER BY revoked_at DESC LIMIT 1`,
      [localUserId, cutoff],
    )
    if (hit[0]) return { revoked: true, revokedAfter: tsToSeconds(hit[0].revoked_at) }
  }

  return { revoked: false, revokedAfter: null }
}

export async function isConnectSessionRevoked(execute: SqlExecutor, identity: CredentialIdentity): Promise<boolean> {
  return (await readConnectSessionRevocation(execute, identity)).revoked
}

// ===========================================================================
// The gate the session path calls
// ===========================================================================

/** Cache entries live 60 SECONDS — the estate's acceptance bound (F2: "60 s plus request time"). */
const CACHE_TTL_MS = 60_000

interface CacheEntry {
  value: boolean
  at: number
}

const revokedCache = new Map<string, CacheEntry>()
let anyRevocationsCache: CacheEntry | null = null

/** Test seam — this is process-local state and a test must be able to reset it. */
export function __resetRevocationCacheForTests(): void {
  revokedCache.clear()
  anyRevocationsCache = null
}

/**
 * Is there ANY revocation on record?
 *
 * This is the cheap gate in front of the per-credential query, and it is what
 * keeps this check off the hot path for an installation where Connect is not
 * live: one indexed `LIMIT 1` per process per minute, and no per-user query at
 * all while the table is empty.
 */
async function anyRevocationsExist(execute: SqlExecutor, nowMs: number, maxAgeMs: number): Promise<boolean> {
  if (anyRevocationsCache && nowMs - anyRevocationsCache.at < maxAgeMs) return anyRevocationsCache.value
  const hit = await execute(`SELECT 1 AS one FROM connect_session_revocations LIMIT 1`)
  const value = Boolean(hit[0])
  anyRevocationsCache = { value, at: nowMs }
  return value
}

/**
 * The question the session path asks of every existing token.
 *
 * ON AN UNREADABLE STORE this refuses a credential that carries a Connect
 * binding and admits one that does not, and the asymmetry is deliberate: a
 * database blip signing out every local session is a larger outage than the
 * one it prevents, and a local user's version cannot change without that same
 * database being writable.
 *
 * `maxAgeMs` (default 60 s, never more) bounds how old a cached answer may be.
 *
 * @returns true when the credential must be refused.
 */
export async function isSessionRevokedForToken(
  execute: SqlExecutor | null | undefined,
  identity: CredentialIdentity,
  nowMs: number = Date.now(),
  opts: { maxAgeMs?: number; logger?: Pick<Console, 'error'> } = {},
): Promise<boolean> {
  const hasConnectBinding = Boolean(identity.issuer && (identity.sub || identity.sid))
  const logger = opts.logger ?? console
  const maxAgeMs = Math.min(CACHE_TTL_MS, Math.max(0, opts.maxAgeMs ?? CACHE_TTL_MS))

  if (!execute) return hasConnectBinding

  const cacheKey = [
    identity.issuer ?? '',
    identity.sub ?? '',
    identity.sid ?? '',
    identity.localUserId ?? '',
    identity.issuedAtSeconds,
  ].join('|')

  const cached = revokedCache.get(cacheKey)
  if (cached && nowMs - cached.at < maxAgeMs) return cached.value

  try {
    if (!(await anyRevocationsExist(execute, nowMs, maxAgeMs))) {
      revokedCache.set(cacheKey, { value: false, at: nowMs })
      return false
    }
    const revoked = await isConnectSessionRevoked(execute, identity)
    revokedCache.set(cacheKey, { value: revoked, at: nowMs })
    return revoked
  } catch (err) {
    logger.error('[connect-revocation] revocation check failed:', err)
    // Not cached — an unreadable store must be re-asked on the next request,
    // not remembered for a minute.
    return hasConnectBinding
  }
}

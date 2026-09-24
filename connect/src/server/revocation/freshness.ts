/**
 * ONE use-time check for the authentication epoch and the credential version,
 * called by every RP's `jwt` callback and by the parent's `session-freshness`
 * route (specs.md §4.5, §9.1–§9.4, D24).
 *
 * WHY THIS IS IN THE SDK (p77 STORY-003). Freshness at use time is what makes
 * revocation authoritative across the estate: a logout token that never
 * arrives cannot leave a credential valid, because every RP session re-checks
 * within 60 s. Five apps re-deriving "stale" five ways would give five
 * different answers to one reset.
 *
 * THE QUESTION. A credential in hand — a NextAuth session, a bridge lineage
 * from slides, a raw Connect access token — claims to have been minted under
 * epoch (`aeid`, `cv`). Is that epoch still the live one for this user? If the
 * user has since reset their password, the answer is no, and the credential is
 * refused: not re-stamped, not upgraded, refused.
 *
 * THREE KINDS OF CREDENTIAL, ONE ORDER OF READS:
 *
 *   `oidc`      — a session minted through the Connect provider. Holds the
 *                 access token as its introspection handle; requires `cv` AND
 *                 `aeid`. Reads: revocation ledger → introspection → mirror.
 *   `app_local` — a session minted by OTP or chat-entry for a Connect-bound
 *                 user (D24). Holds no token and NO `aeid` — the missing aeid
 *                 is never the reason for a refusal. Reads: ledger →
 *                 `account-version` lookup by `{ sub, sourceUserRef }` → mirror.
 *   `derived`   — a lineage a PARENT (crm, yobo) checks on slides' behalf
 *                 (§9.4). The parent holds no token for it, so it asks the
 *                 same lookup with the supplied `{ sub, sourceUserRef:
 *                 parentUserId, aeid, grantId }`; its own ledger takes `sid`.
 *
 * WHAT THE LOOKUP'S ANSWER MEANS (D24). `epoch` is Connect's version
 * comparison on `aeid`; `grant` is whether the browser's provider Grant still
 * exists — a sign-out at Connect destroys it, so `grant: 'gone'` IS the
 * sign-out fact with `cv` unchanged. For an `oidc` lineage anything but
 * `grant: 'live'` refuses (gone AND unknown); `epoch: 'stale'` and
 * `active: false` refuse for every kind; `found: false`, a null version,
 * `epoch: 'unknown'` on an oidc lineage, or a transport failure is
 * `unreadable` — refused, and never cached.
 *
 * WHY THE CACHES HOLD VERSIONS, NOT VERDICTS. Every cache here is keyed by
 * what was asked (a user, a token, a lineage) and stores what the issuer SAID
 * (a version, an active flag, an epoch/grant fact), never "this credential is
 * fine". The comparison is re-run on every call against the stored value, so
 * the moment one browser's check learns of version 2, a second credential
 * carrying version 1 is refused from the same cache entry. Entries live at
 * most 60 s (F2's bound), and every read honours `maxAgeMs`: a caller that
 * may only accept a 25 s-old answer (the parent answering slides) gets a
 * re-read.
 *
 * FAIL CLOSED, WITH ONE DELIBERATE SPLIT. A Connect-bound credential is
 * refused when its version cannot be read — the store, the issuer, anything.
 * A local (phone-only, Google-only) credential is admitted with a warning when
 * the local read throws, because a database blip signing out the whole product
 * is a larger outage than the one it prevents, and because a local user's
 * version cannot change without that same database being writable. The split
 * is on the CREDENTIAL's binding, decided before the read.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/credential-freshness.ts
 *   (the Copilot / desktop / runner branches removed; `kind` and the D24
 *   lookup added; the parent-answer facts surfaced on the verdict.)
 */

import { createHash } from 'node:crypto'

import type { SqlExecutor } from '../../adapter/index.js'
import {
  ConnectTransportError,
  introspectConnectToken,
  lookupAccountVersion,
  refreshConnectTokens,
  type AccountVersionAnswer,
  type AccountVersionLookupConfig,
  type ConnectClientConfig,
  type IntrospectionResult,
  type RefreshResult,
} from './introspection.js'
import { isSessionRevokedForToken, readConnectSessionRevocation } from './ledger.js'
import { processState } from '../../internal/process-state.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredentialKind = 'oidc' | 'app_local' | 'derived'

/** The epoch a credential claims to carry, plus what it is a credential FOR. */
export interface CredentialEpoch {
  kind: CredentialKind
  /** Local user id. Every RP credential resolves to one (null only for a bearer token not yet mapped). */
  localUserId: number | null
  /** Issuer half of the Connect binding, when the credential carries it. */
  issuer?: string | null
  /** Connect subject, when the credential carries it. */
  sub?: string | null
  /** IdP session id, when the credential carries it (sid-scoped logout). */
  sid?: string | null
  /** Credential version observed when the credential's ancestry was minted. */
  cv?: number | null
  /** Authentication-epoch id the credential inherits. Absent for `app_local`. */
  aeid?: string | null
  /** The provider Grant the credential descends from (oidc lineages). */
  grantId?: string | null
  /** When THIS credential was minted (its immutable `authTime`), seconds since the epoch. */
  issuedAtSeconds: number
  /** `oidc` only: the Connect access token — the introspection handle. */
  accessToken?: string | null
  /**
   * `oidc` only: the credential IS the access token (the bearer path). Its
   * epoch is whatever introspection reports, so `cv`/`aeid` are filled from
   * the answer rather than required up front. Never set this for anything else.
   */
  epochFromIntrospection?: boolean
  /**
   * The RP-local user reference `rp_identity_map` maps to `sub` — the local
   * user id for `app_local` (defaults to `localUserId`); the PARENT's user id
   * for `derived`.
   */
  sourceUserRef?: string | number | null
  /** `derived` only: the parent's own kind. Defaults to `oidc` when `aeid` is present, else `app_local`. */
  lineage?: 'oidc' | 'app_local'
}

export type FreshnessRefusal =
  /** Connect-bound, but the (issuer, sub) pair is missing — nothing to compare. */
  | 'no_binding'
  /** Connect-bound with no `cv` (or, for an oidc lineage, no `aeid`): minted before the epoch existed. */
  | 'no_epoch'
  /** A back-channel logout landed after this credential was minted. */
  | 'revoked'
  /** The issuer says the token / account is no longer active. */
  | 'inactive'
  /** The carried version is behind the live one, or Connect's epoch comparison says stale. */
  | 'stale'
  /** The browser's provider Grant no longer exists — a sign-out at Connect (D24). */
  | 'grant_gone'
  /** The Grant exists but is bound to another lineage, or Connect cannot place it (oidc lineage only). */
  | 'grant_unknown'
  /** The version could not be read, and this credential must not be admitted unverified. */
  | 'unreadable'

/** The facts a check gathered — what the parent's `session-freshness` answer carries (§9.4). */
export interface FreshnessFacts {
  /** The canonical version the check compared against, when one was read. */
  version: number | null
  active: boolean | null
  epoch: 'fresh' | 'stale' | 'unknown' | null
  grant: 'live' | 'gone' | 'unknown' | null
  /** The newest matching ledger `revoked_at`, seconds, when a revocation matched. */
  revokedAfter: number | null
  /** `nowMs` of the check. */
  checkedAt: number
}

export type FreshnessVerdict =
  | {
      ok: true
      /** The version the credential was compared as carrying. */
      cv: number
      aeid: string | null
      grantId: string | null
      source: 'introspection' | 'lookup' | 'mirror' | 'implied_v1' | 'unverified_local'
      facts: FreshnessFacts
    }
  | { ok: false; reason: FreshnessRefusal; facts: FreshnessFacts }

export interface FreshnessDeps {
  /** Privileged SQL (no RLS context): reads `users`, the ledger. Null = no store. */
  execute: SqlExecutor | null
  /** The RP's confidential client — introspection and refresh. Null = not configured. */
  connect?: ConnectClientConfig | null
  /** The RP key transport for the D24 lookup. Null = not configured. */
  lookup?: AccountVersionLookupConfig | null
  nowMs?: number
  /** A cached version older than this is re-read. Capped at 60 s. */
  maxAgeMs?: number
  logger?: Pick<Console, 'error' | 'warn' | 'log'>
}

/** Cache entries live 60s — the estate's acceptance bound (F2). */
export const FRESHNESS_CACHE_TTL_MS = 60_000

/** Refresh the access token this long before it expires so a check never lands on a dead handle (§4.5). */
export const REFRESH_SKEW_SECONDS = 30

// ---------------------------------------------------------------------------
// Caches — versions and issuer answers, never verdicts
// ---------------------------------------------------------------------------

interface MirrorRow {
  authority: string
  version: number
  issuer: string | null
  sub: string | null
}

// One copy per process, whichever entry imported this module (internal/process-state.ts).
const authorityCache = processState('freshness.authorityCache', () => new Map<number, { row: MirrorRow; at: number }>())
const introspectionCache = processState('freshness.introspectionCache', () => new Map<string, { result: IntrospectionResult; at: number }>())
/** The introspection still running for a token, which concurrent callers share (one POST per token per burst). */
const introspectInFlight = processState('freshness.introspectInFlight', () => new Map<string, Promise<IntrospectionResult>>())
const lookupCache = processState('freshness.lookupCache', () => new Map<string, { answer: AccountVersionAnswer; at: number }>())
const INTROSPECTION_CACHE_MAX = 2_000
const LOOKUP_CACHE_MAX = 10_000
/** Largest version any read has revealed per (issuer, sub). Monotonic. */
const subjectHighWater = processState('freshness.subjectHighWater', () => new Map<string, number>())
/** One refresh exchange per refresh token, remembered until the access token it minted would expire. */
const refreshMemo = processState('freshness.refreshMemo', () => new Map<string, { result: RefreshResult; at: number; ttlMs: number }>())
/** The exchange still running for a refresh token, which every concurrent caller awaits. */
const refreshInFlight = processState('freshness.refreshInFlight', () => new Map<string, Promise<RefreshResult>>())

/** Test seam — this is process-local state and a test must be able to reset it. */
export function __resetFreshnessCachesForTests(): void {
  authorityCache.clear()
  introspectionCache.clear()
  introspectInFlight.clear()
  lookupCache.clear()
  subjectHighWater.clear()
  refreshMemo.clear()
  refreshInFlight.clear()
}

/**
 * Drop one user's cached authority row, so the next read sees a transition
 * this process just wrote (the credential handoff's flip to `connect`).
 */
export function forgetCredentialAuthority(userId: number): void {
  authorityCache.delete(userId)
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const subjectKey = (issuer: string, sub: string) => `${issuer}|${sub}`
const clampAge = (maxAgeMs: number | undefined) =>
  Math.min(FRESHNESS_CACHE_TTL_MS, Math.max(0, maxAgeMs ?? FRESHNESS_CACHE_TTL_MS))

function evictOldest<K, V>(map: Map<K, V>, max: number): void {
  if (map.size < max) return
  const oldest = map.keys().next().value
  if (oldest !== undefined) map.delete(oldest)
}

async function readMirror(
  execute: SqlExecutor,
  userId: number,
  nowMs: number,
  maxAgeMs: number,
): Promise<MirrorRow | null> {
  const hit = authorityCache.get(userId)
  if (hit && nowMs - hit.at < maxAgeMs) return hit.row
  const rows = await execute(
    `SELECT credential_authority, credential_version, connect_issuer, connect_sub FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  )
  const raw = rows[0]
  if (!raw) return null
  const row: MirrorRow = {
    authority: String(raw.credential_authority ?? 'local'),
    version: Number(raw.credential_version ?? 1),
    issuer: (raw.connect_issuer as string | null) ?? null,
    sub: (raw.connect_sub as string | null) ?? null,
  }
  authorityCache.set(userId, { row, at: nowMs })
  return row
}

/**
 * Record that the issuer (or a sign-in, or a logout token) revealed `cv` for
 * this subject. Raises the in-memory high-water mark immediately and the
 * database mirror best-effort: a derived credential checked in another
 * process must learn of the new version too, and the row is where it looks.
 */
export async function observeCredentialVersion(
  execute: SqlExecutor | null | undefined,
  args: { userId: number | null; issuer: string; sub: string; cv: number },
  nowMs: number = Date.now(),
  logger: Pick<Console, 'warn'> = console,
): Promise<void> {
  const key = subjectKey(args.issuer, args.sub)
  const prev = subjectHighWater.get(key) ?? 0
  if (args.cv > prev) subjectHighWater.set(key, args.cv)
  if (args.userId == null || !execute) return
  const cached = authorityCache.get(args.userId)
  if (cached && cached.row.version >= args.cv) return
  try {
    await execute(`UPDATE users SET credential_version = GREATEST(credential_version, $2) WHERE id = $1`, [
      args.userId,
      args.cv,
    ])
    if (cached) {
      authorityCache.set(args.userId, {
        row: { ...cached.row, version: Math.max(cached.row.version, args.cv) },
        at: nowMs,
      })
    }
  } catch (err) {
    // The in-memory mark already rose; the row catches up on the next read.
    logger.warn('[connect-freshness] could not raise the version mirror:', err)
  }
}

async function cachedIntrospect(
  token: string,
  cfg: ConnectClientConfig,
  nowMs: number,
  maxAgeMs: number,
): Promise<IntrospectionResult> {
  const key = sha(token)
  const hit = introspectionCache.get(key)
  if (hit && nowMs - hit.at < maxAgeMs) return hit.result
  const running = introspectInFlight.get(key)
  if (running) return running
  const ask = (async () => {
    try {
      const result = await introspectConnectToken(token, cfg)
      evictOldest(introspectionCache, INTROSPECTION_CACHE_MAX)
      // Both answers are cached: an inactive token never becomes active again,
      // and an active answer is re-compared against the credential on every call.
      introspectionCache.set(key, { result, at: nowMs })
      return result
    } finally {
      introspectInFlight.delete(key)
    }
  })()
  introspectInFlight.set(key, ask)
  return ask
}

const lookupKey = (issuer: string, q: { sub: string; sourceUserRef: string | number; aeid?: string | null; grantId?: string | null }) =>
  [issuer, q.sub, String(q.sourceUserRef), q.aeid ?? '', q.grantId ?? ''].join('|')

/** Is this answer a fact worth remembering, or an indeterminate one that must be re-asked? */
function lookupIsDeterminate(answer: AccountVersionAnswer, q: { aeid?: string | null; grantId?: string | null }): boolean {
  if (!answer.found || answer.cv == null) return false
  if (q.aeid && answer.epoch === 'unknown') return false
  if (q.grantId && answer.grant === 'unknown') return false
  return true
}

async function cachedLookup(
  q: { sub: string; sourceUserRef: string | number; aeid?: string | null; grantId?: string | null },
  cfg: AccountVersionLookupConfig,
  nowMs: number,
  maxAgeMs: number,
): Promise<AccountVersionAnswer> {
  const key = lookupKey(cfg.issuer.replace(/\/+$/, ''), q)
  const hit = lookupCache.get(key)
  if (hit && nowMs - hit.at < maxAgeMs) return hit.answer
  const answer = await lookupAccountVersion(q, cfg)
  // Nothing indeterminate is cached: found:false, a null version, an unknown
  // epoch or grant for a lineage that supplied one — all re-asked next time.
  if (lookupIsDeterminate(answer, q)) {
    evictOldest(lookupCache, LOOKUP_CACHE_MAX)
    lookupCache.set(key, { answer, at: nowMs })
  }
  return answer
}

// ---------------------------------------------------------------------------
// The primitive
// ---------------------------------------------------------------------------

function facts(nowMs: number, patch: Partial<FreshnessFacts> = {}): FreshnessFacts {
  return { version: null, active: null, epoch: null, grant: null, revokedAfter: null, checkedAt: nowMs, ...patch }
}

/**
 * Is this credential's epoch still the live one? See the module comment for
 * the reads per kind and the fail-closed rule.
 */
export async function assertCredentialFresh(epoch: CredentialEpoch, deps: FreshnessDeps): Promise<FreshnessVerdict> {
  const nowMs = deps.nowMs ?? Date.now()
  const maxAgeMs = clampAge(deps.maxAgeMs)
  const logger = deps.logger ?? console
  const execute = deps.execute
  const f: FreshnessFacts = facts(nowMs)
  const refuse = (reason: FreshnessRefusal): FreshnessVerdict => ({ ok: false, reason, facts: f })

  // The credential's own binding decides which rule applies, BEFORE any read
  // that could fail — the split must not itself depend on the store.
  let bound = Boolean(epoch.issuer && epoch.sub)

  let mirror: MirrorRow | null = null
  let mirrorUnreadable = false
  if (epoch.localUserId != null) {
    try {
      mirror = execute ? await readMirror(execute, epoch.localUserId, nowMs, maxAgeMs) : null
      if (!execute) mirrorUnreadable = true
    } catch (err) {
      mirrorUnreadable = true
      logger.error('[connect-freshness] users read failed:', err)
    }
  }
  // A user whose credentials Connect owns is Connect-bound even when the
  // credential in hand predates the binding — that is the legacy cookie the
  // estate refuses in `enforce`. `fenced` is mid-handoff and is not yet Connect's.
  if (mirror?.authority === 'connect') bound = true

  if (!bound) return localVerdict(epoch, mirror, mirrorUnreadable, f, logger)

  // ── Connect-bound ───────────────────────────────────────────────────────
  const lineage: 'oidc' | 'app_local' =
    epoch.kind === 'oidc' ? 'oidc' : epoch.kind === 'app_local' ? 'app_local' : (epoch.lineage ?? (epoch.aeid ? 'oidc' : 'app_local'))

  let cv = epoch.cv ?? null
  let aeid = epoch.aeid ?? null
  let grantId = epoch.grantId ?? null
  let issuer = epoch.issuer ?? null
  let sub = epoch.sub ?? null
  let source: 'introspection' | 'lookup' | 'mirror' = 'mirror'

  // The bearer path (oidc only): the token is the epoch's carrier, so ask
  // first and take the binding and the epoch from the answer.
  if (epoch.kind === 'oidc' && epoch.epochFromIntrospection && epoch.accessToken) {
    const cfg = deps.connect ?? null
    if (!cfg) return refuse('unreadable')
    let r: IntrospectionResult
    try {
      r = await cachedIntrospect(epoch.accessToken, cfg, nowMs, maxAgeMs)
    } catch (err) {
      logTransport(logger, err)
      return refuse('unreadable')
    }
    if (!r.active) {
      f.active = false
      return refuse('inactive')
    }
    f.active = true
    cv = r.cv
    aeid = r.aeid
    grantId = r.grantId
    issuer = issuer ?? cfg.issuer.replace(/\/+$/, '')
    sub = sub ?? r.sub
    source = 'introspection'
  }

  if (!issuer || !sub) return refuse('no_binding')
  // An app_local credential carries no aeid by construction (D24) — its
  // absence is never the reason. An oidc lineage without one was minted
  // before the epoch existed.
  if (cv == null || (lineage === 'oidc' && !aeid)) return refuse('no_epoch')
  if (mirrorUnreadable) return refuse('unreadable')

  // 1. Revocation. The ledger refuses on an unreadable store for a bound
  //    credential, which is the rule here too.
  const identity = { issuer, sub, sid: epoch.sid ?? null, localUserId: epoch.localUserId, issuedAtSeconds: epoch.issuedAtSeconds }
  if (await isSessionRevokedForToken(execute, identity, nowMs, { maxAgeMs, logger })) {
    try {
      if (execute) f.revokedAfter = (await readConnectSessionRevocation(execute, identity)).revokedAfter
    } catch {
      // The fact is decoration; the refusal stands.
    }
    return refuse('revoked')
  }

  // 2. The canonical read.
  if (epoch.kind === 'oidc') {
    // Introspection, when the credential holds a handle (and was not already
    // read above).
    if (epoch.accessToken && !epoch.epochFromIntrospection) {
      const cfg = deps.connect ?? null
      if (!cfg) return refuse('unreadable')
      let r: IntrospectionResult
      try {
        r = await cachedIntrospect(epoch.accessToken, cfg, nowMs, maxAgeMs)
      } catch (err) {
        logTransport(logger, err)
        return refuse('unreadable')
      }
      if (!r.active) {
        f.active = false
        return refuse('inactive')
      }
      f.active = true
      f.version = r.cv
      // The token must report the epoch the credential claims. A mismatch is a
      // credential re-stamped or spliced onto a different token — refuse.
      if (r.cv != null && r.cv !== cv) {
        if (r.cv > cv) await observeCredentialVersion(execute, { userId: epoch.localUserId, issuer, sub, cv: r.cv }, nowMs, logger)
        f.epoch = 'stale'
        return refuse('stale')
      }
      if (r.aeid && r.aeid !== aeid) {
        f.epoch = 'stale'
        return refuse('stale')
      }
      f.epoch = 'fresh'
      grantId = r.grantId
      source = 'introspection'
    }
  } else {
    // app_local and derived: the lineage-aware lookup (D24), never a token.
    const cfg = deps.lookup ?? null
    if (!cfg) return refuse('unreadable')
    const sourceUserRef = epoch.sourceUserRef ?? epoch.localUserId
    if (sourceUserRef == null) return refuse('unreadable')
    const q = { sub, sourceUserRef, aeid, grantId }
    let a: AccountVersionAnswer
    try {
      a = await cachedLookup(q, cfg, nowMs, maxAgeMs)
    } catch (err) {
      logTransport(logger, err)
      return refuse('unreadable')
    }
    f.epoch = a.epoch
    f.grant = a.grant
    f.active = a.active
    f.version = a.cv
    if (!a.found || a.cv == null) return refuse('unreadable')
    if (a.active === false) return refuse('inactive')
    if (a.epoch === 'stale') return refuse('stale')
    if (lineage === 'oidc') {
      // An oidc lineage supplied an aeid and a grant; Connect must be able to
      // place both. `unknown` is never an admission.
      if (a.epoch === 'unknown') return refuse('unreadable')
      if (a.grant === 'gone') return refuse('grant_gone')
      if (a.grant !== 'live') return refuse('grant_unknown')
    } else if (grantId && a.grant === 'gone') {
      return refuse('grant_gone')
    }
    if (a.cv > cv) {
      await observeCredentialVersion(execute, { userId: epoch.localUserId, issuer, sub, cv: a.cv }, nowMs, logger)
      return refuse('stale')
    }
    source = 'lookup'
  }
  if (source !== 'mirror') {
    await observeCredentialVersion(execute, { userId: epoch.localUserId, issuer, sub, cv }, nowMs, logger)
  }

  // 3. The mirror: the largest version anything has revealed for this subject.
  const current = Math.max(mirror?.version ?? 1, subjectHighWater.get(subjectKey(issuer, sub)) ?? 0)
  if (f.version == null) f.version = current
  if (cv < current) {
    f.version = current
    return refuse('stale')
  }
  if (cv > current) {
    // The credential asserts a version newer than any read so far. It came
    // from a signed artifact of ours or from the issuer, so the mark rises —
    // and everything carrying an older version is refused from here on.
    subjectHighWater.set(subjectKey(issuer, sub), cv)
  }

  return { ok: true, cv, aeid, grantId, source, facts: f }
}

function localVerdict(
  epoch: CredentialEpoch,
  mirror: MirrorRow | null,
  unreadable: boolean,
  f: FreshnessFacts,
  logger: Pick<Console, 'warn'>,
): FreshnessVerdict {
  const implied = epoch.cv == null
  const cv = epoch.cv ?? 1
  if (unreadable) {
    logger.warn('[connect-freshness] version unreadable for a local credential — admitted unverified', {
      userId: epoch.localUserId,
    })
    return { ok: true, cv, aeid: null, grantId: null, source: 'unverified_local', facts: f }
  }
  const current = mirror?.version ?? 1
  f.version = current
  if (cv < current) return { ok: false, reason: 'stale', facts: f }
  return { ok: true, cv, aeid: null, grantId: null, source: implied ? 'implied_v1' : 'mirror', facts: f }
}

function logTransport(logger: Pick<Console, 'error'>, err: unknown): void {
  if (err instanceof ConnectTransportError) {
    logger.error('[connect-freshness] issuer unavailable — refusing:', err.message)
  } else {
    logger.error('[connect-freshness] issuer read failed — refusing:', err)
  }
}

// ---------------------------------------------------------------------------
// Session helpers — the NextAuth JWT boundary (§4.5)
// ---------------------------------------------------------------------------

/** The keys the jwt callback keeps on the token. Never copied onto the session. */
export interface SessionEpochToken {
  userId?: number
  iat?: number
  /**
   * Seconds since the epoch — when this session AUTHENTICATED. Stamped once by
   * the jwt callback's sign-in pass and never rewritten. Revocations are
   * compared against this, never `iat`: NextAuth re-stamps `iat` on every
   * re-encode (`next-auth/jwt` `encode` → `setIssuedAt()`), so a session
   * refreshed after a back-channel logout would otherwise look minted after it.
   */
  authTime?: number
  connectIssuer?: string
  connectSub?: string
  connectSid?: string
  /**
   * The Connect ID token, kept ONLY as the `id_token_hint` for signing out
   * through Connect. Never read for identity, never sent to the client.
   */
  connectIdToken?: string
  connectCv?: number
  connectAeid?: string
  connectGrantId?: string
  connectAccessToken?: string
  connectRefreshToken?: string
  /** Seconds since the epoch. */
  connectAccessTokenExpiresAt?: number
  /** `users.credential_version` at sign-in, for a credential with no Connect epoch (local, OTP, chat-entry). */
  localCv?: number
  /** How this session was minted: through the Connect provider, or by OTP / chat-entry (D24). Defaults to `oidc`. */
  connectKind?: 'oidc' | 'app_local'
}

/**
 * When a session authenticated: its immutable `authTime`, or — for a cookie
 * minted before `authTime` existed — its `iat`, the earliest time still known.
 * The jwt callback freezes that fallback into `authTime` on first use, so it
 * stops moving from then on. Null when the token carries neither.
 */
export function sessionAuthTime(token: SessionEpochToken): number | null {
  if (typeof token.authTime === 'number' && Number.isFinite(token.authTime)) return token.authTime
  if (typeof token.iat === 'number' && Number.isFinite(token.iat)) return token.iat
  return null
}

/**
 * Exchange the session's refresh token at most ONCE per refresh token. NextAuth
 * v4 cannot write the rotated token back to the cookie from a server-side
 * `getServerSession` (app-router `setHeader` is a no-op), so the next request
 * arrives carrying the SAME refresh token; presenting it again would trip the
 * IdP's reuse detection and revoke the family. The memo answers the repeat
 * from memory until the client's own `/api/auth/session` round-trip persists
 * the rotated pair.
 *
 * Callers that arrive while the exchange is still running share it: the
 * in-flight promise is registered before any other caller can run, so one
 * process sends one POST per refresh token however many requests race. The
 * result is remembered before the in-flight entry is released, so no caller
 * finds neither. Across instances there is no lock; D14 has the IdP accept a
 * repeated refresh token from a confidential first-party client instead.
 */
export async function refreshConnectSessionOnce(
  refreshToken: string,
  cfg: ConnectClientConfig,
  nowMs: number = Date.now(),
): Promise<RefreshResult> {
  const key = sha(refreshToken)
  const hit = refreshMemo.get(key)
  if (hit && nowMs - hit.at < hit.ttlMs) return hit.result
  const running = refreshInFlight.get(key)
  if (running) return running

  const exchange = (async () => {
    try {
      const result = await refreshConnectTokens(refreshToken, cfg, nowMs)
      const ttlMs =
        result.ok && result.expiresAt != null
          ? Math.max(0, result.expiresAt * 1000 - nowMs - REFRESH_SKEW_SECONDS * 1000)
          : FRESHNESS_CACHE_TTL_MS
      refreshMemo.set(key, { result, at: nowMs, ttlMs })
      return result
    } finally {
      refreshInFlight.delete(key)
    }
  })()
  refreshInFlight.set(key, exchange)
  return exchange
}

/**
 * The jwt-callback gate for an EXISTING token. Refreshes the introspection
 * handle when it is about to expire (mutating `token` in place so a persisting
 * caller keeps the rotated pair), then runs {@link assertCredentialFresh}.
 *
 * A Connect (`oidc`) session with no access token, no `cv` or no `aeid` — one
 * minted before this shipped — is refused (`no_epoch`); an `app_local` session
 * needs only `(issuer, sub)` and a version; a session with no binding is
 * read against the local mirror, version 1 when it carries none.
 */
export async function assertSessionTokenFresh(token: SessionEpochToken, deps: FreshnessDeps): Promise<FreshnessVerdict> {
  const nowMs = deps.nowMs ?? Date.now()
  const issuedAt = sessionAuthTime(token) ?? Math.floor(nowMs / 1000)
  const localUserId = typeof token.userId === 'number' ? token.userId : null
  const isConnect = Boolean(token.connectIssuer && token.connectSub)

  if (!isConnect) {
    return assertCredentialFresh(
      { kind: 'app_local', localUserId, cv: token.localCv ?? null, issuedAtSeconds: issuedAt },
      deps,
    )
  }

  if ((token.connectKind ?? 'oidc') === 'app_local') {
    return assertCredentialFresh(
      {
        kind: 'app_local',
        localUserId,
        issuer: token.connectIssuer,
        sub: token.connectSub,
        sid: token.connectSid ?? null,
        cv: token.connectCv ?? token.localCv ?? null,
        sourceUserRef: localUserId,
        issuedAtSeconds: issuedAt,
      },
      deps,
    )
  }

  if (!token.connectAccessToken) {
    // A Connect session with no introspection handle was minted before the
    // epoch transport existed (§4.5 legacy artifacts) — refused, not grandfathered.
    return { ok: false, reason: 'no_epoch', facts: facts(nowMs) }
  }

  const cfg = deps.connect ?? null
  const expiresAt = token.connectAccessTokenExpiresAt
  const expiring = expiresAt != null && expiresAt - REFRESH_SKEW_SECONDS <= Math.floor(nowMs / 1000)
  if (expiring && token.connectRefreshToken) {
    if (!cfg) return { ok: false, reason: 'unreadable', facts: facts(nowMs) }
    let refreshed: RefreshResult
    try {
      refreshed = await refreshConnectSessionOnce(token.connectRefreshToken, cfg, nowMs)
    } catch (err) {
      logTransport(deps.logger ?? console, err)
      return { ok: false, reason: 'unreadable', facts: facts(nowMs) }
    }
    if (!refreshed.ok) {
      ;(deps.logger ?? console).log('[connect-freshness] refresh refused by the issuer:', refreshed.error)
      return { ok: false, reason: 'stale', facts: facts(nowMs, { active: false }) }
    }
    token.connectAccessToken = refreshed.accessToken
    if (refreshed.refreshToken) token.connectRefreshToken = refreshed.refreshToken
    if (refreshed.expiresAt != null) token.connectAccessTokenExpiresAt = refreshed.expiresAt
  }

  return assertCredentialFresh(
    {
      kind: 'oidc',
      localUserId,
      issuer: token.connectIssuer,
      sub: token.connectSub,
      sid: token.connectSid ?? null,
      cv: token.connectCv ?? null,
      aeid: token.connectAeid ?? null,
      grantId: token.connectGrantId ?? null,
      issuedAtSeconds: issuedAt,
      accessToken: token.connectAccessToken ?? null,
    },
    deps,
  )
}

/**
 * The sign-in half: stamp the epoch onto a fresh Connect token. NextAuth's
 * `account` is the only place the access token exists, and /userinfo cannot
 * carry `cv`/`aeid` (§4.5), so the token is introspected ONCE here and the
 * answer written as `connectCv`/`connectAeid`/`connectGrantId`. Set-or-delete:
 * a sign-in that yields no epoch must not keep an old one, and the session it
 * produces is then refused at first use as `no_epoch` — which is the
 * fail-closed outcome, not an accident.
 */
export async function stampConnectEpochOnSignIn(
  token: SessionEpochToken,
  account: { access_token?: string; refresh_token?: string; expires_at?: number } | null | undefined,
  deps: FreshnessDeps,
  /** The local user id — `token.userId` is written AFTER this runs in the sign-in pass. */
  userId: number | null = typeof token.userId === 'number' ? token.userId : null,
): Promise<void> {
  const logger = deps.logger ?? console
  delete token.connectCv
  delete token.connectAeid
  delete token.connectGrantId
  delete token.connectAccessToken
  delete token.connectRefreshToken
  delete token.connectAccessTokenExpiresAt
  token.connectKind = 'oidc'

  const accessToken = account?.access_token
  if (!accessToken) {
    logger.error('[connect-freshness] Connect sign-in produced no access token — session will be refused')
    return
  }
  token.connectAccessToken = accessToken
  if (account?.refresh_token) token.connectRefreshToken = account.refresh_token
  if (typeof account?.expires_at === 'number') token.connectAccessTokenExpiresAt = account.expires_at

  const cfg = deps.connect ?? null
  if (!cfg) {
    logger.error('[connect-freshness] Connect client not configured — session will be refused')
    return
  }
  let r: IntrospectionResult
  try {
    r = await introspectConnectToken(accessToken, cfg)
  } catch (err) {
    logTransport(logger, err)
    return
  }
  if (!r.active || r.cv == null || !r.aeid) {
    logger.error('[connect-freshness] Connect sign-in token carries no epoch — session will be refused', {
      active: r.active,
      hasCv: r.active ? r.cv != null : false,
      hasAeid: r.active ? Boolean(r.aeid) : false,
    })
    return
  }
  token.connectCv = r.cv
  token.connectAeid = r.aeid
  if (r.grantId) token.connectGrantId = r.grantId
  // Prime the introspection cache with the answer just obtained so the first
  // use does not ask again inside the same minute.
  introspectionCache.set(sha(accessToken), { result: r, at: deps.nowMs ?? Date.now() })
  if (token.connectIssuer && token.connectSub) {
    await observeCredentialVersion(
      deps.execute,
      { userId, issuer: token.connectIssuer, sub: token.connectSub, cv: r.cv },
      deps.nowMs,
      logger,
    )
  }
}

/** Read `users.credential_version` for stamping a LOCAL / app_local sign-in. Null when unreadable. */
export async function readLocalCredentialVersion(
  execute: SqlExecutor,
  userId: number,
  logger: Pick<Console, 'error'> = console,
): Promise<number | null> {
  try {
    const row = await readMirror(execute, userId, Date.now(), FRESHNESS_CACHE_TTL_MS)
    return row?.version ?? null
  } catch (err) {
    logger.error('[connect-freshness] could not read credential_version at sign-in:', err)
    return null
  }
}

/** What a bridge mint carries of its parent (§9.4 step 1) — the complete lineage. */
export interface DerivedLineage {
  kind: 'oidc' | 'app_local'
  issuer: string
  sub: string
  sid: string | null
  cv: number
  aeid: string | null
  grantId: string | null
  /** The parent's immutable `authTime`, seconds. */
  authTime: number
  parentUserId: number
}

/**
 * The lineage a DERIVED credential (a slides bridge) inherits from a parent
 * session token, or null when the token carries none — a legacy parent session
 * mints a bridge with no lineage, which slides treats per D20.
 */
export function derivedLineageFromToken(token: SessionEpochToken): DerivedLineage | null {
  if (!token.connectIssuer || !token.connectSub || typeof token.userId !== 'number') return null
  const authTime = sessionAuthTime(token)
  if (authTime == null) return null
  const kind = token.connectKind ?? 'oidc'
  if (kind === 'oidc') {
    if (token.connectCv == null || !token.connectAeid) return null
    return {
      kind,
      issuer: token.connectIssuer,
      sub: token.connectSub,
      sid: token.connectSid ?? null,
      cv: token.connectCv,
      aeid: token.connectAeid,
      grantId: token.connectGrantId ?? null,
      authTime,
      parentUserId: token.userId,
    }
  }
  const cv = token.connectCv ?? token.localCv
  if (cv == null) return null
  return {
    kind,
    issuer: token.connectIssuer,
    sub: token.connectSub,
    sid: token.connectSid ?? null,
    cv,
    aeid: null,
    grantId: null,
    authTime,
    parentUserId: token.userId,
  }
}

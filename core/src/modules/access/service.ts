/**
 * Access service (p107 ACC-001): codes, redemptions, waitlist, app settings.
 *
 * Every function takes `db | tx` first so the app runs the account-creating
 * writes (`redeem`, `consumeForSignup`, `getOrIssuePersonalCode`) inside its
 * own account transaction. One service per app slug (`createAccessService({ app })`).
 *
 * Rule 3 (counted under a lock): `redeem` is ONE conditional UPDATE. Under
 * READ COMMITTED a second writer blocks on the row lock, then re-evaluates the
 * WHERE and gets 0 rows → `AccessCodeExhaustedError` → the caller's tx rolls back.
 */
import { createHash, randomBytes } from 'node:crypto';

import { and, desc, eq, gt, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

import { CODE_RE, generateCode, normalizeCode } from './codes';
import { accessCodes, accessRedemptions, appAccessSettings, waitlistEntries } from './schema';
import type {
  AccessCode,
  AccessCodeKind,
  AccessCodeStatus,
  AccessDecision,
  AccessMode,
  AppAccessSettings,
  CodeRefusalReason,
  CreateCodeInput,
  DecideInput,
  RedeemInput,
  ValidateResult,
  WaitlistEntry,
  WaitlistQuestion,
  WaitlistState,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AccessDb = PgDatabase<any, any, any>;

export const DEFAULT_PERSONAL_CODE_CAP = 10;
export const DEFAULT_ACCESS_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AccessError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'AccessError';
  }
}

/** Thrown inside the account tx when the conditional UPDATE matched 0 rows. */
export class AccessCodeExhaustedError extends AccessError {
  constructor(readonly codeId: number) {
    super('exhausted', `access code ${codeId} has no use left`);
    this.name = 'AccessCodeExhaustedError';
  }
}

export class AccessCodeTakenError extends AccessError {
  constructor(code: string) {
    super('code_taken', `access code ${code} already exists`);
    this.name = 'AccessCodeTakenError';
  }
}

export class AccessCodeFormatError extends AccessError {
  constructor(code: string) {
    super('invalid_format', `access code "${code}" does not match ${CODE_RE}`);
    this.name = 'AccessCodeFormatError';
  }
}

/** A waitlist transition was asked from a state that does not allow it (or the entry is gone). */
export class WaitlistStateError extends AccessError {
  constructor(
    readonly entryId: number,
    readonly expected: WaitlistState[],
  ) {
    super('invalid_state', `waitlist entry ${entryId} is not ${expected.join('/')}`);
    this.name = 'WaitlistStateError';
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Pure: does a looked-up code row count? Order of checks fixes which reason wins:
 * not_found → revoked → expired → exhausted → wrong_email → email_unverified → no_access.
 *
 * A code with `bound_email` counts only when `emailVerified === true`: matching
 * an address the signup has not proved it owns would let anyone squat an invite.
 */
export function evaluateCode(
  row: AccessCode | null | undefined,
  opts: { email?: string | null; emailVerified?: boolean; now: Date; requireGrant?: boolean },
): ValidateResult {
  if (!row) return { ok: false, reason: 'not_found' };
  const fail = (reason: CodeRefusalReason): ValidateResult => ({ ok: false, reason, code: row });
  if (row.status === 'revoked') return fail('revoked');
  if (row.expiresAt && row.expiresAt.getTime() <= opts.now.getTime()) return fail('expired');
  if (row.maxUses !== null && row.uses >= row.maxUses) return fail('exhausted');
  if (row.boundEmail && !sameEmail(row.boundEmail, opts.email)) return fail('wrong_email');
  if (row.boundEmail && opts.emailVerified !== true) return fail('email_unverified');
  if (opts.requireGrant && !row.grantsAccess) return fail('no_access');
  return { ok: true, code: row };
}

export interface DecisionFacts {
  mode: AccessMode;
  /** Result of validating the presented code; undefined when none was presented. */
  presented?: ValidateResult;
  /** Approved, unexpired waitlist entry for this person, if any. */
  waitlistEntryId?: number | null;
  /** Active single_use code bound to this email (org invite), if any. */
  boundInviteCodeId?: number | null;
}

/**
 * Pure gate decision (implementation.md §ACC-003):
 * - off       → allow, no redemption.
 * - optional  → allow; redeem the presented code when it is valid (grants_access ignored).
 * - required  → allow iff (a) presented code valid AND grants_access, or (b) waitlist grant,
 *               or (c) bound single_use invite; else the code's reason or `code_required`.
 */
export function decideAccess(facts: DecisionFacts): AccessDecision {
  const { mode, presented } = facts;
  if (mode === 'off') return { allow: true, mode, via: 'off' };

  if (mode === 'optional') {
    if (presented?.ok) return { allow: true, mode, via: 'code', codeId: presented.code.id };
    if (presented && !presented.ok) {
      return { allow: true, mode, via: 'no_code', ignoredCodeReason: presented.reason };
    }
    return { allow: true, mode, via: 'no_code' };
  }

  // required
  if (presented?.ok && presented.code.grantsAccess) {
    return { allow: true, mode, via: 'code', codeId: presented.code.id };
  }
  if (facts.waitlistEntryId) {
    return {
      allow: true,
      mode,
      via: 'waitlist',
      waitlistEntryId: facts.waitlistEntryId,
      // A valid (non-granting) code still gets its attribution.
      ...(presented?.ok ? { codeId: presented.code.id } : {}),
    };
  }
  if (facts.boundInviteCodeId) {
    return { allow: true, mode, via: 'bound_invite', codeId: facts.boundInviteCodeId };
  }
  if (presented) {
    return { allow: false, mode, reason: presented.ok ? 'no_access' : presented.reason };
  }
  return { allow: false, mode, reason: 'code_required' };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type CodeRow = typeof accessCodes.$inferSelect;
type WaitlistRow = typeof waitlistEntries.$inferSelect;
type SettingsRow = typeof appAccessSettings.$inferSelect;

function toCode(r: CodeRow): AccessCode {
  return { ...r, kind: r.kind as AccessCodeKind, status: r.status as AccessCodeStatus };
}

function toEntry(r: WaitlistRow): WaitlistEntry {
  return {
    ...r,
    answers: (r.answers ?? {}) as Record<string, unknown>,
    state: r.state as WaitlistState,
    resendHistory: r.resendHistory ?? [],
  };
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CreateAccessServiceOptions {
  /** App slug (one per Connect instance, e.g. `cadra`). */
  app: string;
  /** Clock (tests). */
  now?: () => Date;
  /** Waitlist access-link lifetime. Default 14 days (OQ6). */
  accessLinkTtlMs?: number;
  /** Generated code length. Default 8 (OQ2). */
  codeLength?: number;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
}

export interface SettingsPatch {
  mode?: AccessMode;
  personalCodeDefaultCap?: number;
  waitlistQuestions?: WaitlistQuestion[];
  copy?: Record<string, string>;
}

export function createAccessService(options: CreateAccessServiceOptions) {
  const { app } = options;
  const now = options.now ?? (() => new Date());
  const ttlMs = options.accessLinkTtlMs ?? DEFAULT_ACCESS_LINK_TTL_MS;
  const codeLength = options.codeLength ?? 8;

  const codeMatch = (code: string): SQL =>
    and(eq(accessCodes.app, app), sql`upper(${accessCodes.code}) = upper(${normalizeCode(code)})`)!;

  // ---- settings ----------------------------------------------------------

  /** Missing row → defaults with mode `off`. A read ERROR propagates (callers fail closed). */
  async function getAppSettings(db: AccessDb): Promise<AppAccessSettings> {
    const rows = await db.select().from(appAccessSettings).where(eq(appAccessSettings.app, app)).limit(1);
    const r: SettingsRow | undefined = rows[0];
    if (!r) {
      return {
        app,
        mode: 'off',
        personalCodeDefaultCap: DEFAULT_PERSONAL_CODE_CAP,
        waitlistQuestions: [],
        copy: {},
        exists: false,
      };
    }
    return {
      app,
      mode: r.mode as AccessMode,
      personalCodeDefaultCap: r.personalCodeDefaultCap,
      waitlistQuestions: r.waitlistQuestions ?? [],
      copy: r.copy ?? {},
      exists: true,
    };
  }

  async function getAppMode(db: AccessDb): Promise<AccessMode> {
    return (await getAppSettings(db)).mode;
  }

  async function updateAppSettings(
    db: AccessDb,
    patch: SettingsPatch,
    updatedBy?: number | null,
  ): Promise<AppAccessSettings> {
    const current = await getAppSettings(db);
    const next = {
      app,
      mode: patch.mode ?? current.mode,
      personalCodeDefaultCap: patch.personalCodeDefaultCap ?? current.personalCodeDefaultCap,
      waitlistQuestions: patch.waitlistQuestions ?? current.waitlistQuestions,
      copy: patch.copy ?? current.copy,
      updatedBy: updatedBy ?? null,
      updatedAt: now(),
    };
    await db
      .insert(appAccessSettings)
      .values(next)
      .onConflictDoUpdate({
        target: appAccessSettings.app,
        set: {
          mode: next.mode,
          personalCodeDefaultCap: next.personalCodeDefaultCap,
          waitlistQuestions: next.waitlistQuestions,
          copy: next.copy,
          updatedBy: next.updatedBy,
          updatedAt: next.updatedAt,
        },
      });
    return getAppSettings(db);
  }

  // ---- codes -------------------------------------------------------------

  async function findCode(db: AccessDb, code: string): Promise<AccessCode | null> {
    if (!CODE_RE.test(normalizeCode(code))) return null;
    const rows = await db.select().from(accessCodes).where(codeMatch(code)).limit(1);
    return rows[0] ? toCode(rows[0]) : null;
  }

  async function getCode(db: AccessDb, codeId: number): Promise<AccessCode | null> {
    const rows = await db
      .select()
      .from(accessCodes)
      .where(and(eq(accessCodes.id, codeId), eq(accessCodes.app, app)))
      .limit(1);
    return rows[0] ? toCode(rows[0]) : null;
  }

  async function createCode(db: AccessDb, input: CreateCodeInput): Promise<AccessCode> {
    const vanity = input.code !== undefined;
    if (vanity && !CODE_RE.test(normalizeCode(input.code!))) throw new AccessCodeFormatError(input.code!);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = vanity ? normalizeCode(input.code!) : generateCode(codeLength);
      try {
        const rows = await db
          .insert(accessCodes)
          .values({
            code,
            kind: input.kind,
            ownerUserId: input.ownerUserId ?? null,
            app,
            maxUses: input.maxUses ?? null,
            expiresAt: input.expiresAt ?? null,
            tag: input.tag ?? null,
            grantsAccess: input.grantsAccess ?? true,
            boundEmail: input.boundEmail ? input.boundEmail.trim().toLowerCase() : null,
            createdBy: input.createdBy ?? null,
          })
          .returning();
        return toCode(rows[0]!);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (vanity) throw new AccessCodeTakenError(code);
        // generated collision → retry with a fresh code
      }
    }
    throw new Error('createCode: could not generate a unique code after 5 attempts');
  }

  async function revokeCode(db: AccessDb, codeId: number): Promise<AccessCode | null> {
    const rows = await db
      .update(accessCodes)
      .set({ status: 'revoked', updatedAt: now() })
      .where(and(eq(accessCodes.id, codeId), eq(accessCodes.app, app)))
      .returning();
    return rows[0] ? toCode(rows[0]) : null;
  }

  /** Raise (or set) a code's cap — e.g. one person's personal code. `null` = unlimited. */
  async function setCodeMaxUses(db: AccessDb, codeId: number, maxUses: number | null): Promise<AccessCode | null> {
    const rows = await db
      .update(accessCodes)
      .set({ maxUses, updatedAt: now() })
      .where(and(eq(accessCodes.id, codeId), eq(accessCodes.app, app)))
      .returning();
    return rows[0] ? toCode(rows[0]) : null;
  }

  async function listCodes(
    db: AccessDb,
    opts: ListOptions & { kind?: AccessCodeKind; status?: AccessCodeStatus } = {},
  ): Promise<AccessCode[]> {
    const conds: SQL[] = [eq(accessCodes.app, app)];
    if (opts.kind) conds.push(eq(accessCodes.kind, opts.kind));
    if (opts.status) conds.push(eq(accessCodes.status, opts.status));
    const rows = await db
      .select()
      .from(accessCodes)
      .where(and(...conds))
      .orderBy(desc(accessCodes.id))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);
    return rows.map(toCode);
  }

  /**
   * The user's personal code for this app, issued on first call
   * (cap = settings `personal_code_default_cap`). Idempotent; safe in the account tx.
   */
  async function getOrIssuePersonalCode(db: AccessDb, userId: number): Promise<AccessCode> {
    const find = async () => {
      const rows = await db
        .select()
        .from(accessCodes)
        .where(and(eq(accessCodes.app, app), eq(accessCodes.kind, 'personal'), eq(accessCodes.ownerUserId, userId)))
        .limit(1);
      return rows[0] ? toCode(rows[0]) : null;
    };
    const existing = await find();
    if (existing) return existing;
    const { personalCodeDefaultCap } = await getAppSettings(db);
    for (let attempt = 0; attempt < 5; attempt++) {
      // ON CONFLICT DO NOTHING covers both the per-owner partial unique and a code collision
      // without aborting an enclosing transaction.
      await db
        .insert(accessCodes)
        .values({
          code: generateCode(codeLength),
          kind: 'personal',
          ownerUserId: userId,
          app,
          maxUses: personalCodeDefaultCap,
          grantsAccess: true,
          createdBy: userId,
        })
        .onConflictDoNothing();
      const row = await find();
      if (row) return row;
    }
    throw new Error(`getOrIssuePersonalCode: could not issue a code for user ${userId}`);
  }

  async function validate(
    db: AccessDb,
    input: { code: string; email?: string | null; emailVerified?: boolean; requireGrant?: boolean },
  ): Promise<ValidateResult> {
    const row = await findCode(db, input.code);
    return evaluateCode(row, {
      email: input.email,
      emailVerified: input.emailVerified,
      now: now(),
      requireGrant: input.requireGrant,
    });
  }

  /** An active, unexpired, not-exhausted single_use code bound to `email` (org invite). */
  async function findBoundInvite(db: AccessDb, email: string): Promise<AccessCode | null> {
    const t = now();
    const rows = await db
      .select()
      .from(accessCodes)
      .where(
        and(
          eq(accessCodes.app, app),
          eq(accessCodes.kind, 'single_use'),
          eq(accessCodes.status, 'active'),
          eq(accessCodes.grantsAccess, true),
          sql`lower(${accessCodes.boundEmail}) = ${email.trim().toLowerCase()}`,
          or(isNull(accessCodes.expiresAt), gt(accessCodes.expiresAt, t)),
          or(isNull(accessCodes.maxUses), lt(accessCodes.uses, accessCodes.maxUses)),
        ),
      )
      .orderBy(desc(accessCodes.id))
      .limit(1);
    return rows[0] ? toCode(rows[0]) : null;
  }

  // ---- gate ----------------------------------------------------------------

  /**
   * Gate decision for a first sign-in (no account has this email/binding yet).
   * Call BEFORE the account tx; on allow, the app redeems `codeId` and consumes
   * `waitlistEntryId` inside the account tx. A settings read error → refuse `unavailable`.
   *
   * Email-only grants (approved entry matched by email, bound invite, bound code)
   * need `input.emailVerified === true`; an unverified signup needs a non-bound
   * granting code or a waitlist token / signed entry id.
   */
  async function decide(db: AccessDb, input: DecideInput): Promise<AccessDecision> {
    // `=== true`: a JS caller that omits the field gets the safe answer.
    const emailVerified = input.emailVerified === true;
    let mode: AccessMode;
    try {
      mode = await getAppMode(db);
    } catch {
      return { allow: false, mode: null, reason: 'unavailable' };
    }
    if (mode === 'off') return decideAccess({ mode });

    const presented = input.code
      ? await validate(db, { code: input.code, email: input.email, emailVerified })
      : undefined;
    if (mode === 'optional' || (presented?.ok && presented.code.grantsAccess)) {
      return decideAccess({ mode, presented });
    }

    // (b) the grant from the access link (any email — the link is the grant), else an
    // approved entry for this email — only when the email is verified.
    const granted =
      input.waitlistEntryId || input.waitlistToken
        ? await findApprovedWaitlistEntry(db, {
            entryId: input.waitlistEntryId ?? undefined,
            token: input.waitlistToken ?? undefined,
          })
        : null;
    const entry =
      granted ?? (emailVerified ? await findApprovedWaitlistEntry(db, { email: input.email }) : null);
    // (c) bound single_use invite — only when the email is verified.
    const bound = entry || !emailVerified ? null : await findBoundInvite(db, input.email);
    return decideAccess({
      mode,
      presented,
      waitlistEntryId: entry?.id ?? null,
      boundInviteCodeId: bound?.id ?? null,
    });
  }

  /**
   * Count one use of a code — the last-use lock, with no redemption row. Run INSIDE
   * the caller's tx. 0 rows (revoked, expired, or the last use went to a concurrent
   * tx) → throws `AccessCodeExhaustedError`, which must roll that tx back.
   *
   * `redeem()` is this plus the `access_redemptions` insert. Exported for an app
   * that records the redemption in its own table (an RP account with no Connect user).
   */
  async function claimUse(tx: AccessDb, codeId: number, t: Date = now()): Promise<{ id: number; uses: number }> {
    const updated = await tx
      .update(accessCodes)
      .set({ uses: sql`${accessCodes.uses} + 1`, updatedAt: t })
      .where(
        and(
          eq(accessCodes.id, codeId),
          eq(accessCodes.app, app),
          eq(accessCodes.status, 'active'),
          or(isNull(accessCodes.maxUses), lt(accessCodes.uses, accessCodes.maxUses)),
          or(isNull(accessCodes.expiresAt), gt(accessCodes.expiresAt, t)),
        ),
      )
      .returning({ id: accessCodes.id, uses: accessCodes.uses });
    if (updated.length === 0) throw new AccessCodeExhaustedError(codeId);
    return updated[0]!;
  }

  /**
   * Count one use and record the redemption. Run INSIDE the account tx.
   * 0 rows (revoked, expired, or the last use went to a concurrent tx) → throws
   * `AccessCodeExhaustedError`, which must roll the account tx back.
   */
  async function redeem(tx: AccessDb, input: RedeemInput) {
    const t = now();
    await claimUse(tx, input.codeId, t);
    const [redemption] = await tx
      .insert(accessRedemptions)
      .values({
        codeId: input.codeId,
        userId: input.userId,
        app,
        source: input.source,
        firstTouchAt: input.firstTouchAt ?? null,
        redeemedAt: t,
      })
      .returning();
    return redemption!;
  }

  // ---- waitlist ------------------------------------------------------------

  /** One `pending` row per (app, lower(email)); a duplicate submit returns the existing row. */
  async function submit(
    db: AccessDb,
    input: { email: string; answers: Record<string, unknown>; sourceCodeId?: number | null },
  ): Promise<{ entry: WaitlistEntry; created: boolean }> {
    const email = input.email.trim().toLowerCase();
    const inserted = await db
      .insert(waitlistEntries)
      .values({ app, email, answers: input.answers, sourceCodeId: input.sourceCodeId ?? null })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return { entry: toEntry(inserted[0]), created: true };
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.app, app),
          sql`lower(${waitlistEntries.email}) = ${email}`,
          eq(waitlistEntries.state, 'pending'),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error('waitlist submit: insert skipped but no pending entry found');
    return { entry: toEntry(rows[0]), created: false };
  }

  async function getWaitlistEntry(db: AccessDb, entryId: number): Promise<WaitlistEntry | null> {
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.app, app)))
      .limit(1);
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async function listWaitlist(
    db: AccessDb,
    opts: ListOptions & { state?: WaitlistState } = {},
  ): Promise<WaitlistEntry[]> {
    const conds: SQL[] = [eq(waitlistEntries.app, app)];
    if (opts.state) conds.push(eq(waitlistEntries.state, opts.state));
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(and(...conds))
      .orderBy(desc(waitlistEntries.id))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);
    return rows.map(toEntry);
  }

  function mintToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashAccessToken(token), expiresAt: new Date(now().getTime() + ttlMs) };
  }

  /** pending → approved. Returns the raw token ONCE (only its sha256 is stored). */
  async function approve(db: AccessDb, entryId: number, decidedBy?: number | null) {
    const { token, hash, expiresAt } = mintToken();
    const t = now();
    const rows = await db
      .update(waitlistEntries)
      .set({ state: 'approved', accessTokenHash: hash, expiresAt, decidedBy: decidedBy ?? null, decidedAt: t, updatedAt: t })
      .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.app, app), eq(waitlistEntries.state, 'pending')))
      .returning();
    if (!rows[0]) throw new WaitlistStateError(entryId, ['pending']);
    return { entry: toEntry(rows[0]), token, expiresAt };
  }

  /** pending|approved → rejected (token cleared). */
  async function reject(db: AccessDb, entryId: number, decidedBy?: number | null): Promise<WaitlistEntry> {
    const t = now();
    const rows = await db
      .update(waitlistEntries)
      .set({ state: 'rejected', accessTokenHash: null, decidedBy: decidedBy ?? null, decidedAt: t, updatedAt: t })
      .where(
        and(
          eq(waitlistEntries.id, entryId),
          eq(waitlistEntries.app, app),
          sql`${waitlistEntries.state} IN ('pending','approved')`,
        ),
      )
      .returning();
    if (!rows[0]) throw new WaitlistStateError(entryId, ['pending', 'approved']);
    return toEntry(rows[0]);
  }

  /**
   * approved → approved with a fresh token + expiry. The old token stops working;
   * `{hash: first 12 hex of the old hash, at}` is appended to `resend_history`.
   */
  async function resend(db: AccessDb, entryId: number) {
    const { token, hash, expiresAt } = mintToken();
    const t = now();
    const event = sql`jsonb_build_array(jsonb_build_object('hash', left(coalesce(${waitlistEntries.accessTokenHash}, ''), 12), 'at', ${t.toISOString()}::text))`;
    const rows = await db
      .update(waitlistEntries)
      .set({
        accessTokenHash: hash,
        expiresAt,
        resendHistory: sql`${waitlistEntries.resendHistory} || ${event}`,
        updatedAt: t,
      })
      .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.app, app), eq(waitlistEntries.state, 'approved')))
      .returning();
    if (!rows[0]) throw new WaitlistStateError(entryId, ['approved']);
    return { entry: toEntry(rows[0]), token, expiresAt };
  }

  /**
   * The approved, unexpired entry matching a raw token, an entry id (from a
   * verified signed cookie) or — when neither is given — the email.
   * When `email` is given with a token/id, the entry's email must match.
   */
  async function findApprovedWaitlistEntry(
    db: AccessDb,
    by: { token?: string; entryId?: number; email?: string },
  ): Promise<WaitlistEntry | null> {
    const conds: SQL[] = [
      eq(waitlistEntries.app, app),
      eq(waitlistEntries.state, 'approved'),
      gt(waitlistEntries.expiresAt, now()),
    ];
    if (by.token) conds.push(eq(waitlistEntries.accessTokenHash, hashAccessToken(by.token)));
    else if (by.entryId) conds.push(eq(waitlistEntries.id, by.entryId));
    else if (!by.email) return null;
    if (by.email) conds.push(sql`lower(${waitlistEntries.email}) = ${by.email.trim().toLowerCase()}`);
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(and(...conds))
      .orderBy(desc(waitlistEntries.id))
      .limit(1);
    return rows[0] ? toEntry(rows[0]) : null;
  }

  /** approved (unexpired) → signed_up, once. Run INSIDE the account tx. */
  async function consumeForSignup(tx: AccessDb, entryId: number, userId: number): Promise<WaitlistEntry> {
    const t = now();
    const rows = await tx
      .update(waitlistEntries)
      .set({ state: 'signed_up', userId, accessTokenHash: null, updatedAt: t })
      .where(
        and(
          eq(waitlistEntries.id, entryId),
          eq(waitlistEntries.app, app),
          eq(waitlistEntries.state, 'approved'),
          gt(waitlistEntries.expiresAt, t),
        ),
      )
      .returning();
    if (!rows[0]) throw new WaitlistStateError(entryId, ['approved']);
    return toEntry(rows[0]);
  }

  return {
    app,
    // settings
    getAppSettings,
    getAppMode,
    updateAppSettings,
    // codes
    findCode,
    getCode,
    createCode,
    revokeCode,
    setCodeMaxUses,
    listCodes,
    getOrIssuePersonalCode,
    validate,
    findBoundInvite,
    // gate
    decide,
    claimUse,
    redeem,
    // waitlist
    submit,
    getWaitlistEntry,
    listWaitlist,
    approve,
    reject,
    resend,
    findApprovedWaitlistEntry,
    consumeForSignup,
  };
}

export type AccessService = ReturnType<typeof createAccessService>;

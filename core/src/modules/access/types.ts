/**
 * Access module types (p107 ACC-001).
 *
 * @module @jetdevs/core/access
 */

export const ACCESS_MODES = ['off', 'optional', 'required'] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const ACCESS_CODE_KINDS = ['personal', 'campaign', 'single_use'] as const;
export type AccessCodeKind = (typeof ACCESS_CODE_KINDS)[number];

export const ACCESS_CODE_STATUSES = ['active', 'revoked'] as const;
export type AccessCodeStatus = (typeof ACCESS_CODE_STATUSES)[number];

export const REDEMPTION_SOURCES = ['link', 'typed'] as const;
export type RedemptionSource = (typeof REDEMPTION_SOURCES)[number];

export const WAITLIST_STATES = ['pending', 'approved', 'rejected', 'signed_up'] as const;
export type WaitlistState = (typeof WAITLIST_STATES)[number];

/**
 * Why a presented code does not count. Each is distinct (AC: expired ≠ revoked).
 * `email_unverified` — the code is bound to this email, but the signup has not
 * proved it owns the address (e.g. Connect password register).
 */
export type CodeRefusalReason =
  | 'not_found'
  | 'revoked'
  | 'expired'
  | 'exhausted'
  | 'wrong_email'
  | 'email_unverified'
  | 'no_access';

/**
 * Why the gate refused a first sign-in.
 * `code_required` — required mode, nothing presented that grants access.
 * `unavailable`   — the settings row could not be read (fail closed, neutral refusal).
 */
export type AccessRefusalReason = CodeRefusalReason | 'code_required' | 'unavailable';

export interface AccessCode {
  id: number;
  code: string;
  kind: AccessCodeKind;
  ownerUserId: number | null;
  app: string;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  tag: string | null;
  grantsAccess: boolean;
  boundEmail: string | null;
  status: AccessCodeStatus;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessRedemption {
  id: number;
  codeId: number;
  userId: number;
  app: string;
  source: RedemptionSource;
  firstTouchAt: Date | null;
  redeemedAt: Date;
}

export interface WaitlistResendEvent {
  /** First 12 hex chars of the superseded token's sha256 — never the raw token. */
  hash: string;
  at: string;
}

export interface WaitlistEntry {
  id: number;
  app: string;
  email: string;
  answers: Record<string, unknown>;
  state: WaitlistState;
  sourceCodeId: number | null;
  accessTokenHash: string | null;
  expiresAt: Date | null;
  resendHistory: WaitlistResendEvent[];
  decidedBy: number | null;
  decidedAt: Date | null;
  userId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WaitlistQuestion {
  id: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
  required: boolean;
}

/**
 * Per-app copy (rule 4: copy lives outside code). Known keys:
 * `waitlistConfirmation`, `codeStepIntro`. Free-form so apps can add keys.
 */
export type AccessCopy = Record<string, string>;

export interface AppAccessSettings {
  app: string;
  mode: AccessMode;
  personalCodeDefaultCap: number;
  waitlistQuestions: WaitlistQuestion[];
  copy: AccessCopy;
  /** false when no settings row exists (defaults returned: mode `off`). */
  exists: boolean;
}

export type ValidateResult =
  | { ok: true; code: AccessCode }
  | { ok: false; reason: CodeRefusalReason; code?: AccessCode };

/** How an allowed first sign-in got in. */
export type AccessVia = 'off' | 'no_code' | 'code' | 'waitlist' | 'bound_invite';

export type AccessDecision =
  | {
      allow: true;
      mode: AccessMode;
      via: AccessVia;
      /** Code to redeem in the account tx (attribution and/or access). */
      codeId?: number;
      /** Waitlist entry to consume in the account tx (`consumeForSignup`). */
      waitlistEntryId?: number;
      /** optional mode: a code was presented but does not count — why (for UI only). */
      ignoredCodeReason?: CodeRefusalReason;
    }
  | { allow: false; mode: AccessMode | null; reason: AccessRefusalReason };

export interface DecideInput {
  email: string;
  /**
   * REQUIRED. Did the signup prove it owns `email` (Google `email_verified`,
   * a magic link)? Connect password register does NOT verify, so it passes `false`.
   * Email-only grants — an approved waitlist entry matched by email, a bound
   * `single_use` invite, and a presented code with `bound_email` — count only
   * when `true`. With `false`, only a non-bound granting code or a waitlist
   * token / signed entry id (the link is the grant) lets the person in.
   */
  emailVerified: boolean;
  code?: string | null;
  /** Entry id from a verified, signed ACCESS_GRANT cookie (ACC-005). */
  waitlistEntryId?: number | null;
  /** Raw waitlist access token (alternative to the entry id). */
  waitlistToken?: string | null;
}

export interface CreateCodeInput {
  /** Vanity code; generated when absent. Normalized (trim + upper) and checked against CODE_RE. */
  code?: string;
  kind: AccessCodeKind;
  ownerUserId?: number | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
  tag?: string | null;
  grantsAccess?: boolean;
  boundEmail?: string | null;
  createdBy?: number | null;
}

export interface RedeemInput {
  codeId: number;
  userId: number;
  source: RedemptionSource;
  firstTouchAt?: Date | null;
}

export interface SendAccessLinkArgs {
  to: string;
  link: string;
  expiresAt: Date;
}

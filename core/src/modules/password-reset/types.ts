/**
 * Password reset service types.
 *
 * The service owns the flow (token issue, validation, consumption, audit log)
 * and stays framework-agnostic: the app supplies the database runner, the
 * password hasher, and the email sender. That keeps one implementation behind
 * every app's own routes rather than a copy per repo.
 */

/** Minimal drizzle-like client the service needs. Kept loose so any driver fits. */
export type PasswordResetDb = any;

export interface PasswordResetTables {
  /** `users` table — needs `id`, `email`, `password`, `updatedAt`. */
  users: any;
  /** `password_reset_tokens` table. */
  passwordResetTokens: any;
  /** `auth_logs` table. Omit to skip audit logging. */
  authLogs?: any;
}

export interface SendResetEmailArgs {
  to: string;
  /** Absolute URL including the token query param. */
  resetLink: string;
  /** Best-effort display name; may be the email address. */
  userName: string;
  expiryHours: number;
}

export interface PasswordResetServiceDeps {
  /**
   * Runs a callback with a privileged (RLS-bypassing) db client. The flow is
   * pre-authentication, so there is no actor to scope by.
   */
  runPrivileged: <T>(fn: (db: PasswordResetDb) => Promise<T>) => Promise<T>;
  /**
   * Runs a callback inside a privileged transaction. Defaults to
   * `runPrivileged(db => db.transaction(fn))`.
   *
   * Override it when the app's privileged runner already opens a transaction —
   * calling `.transaction()` again would nest a savepoint inside it for no
   * reason, and some drivers reject the nesting outright.
   */
  runPrivilegedTransaction?: <T>(fn: (tx: PasswordResetDb) => Promise<T>) => Promise<T>;
  tables: PasswordResetTables;
  /** Hash a plaintext password for storage (e.g. bcrypt, cost 12). */
  hashPassword: (password: string) => Promise<string>;
  /** Compare plaintext against a stored hash. */
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  /** Deliver the reset link. Failures are logged, never surfaced to the caller. */
  sendResetEmail: (args: SendResetEmailArgs) => Promise<unknown>;
  /** Origin used to build the reset link, e.g. `https://app.cadraos.com`. */
  baseUrl: string;
  /** Token lifetime. Default 1 hour. */
  tokenTtlMs?: number;
  /** Override token generation (tests). Default: 32 random bytes, hex. */
  generateToken?: () => string;
  /**
   * Runs inside the password-change transaction, after the new password is
   * written and before the token is marked used. Use it to revoke sessions or
   * other credential-derived access.
   */
  onPasswordChanged?: (
    tx: PasswordResetDb,
    ctx: { userId: number; at: Date },
  ) => Promise<void>;
  logger?: Pick<Console, 'error' | 'warn'>;
}

export interface RequestResetArgs {
  email: string;
}

/** Always `{ success: true }` — the flow never reveals whether the email exists. */
export interface RequestResetResult {
  success: true;
}

export type TokenInvalidReason = 'invalid' | 'expired';

export type ValidateTokenResult =
  | { valid: true }
  | { valid: false; reason: TokenInvalidReason };

export interface ResetPasswordArgs {
  token: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: string; reason: 'validation' | TokenInvalidReason };

export interface PasswordResetService {
  requestReset(args: RequestResetArgs): Promise<RequestResetResult>;
  validateToken(token: string | null | undefined): Promise<ValidateTokenResult>;
  resetPassword(args: ResetPasswordArgs): Promise<ResetPasswordResult>;
}

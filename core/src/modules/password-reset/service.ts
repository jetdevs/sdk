import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { validatePassword } from './password-policy';
import type {
  PasswordResetDb,
  PasswordResetService,
  PasswordResetServiceDeps,
  RequestResetArgs,
  RequestResetResult,
  ResetPasswordArgs,
  ResetPasswordResult,
  ValidateTokenResult,
} from './types';

const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create the password reset service.
 *
 * Flow:
 *  1. `requestReset` issues a single-use token and emails the link. It returns
 *     success whether or not the address belongs to an account, so the endpoint
 *     cannot be used to enumerate users.
 *  2. `validateToken` backs the reset page's on-load check, so an expired link
 *     shows a "request a new one" screen instead of failing after the user has
 *     typed a password.
 *  3. `resetPassword` re-checks the token inside the write, updates the
 *     password, runs `onPasswordChanged`, marks the token used, and writes an
 *     auth log entry — all in one transaction.
 */
export function createPasswordResetService(
  deps: PasswordResetServiceDeps,
): PasswordResetService {
  const {
    runPrivileged,
    runPrivilegedTransaction = (fn) =>
      runPrivileged(async (db: PasswordResetDb) => db.transaction(fn)),
    tables,
    hashPassword,
    comparePassword,
    sendResetEmail,
    baseUrl,
    tokenTtlMs = DEFAULT_TOKEN_TTL_MS,
    generateToken = () => randomBytes(32).toString('hex'),
    onPasswordChanged,
    logger = console,
  } = deps;

  const { users, passwordResetTokens, authLogs } = tables;
  const expiryHours = Math.max(1, Math.round(tokenTtlMs / (60 * 60 * 1000)));

  async function requestReset({ email }: RequestResetArgs): Promise<RequestResetResult> {
    const normalized = email.toLowerCase().trim();

    const [user] = await runPrivileged(async (db: PasswordResetDb) =>
      db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        firstName: users.firstName,
      })
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1),
    );

    // No account: stop here but report success, so the response is identical
    // either way and the endpoint reveals nothing about who has an account.
    if (!user) {
      return { success: true };
    }

    // Supersede any outstanding link — at most one live token per user.
    await runPrivileged(async (db: PasswordResetDb) =>
      db.delete(passwordResetTokens).where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ),
      ),
    );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + tokenTtlMs);

    await runPrivileged(async (db: PasswordResetDb) =>
      db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      }),
    );

    const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

    try {
      await sendResetEmail({
        to: normalized,
        resetLink,
        userName: user.firstName || user.name || user.email || '',
        expiryHours,
      });
    } catch (error) {
      // A delivery failure must not change the response shape — that would leak
      // account existence — so it is logged and swallowed.
      logger.error('[password-reset] failed to send reset email:', error);
    }

    return { success: true };
  }

  async function validateToken(
    token: string | null | undefined,
  ): Promise<ValidateTokenResult> {
    if (!token) {
      return { valid: false, reason: 'invalid' };
    }

    const [resetToken] = await runPrivileged(async (db: PasswordResetDb) =>
      db.select({ id: passwordResetTokens.id, expiresAt: passwordResetTokens.expiresAt })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            isNull(passwordResetTokens.usedAt),
          ),
        )
        .limit(1),
    );

    if (!resetToken) {
      return { valid: false, reason: 'invalid' };
    }

    if (resetToken.expiresAt < new Date()) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true };
  }

  async function resetPassword({
    token,
    password,
    ipAddress,
    userAgent,
  }: ResetPasswordArgs): Promise<ResetPasswordResult> {
    if (!token || typeof token !== 'string') {
      return { ok: false, error: 'Invalid reset link', reason: 'invalid' };
    }

    if (!password || typeof password !== 'string') {
      return { ok: false, error: 'Password is required', reason: 'validation' };
    }

    const policy = validatePassword(password);
    if (!policy.valid) {
      return { ok: false, error: policy.failed!.message, reason: 'validation' };
    }

    const [resetToken] = await runPrivileged(async (db: PasswordResetDb) =>
      db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .limit(1),
    );

    if (!resetToken) {
      return {
        ok: false,
        error: 'Reset link is invalid or has expired. Please request a new one',
        reason: 'expired',
      };
    }

    const [currentUser] = await runPrivileged(async (db: PasswordResetDb) =>
      db.select({ password: users.password })
        .from(users)
        .where(eq(users.id, resetToken.userId))
        .limit(1),
    );

    if (currentUser?.password) {
      const isSamePassword = await comparePassword(password, currentUser.password);
      if (isSamePassword) {
        return {
          ok: false,
          error: 'New password must be different from your current password',
          reason: 'validation',
        };
      }
    }

    const hashedPassword = await hashPassword(password);

    await runPrivilegedTransaction(async (tx: PasswordResetDb) => {
      const at = new Date();

      await tx.update(users)
        .set({ password: hashedPassword, updatedAt: at })
        .where(eq(users.id, resetToken.userId));

      if (onPasswordChanged) {
        await onPasswordChanged(tx, { userId: resetToken.userId, at });
      }

      await tx.update(passwordResetTokens)
        .set({ usedAt: at })
        .where(eq(passwordResetTokens.id, resetToken.id));

      if (authLogs) {
        await tx.insert(authLogs).values({
          userId: resetToken.userId,
          eventType: 'password_reset',
          ipAddress,
          userAgent,
          metadata: { method: 'forgot_password_link' },
        });
      }
    });

    return { ok: true };
  }

  return { requestReset, validateToken, resetPassword };
}

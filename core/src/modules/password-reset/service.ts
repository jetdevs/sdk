import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import {
  askCredentialOwner,
  frozenCredentialMessage,
  selectCredentialOwnerResolver,
} from '../auth/credential-owner';
import { announceCredentialWritten } from '../auth/credential-written';
import { withCredentialWrite } from '../auth/credential-write';
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
 *     password, runs `onPasswordChanged` and then `onCredentialWritten`, marks
 *     the token used, and writes an auth log entry — all in one transaction.
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
    onCredentialWritten,
    logger = console,
  } = deps;
  const resolveOwner = selectCredentialOwnerResolver(deps);

  const { users, passwordResetTokens, authLogs } = tables;
  const expiryHours = Math.max(1, Math.round(tokenTtlMs / (60 * 60 * 1000)));

  async function requestReset({ email }: RequestResetArgs): Promise<RequestResetResult> {
    const normalized = email.toLowerCase().trim();

    // Match the STORED address case-insensitively, not just the typed one.
    // Lowercasing the input alone misses a legacy row saved as `Sean@x.com`,
    // which then silently receives no reset mail (STORY-040).
    //
    // INDEX: this is `lower(email)`, so a plain b-tree on `email` no longer
    // serves it. The SDK ships no `lower(email)` index — the app owns its own
    // DDL; cadra-web adds one in its migration 0136. Without such an index
    // this is a sequential scan on `users`.
    const [user] = await runPrivileged(async (db: PasswordResetDb) =>
      db.select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${normalized})`)
        .limit(1),
    );

    // No account: stop here but report success, so the response is identical
    // either way and the endpoint reveals nothing about who has an account.
    if (!user) {
      return { success: true };
    }

    // Where does the credential live? Anything but `local` answers the same
    // silent success — the response shape must not change — and mints
    // nothing here: a link that could only be refused on consumption is not
    // worth minting. An external owner may be asked to mint its own.
    const owner = await runPrivileged(async (db: PasswordResetDb) =>
      askCredentialOwner(resolveOwner, {
        db,
        operation: 'reset-request',
        user,
        email: normalized,
      }),
    );
    if (owner.kind === 'external') {
      if (owner.forwardResetRequest) {
        try {
          await owner.forwardResetRequest(normalized);
        } catch (error) {
          // Same rule as our own delivery: a failure must not change the
          // response shape, so it is logged and swallowed.
          logger.error('[password-reset] failed to forward reset request to the credential owner:', error);
        }
      } else {
        logger.warn(`[password-reset] reset link not minted for user ${user.id}: credential owned by ${owner.issuer}`);
      }
      return { success: true };
    }
    if (owner.kind === 'frozen') {
      logger.warn(`[password-reset] reset link refused for user ${user.id}: ${frozenCredentialMessage(owner)}`);
      return { success: true };
    }
    if (owner.kind === 'none') {
      logger.warn(`[password-reset] reset link not minted for user ${user.id}: no credential owner`);
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
      db.select()
        .from(users)
        .where(eq(users.id, resetToken.userId))
        .limit(1),
    );

    // Server-side closure, checked at CONSUMPTION: a link minted while the
    // password was still local must not write a verifier once it is not.
    const owner = await runPrivileged(async (db: PasswordResetDb) =>
      askCredentialOwner(resolveOwner, {
        db,
        operation: 'reset',
        user: currentUser ?? null,
        email: currentUser?.email ?? null,
      }),
    );
    if (owner.kind === 'external') {
      return {
        ok: false,
        error: `This account's password is managed by ${owner.issuer}`,
        reason: 'refused',
        redirect: owner.resetUrl,
      };
    }
    if (owner.kind === 'frozen') {
      return { ok: false, error: frozenCredentialMessage(owner), reason: 'refused' };
    }
    if (owner.kind === 'none') {
      return {
        ok: false,
        error: 'Reset link is invalid or has expired. Please request a new one',
        reason: 'invalid',
      };
    }

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

    // p77 seam: the gate (no handle outside the runner, so `db: null`), then
    // hash + write + token consumption + audit in the one bounded transaction
    // `runPrivilegedTransaction` opens. A refusal throws
    // `CredentialWriteRefusedError` with the token still unused.
    await withCredentialWrite(
      deps,
      { operation: 'reset-consume', db: null, runTransaction: runPrivilegedTransaction },
      async (tx: PasswordResetDb) => {
        const hashedPassword = await hashPassword(password);
        const at = new Date();

        await tx.update(users)
          .set({ password: hashedPassword, updatedAt: at })
          .where(eq(users.id, resetToken.userId));

        // Alias first, keeping its pre-existing position, then the general hook.
        if (onPasswordChanged) {
          await onPasswordChanged(tx, { userId: resetToken.userId, at });
        }

        await announceCredentialWritten(onCredentialWritten, {
          db: tx,
          userId: resetToken.userId,
          operation: 'reset',
          firstSet: !currentUser?.password,
          at,
        });

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
      },
    );

    return { ok: true };
  }

  return { requestReset, validateToken, resetPassword };
}

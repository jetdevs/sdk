/**
 * Password Reset Module
 *
 * The forgot-password / reset-password flow: single-use tokens, an
 * enumeration-safe request endpoint, the shared password policy, and the
 * transactional password change with audit logging.
 *
 * Apps supply the db runner, hasher, and email sender, then expose their own
 * routes over `createPasswordResetService`.
 */

export { createPasswordResetService } from './service';

export {
  PASSWORD_RULES,
  validatePassword,
  evaluatePasswordRules,
} from './password-policy';

export type { PasswordRule, PasswordPolicyResult } from './password-policy';

export type {
  PasswordResetDb,
  PasswordResetService,
  PasswordResetServiceDeps,
  PasswordResetTables,
  RequestResetArgs,
  RequestResetResult,
  ResetPasswordArgs,
  ResetPasswordResult,
  SendResetEmailArgs,
  TokenInvalidReason,
  ValidateTokenResult,
} from './types';

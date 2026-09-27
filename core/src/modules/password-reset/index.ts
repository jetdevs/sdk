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

// The caller-injected guard `PasswordResetServiceDeps.canWriteLocalCredential` takes.
export type {
  LocalCredentialWriteArgs,
  LocalCredentialWriteGuard,
  LocalCredentialWriteOperation,
  LocalCredentialWriteVerdict,
} from '../auth/local-credential-policy';

// The caller-injected resolver `PasswordResetServiceDeps.resolveCredentialOwner` takes.
export { localOnlyOwner } from '../auth/credential-owner';

export type {
  CredentialOwner,
  CredentialOwnerOperation,
  ResolveCredentialOwner,
  ResolveCredentialOwnerArgs,
} from '../auth/credential-owner';

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

// p77: the gate `PasswordResetServiceDeps.credentialWriteGate` takes, and the
// route face of its refusal (503 { error } + Retry-After: 60).
export {
  CredentialWriteRefusedError,
  credentialWriteRefusedResponse,
  isCredentialWriteRefused,
} from '../auth/credential-write';

export type {
  CredentialWriteGate,
  CredentialWriteGateContext,
  CredentialWriteRefusalReason,
} from '../auth/credential-write';

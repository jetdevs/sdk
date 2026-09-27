/**
 * Authentication Module
 *
 * Authentication configuration, providers, and utilities.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export type { AuthConfig } from './types';

/**
 * Create authentication configuration.
 *
 * Note: This is a configuration helper. The actual NextAuth configuration
 * should be created in the app using this as a base.
 */
export function createAuthConfig(config: import('./types').AuthConfig) {
  return {
    providers: config.providers,
    session: {
      strategy: config.session?.strategy ?? 'jwt',
      maxAge: config.session?.maxAge ?? 30 * 24 * 60 * 60, // 30 days
    },
    pages: {
      signIn: config.pages?.signIn ?? '/login',
      signUp: config.pages?.signUp ?? '/register',
      error: config.pages?.error ?? '/login',
    },
    callbacks: config.callbacks ?? {},
  };
}

// =============================================================================
// PROVIDERS
// =============================================================================

export {
  FacebookProvider,
  InstagramProvider,
  TikTokProvider,
  createFacebookProvider,
  createInstagramProvider,
  createTikTokProvider,
} from './providers';

export type {
  FacebookProfile,
  InstagramProfile,
  TikTokProfile,
} from './providers';

// =============================================================================
// TOKEN BLACKLIST
// =============================================================================

export {
  tokenBlacklist,
  getTokenId,
  blacklistToken,
  blacklistUserTokens,
  isTokenValid,
  BLACKLIST_REASONS,
} from './token-blacklist';

export type {
  BlacklistReason,
  JWTTokenLike,
} from './token-blacklist';

// =============================================================================
// TYPES
// =============================================================================

export type { OAuthProviderOptions } from './types';

// Auth user and session types
export type {
  OrgUser,
  SessionRole,
  SessionPermission,
  PermissionFlags,
  OrgInfo,
  AuthUser,
} from './types';

// Auth error types
export {
  AuthErrorCode,
  AuthEventType,
} from './types';

export type {
  AuthError,
  AuthResult,
  AuthResponse,
  AuthState,
  AuthAuditEvent,
} from './types';

// Credential types
export type {
  LoginCredentials,
  RegisterCredentials,
} from './types';

// Auth check types
export type {
  PermissionCheck,
  RateLimitResult,
  SessionInfo,
} from './types';

// Configuration types
export type {
  AuthRuntimeConfig,
} from './types';

// Utility types
export type {
  AuthHookReturn,
  WithAuthProps,
  AuthFormErrors,
  AuthFormState,
} from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export {
  // Auth schemas
  registerSchema,
  loginSchema,
  updateProfileSchema,
  // Session & Settings schemas
  sessionTimeoutOptions,
  SESSION_TIMEOUT_VALUES,
  sessionPreferenceSchema,
  userProfileSchema,
  changePasswordSchema,
} from './schemas';

export type {
  // Auth types
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  // Session & Settings types
  SessionTimeoutValue,
  SessionPreferenceInput,
  UserProfileInput,
  ChangePasswordInput,
} from './schemas';

// =============================================================================
// REPOSITORY
// =============================================================================

export {
  createAuthRepositoryClass,
  SDKAuthRepository,
} from './repository';

export type {
  AuthUserRecord,
  AuthUserRoleAssignment,
  AuthRegisterUserData,
  AuthUpdateProfileData,
  AuthRepositorySchema,
  IAuthRepository,
} from './repository';

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
  createAuthRouterConfig,
  createGetCurrentUserHandler,
  AuthRouterError,
} from './router-config';

export type {
  AuthRouterDeps,
  AuthSchema,
  SessionUser,
  AuthContext,
  AuthHandlerContext,
} from './router-config';

// =============================================================================
// LOCAL CREDENTIAL WRITE POLICY (caller-injected guard)
// =============================================================================

export { askLocalCredentialGuard } from './local-credential-policy';

export type {
  LocalCredentialWriteArgs,
  LocalCredentialWriteGuard,
  LocalCredentialWriteOperation,
  LocalCredentialWriteVerdict,
} from './local-credential-policy';

// =============================================================================
// CREDENTIAL OWNER (routing port: where a credential lives, for every writer
// and the login path)
// =============================================================================

export {
  askCredentialOwner,
  credentialOwnerOf,
  credentialRedirect,
  CredentialOwnedElsewhereError,
  FROZEN_CREDENTIAL_MESSAGE,
  fromLocalCredentialGuard,
  frozenCredentialMessage,
  isCredentialRedirect,
  localOnlyOwner,
  selectCredentialOwnerResolver,
} from './credential-owner';

export type {
  CredentialOwner,
  CredentialOwnerDeps,
  CredentialOwnerKind,
  CredentialOwnerOperation,
  CredentialRedirect,
  ExternalCredentialOwner,
  FrozenCredentialOwner,
  ResolveCredentialOwner,
  ResolveCredentialOwnerArgs,
} from './credential-owner';

// =============================================================================
// CREDENTIAL WRITTEN (announcement port: a successful local verifier write)
// =============================================================================

export { announceCredentialWritten } from './credential-written';

export type {
  CredentialWriteOperation,
  CredentialWrittenArgs,
  CredentialWrittenDeps,
  OnCredentialWritten,
} from './credential-written';

export { verifyLocalCredential } from './verify-local-credential';

export type {
  VerifyLocalCredentialArgs,
  VerifyLocalCredentialDeps,
  VerifyLocalCredentialResult,
} from './verify-local-credential';

// =============================================================================
// p77 — CREDENTIAL AUTHORITY, SCHEMA PIN, CREDENTIAL-WRITE SEAM
// =============================================================================

export {
  AUTHORITY_TRANSITIONS,
  CREDENTIAL_AUTHORITY,
  canTransition,
  isCredentialAuthority,
  isTerminalAuthority,
} from './credential-authority';

export type { CredentialAuthority } from './credential-authority';

export {
  assertUsersSchemaCarriesConnectColumns,
  CONNECT_USERS_COLUMNS,
} from './schema-pin';

export type {
  ConnectUsersColumn,
  SchemaPinOptions,
  SchemaPinResult,
} from './schema-pin';

export {
  CREDENTIAL_WRITE_DEADLINE_MS,
  CREDENTIAL_WRITE_RETRY_AFTER_SECONDS,
  CREDENTIAL_WRITE_SET_LOCALS,
  CredentialWriteRefusedError,
  credentialWriteRefusedResponse,
  isCredentialWriteRefused,
  withCredentialWrite,
} from './credential-write';

export type {
  CredentialWriteDeps,
  CredentialWriteGate,
  CredentialWriteGateContext,
  CredentialWriteGateOperation,
  CredentialWriteOptions,
  CredentialWriteRefusalReason,
} from './credential-write';

// =============================================================================
// p77 TRIGGER SQL TEMPLATES (M2 writers-closed, M3 one-allocator, M6 bump)
// =============================================================================

export {
  AUTHORITY_ROLLBACK_ERROR_PREFIX,
  AUTHORITY_TRANSITION_ERROR_PREFIX,
  WRITERS_CLOSED_ERROR_PREFIX,
  writersClosedTriggerSql,
  ONE_ALLOCATOR_ERROR_PREFIX,
  ONE_ALLOCATOR_GUC,
  oneAllocatorGucSql,
  oneAllocatorTriggerSql,
  credentialVersionBumpTriggerSql,
} from './sql';

export type { WritersClosedOptions } from './sql';

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

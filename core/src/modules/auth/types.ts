/**
 * Authentication Types
 *
 * Type definitions for the authentication system.
 */

import type { OAuthConfig } from 'next-auth/providers/oauth';

/**
 * Authentication configuration options
 */
export interface AuthConfig {
  providers: string[];
  session?: {
    strategy?: 'jwt' | 'database';
    maxAge?: number;
  };
  pages?: {
    signIn?: string;
    signUp?: string;
    error?: string;
  };
  callbacks?: Record<string, unknown>;
}

/**
 * Facebook OAuth profile
 */
export interface FacebookProfile {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      height: number;
      is_silhouette: boolean;
      url: string;
      width: number;
    };
  };
}

/**
 * Instagram OAuth profile
 */
export interface InstagramProfile {
  id: string;
  username: string;
  account_type: string;
  media_count: number;
}

/**
 * TikTok OAuth profile
 */
export interface TikTokProfile {
  open_id: string;
  union_id: string;
  display_name: string;
  avatar_url: string;
  avatar_url_100: string;
  avatar_large_url: string;
}

/**
 * Generic OAuth provider options
 */
export type OAuthProviderOptions<P> = Omit<OAuthConfig<P>, 'id' | 'name' | 'type'>;

/**
 * Token blacklist reasons
 */
export const BLACKLIST_REASONS = {
  LOGOUT: 'logout',
  MANUAL_LOGOUT: 'manual_logout',
  ROLE_CHANGE: 'role_change',
  SERVER_RESTART: 'server_restart',
  SECURITY_INCIDENT: 'security',
  MANUAL_REVOKE: 'manual_revoke',
  EXPIRED: 'expired',
  USER_DEACTIVATED: 'user_deactivated',
} as const;

export type BlacklistReason = typeof BLACKLIST_REASONS[keyof typeof BLACKLIST_REASONS];

/**
 * JWT token structure (minimal for blacklist operations)
 */
export interface JWTTokenLike {
  jti?: string;
  sub?: string;
  iat?: number;
}

// =============================================================================
// AUTH USER & SESSION TYPES
// =============================================================================

/**
 * Organization user relationship
 */
export interface OrgUser {
  org_id: number;
  user_id: number;
  role: string;
}

/**
 * Session role with permissions
 */
export interface SessionRole {
  id: number;
  name: string;
  orgId: number;
  policies: SessionPermission[];
}

/**
 * Session permission (policy)
 */
export interface SessionPermission {
  name: string;
  description: string;
}

/**
 * Permission with CRUD flags (for legacy compatibility)
 */
export interface PermissionFlags {
  id: number;
  name: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

/**
 * Organization info for user context
 */
export interface OrgInfo {
  id: number;
  name: string;
  roles: string[];
  isActive: boolean;
}

/**
 * Authenticated user with full context
 */
export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  name: string;
  username: string;
  avatar?: string;
  firstName: string;
  lastName: string;
  roles: SessionRole[];
  orgUser: OrgUser[];
  // Multi-org support
  orgId: number | null;
  currentOrg: { id: number; name: string } | null;
  availableOrgs: OrgInfo[];
}

// =============================================================================
// AUTH ERROR TYPES
// =============================================================================

/**
 * Authentication error codes
 */
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  RATE_LIMITED = 'RATE_LIMITED',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  INVALID_TOKEN = 'INVALID_TOKEN',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Authentication error
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// AUTH RESULT TYPES
// =============================================================================

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: AuthError;
  sessionToken?: string;
}

/**
 * Generic auth API response
 */
export interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

// =============================================================================
// AUTH STATE TYPES
// =============================================================================

/**
 * Authentication state for state management
 */
export interface AuthState {
  authenticated: boolean;
  loading: boolean;
  user: AuthUser | null;
  error: AuthError | null;
  sessionToken: string | null;
}

// =============================================================================
// CREDENTIAL TYPES
// =============================================================================

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration credentials
 */
export interface RegisterCredentials extends LoginCredentials {
  name: string;
  firstName: string;
  lastName: string;
  confirmPassword: string;
}

// =============================================================================
// PERMISSION CHECK TYPES
// =============================================================================

/**
 * Permission check configuration
 */
export interface PermissionCheck {
  permission?: string;
  permissions?: string[];
  anyPermissions?: string[];
  role?: string | string[];
  customCheck?: (user: AuthUser, permissions: string[]) => boolean;
}

// =============================================================================
// RATE LIMITING TYPES
// =============================================================================

/**
 * Rate limit result
 */
export interface RateLimitResult {
  success: boolean;
  remaining?: number;
  resetTime?: number;
  retryAfter?: number;
}

// =============================================================================
// SESSION MANAGEMENT TYPES
// =============================================================================

/**
 * Session information
 */
export interface SessionInfo {
  id: string;
  userId: number;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// AUDIT TYPES
// =============================================================================

/**
 * Authentication event types
 */
export enum AuthEventType {
  LOGIN_ATTEMPT = 'LOGIN_ATTEMPT',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * Authentication audit event
 */
export interface AuthAuditEvent {
  event: AuthEventType;
  userId?: number;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: AuthError;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Authentication runtime configuration
 */
export interface AuthRuntimeConfig {
  sessionMaxAge: number;
  sessionUpdateAge: number;
  rateLimitMaxAttempts: number;
  rateLimitWindowMs: number;
  requireSecureCookies: boolean;
  enableDebugLogging: boolean;
  passwordMinLength: number;
  sessionTimeoutWarningMs: number;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Auth hook return type
 */
export type AuthHookReturn<T = unknown> = {
  data?: T;
  loading: boolean;
  error?: AuthError;
  refetch?: () => void;
};

/**
 * Props for components with auth context
 */
export type WithAuthProps = {
  authenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
  error: AuthError | null;
};

// =============================================================================
// FORM TYPES
// =============================================================================

/**
 * Auth form errors
 */
export interface AuthFormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
  general?: string;
}

/**
 * Auth form state
 */
export interface AuthFormState {
  values: Partial<LoginCredentials | RegisterCredentials>;
  errors: AuthFormErrors;
  isSubmitting: boolean;
  isValid: boolean;
}

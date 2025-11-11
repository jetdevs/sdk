/**
 * Authentication and session management helpers
 *
 * Provides clean wrappers around NextAuth session management
 * Hides JWT structure and internal implementation details
 */

export {
  configureAuth,
  getSession,
  switchOrg,
  requireAuth,
  isAuthenticated,
  getCurrentUser,
  getCurrentOrgId,
} from './session';

export type { Session, User, AuthContext, AuthAdapter } from './types';

// Actor pattern exports
export {
  createActor,
  hasPermission,
  requirePermission,
  canAccessOrg,
  validateOrgContext,
  createServiceContext,
  hasActor,
  isPlatformSystemRole,
  actorUtils,
  SYSTEM_ROLES,
  ADMIN_PERMISSIONS,
  AuthError,
} from './actor';

export type {
  Actor,
  ActorContext,
  DbAccessOptions,
  ServiceContext,
} from './actor';

// Note: Internal session manipulation code is not exported

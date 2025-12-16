/**
 * Actor Pattern for Centralized Authentication and Authorization
 *
 * This module provides a unified authentication/authorization abstraction that:
 * - Centralizes authentication logic across all applications
 * - Supports both org-scoped and cross-org access patterns
 * - Works seamlessly with RLS and privileged database access
 * - Provides type-safe context for service layer operations
 *
 * @module @jetdevs/framework/auth/actor
 */

import type { Session } from './types';

/**
 * Actor represents an authenticated user with their authorization context
 */
export interface Actor {
  // Core identity
  userId: number;
  email: string;

  // Organization context
  orgId: number | null;

  // Role information
  roles: string[];
  isSystemUser: boolean;
  isSuperUser: boolean;

  // Permissions (from JWT or database)
  permissions: string[];

  // Session metadata
  sessionExpiry: string;
}

/**
 * Database access options for determining which DB context to use
 */
export interface DbAccessOptions {
  // Whether to require cross-org access (system users only)
  crossOrgAccess?: boolean;

  // Whether to bypass RLS entirely (dangerous - only for system operations)
  bypassRLS?: boolean;

  // The specific org context to use (defaults to actor's orgId)
  targetOrgId?: number;

  // Whether to allow null org context (for system users in backoffice)
  allowNullOrgContext?: boolean;
}

/**
 * Service context provides all necessary context for business logic
 */
export interface ServiceContext<TDb = any> {
  // Database instance with RLS context
  db: TDb;

  // The authenticated actor
  actor: Actor;

  // The effective org ID for this operation
  orgId: number | null;

  // The user ID for authorization checks
  userId: number;

  // Whether this is a system user operation
  isSystemUser: boolean;

  // The actor's permissions
  permissions: string[];
}

/**
 * Context type (subset needed for Actor creation)
 * Accommodates various session shapes including mock auth
 */
export interface ActorContext {
  session: Session | {
    user: {
      id: number;
      email: string | null;
      currentOrgId: number;
      roles?: any[];
      permissions?: string[];
      [key: string]: any;
    };
    expires: string;
  } | null;
  [key: string]: any;
}

/**
 * Error class for authentication/authorization failures
 */
export class AuthError extends Error {
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST';
  details?: Record<string, any>;

  constructor(code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST', message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Platform system roles that have special privileges
 */
export const SYSTEM_ROLES = {
  SUPER_USER: 'super_user',
  SYSTEM_ADMIN: 'system_admin',
  PLATFORM_ADMIN: 'platform_admin',
} as const;

/**
 * Admin permissions that grant broad access
 */
export const ADMIN_PERMISSIONS = {
  FULL_ACCESS: 'admin:full_access',
} as const;

/**
 * Check if a role is a platform system role
 */
export function isPlatformSystemRole(role: string): boolean {
  return Object.values(SYSTEM_ROLES).includes(role as any);
}

/**
 * Creates an Actor from context
 *
 * @param ctx - The context containing session
 * @returns Actor instance with full authorization context
 * @throws AuthError if user is not authenticated
 */
export function createActor(ctx: ActorContext): Actor {
  if (!ctx.session?.user) {
    throw new AuthError('UNAUTHORIZED', 'Authentication required');
  }

  const user = ctx.session.user as any;
  const userId = user.id;
  const currentOrgId = user.currentOrgId || null;

  // Validate email is present
  if (!user.email) {
    throw new AuthError('UNAUTHORIZED', 'User email is required for authentication');
  }

  // Extract roles from session (if available)
  const sessionRoles = user.roles || [];
  const roleNames = sessionRoles.map((r: any) => r.name || r).filter(Boolean);

  // Debug logging to see what we're working with
  console.log('🔍 [Framework SDK] createActor - Session Roles:', JSON.stringify(sessionRoles, null, 2));

  // Check for system user status
  // BEST PRACTICE: Use permissions as source of truth, not database flags
  // Users with any admin:* permissions get system-level access
  const permissions: string[] = user.permissions || [];
  const hasAdminPermissions = permissions.some(p => p.startsWith('admin:'));

  // Fallback: Check isSystemRole flag for backward compatibility
  const hasSystemRoleFlag = sessionRoles.some((role: any) => {
    if (typeof role === 'object') {
      return role?.isSystemRole === true;
    }
    return false;
  });

  const isSystemUser = hasAdminPermissions || hasSystemRoleFlag;

  console.log('🔍 [Framework SDK] createActor result:', {
    isSystemUser,
    hasAdminPermissions,
    hasSystemRoleFlag,
    adminPermissions: permissions.filter(p => p.startsWith('admin:'))
  });

  // Super user check: admin:full_access permission
  const isSuperUser = permissions.includes('admin:full_access') || hasSystemRoleFlag;

  return {
    userId,
    email: user.email,
    orgId: currentOrgId,
    roles: roleNames,
    isSystemUser,
    isSuperUser,
    permissions,
    sessionExpiry: ctx.session.expires || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}

/**
 * Checks if an actor has a specific permission
 *
 * @param actor - The actor to check
 * @param permission - The required permission
 * @returns Boolean indicating if the actor has the permission
 */
export function hasPermission(actor: Actor, permission: string): boolean {
  // Super users bypass all permission checks
  if (actor.isSuperUser) {
    return true;
  }

  // Check for admin full access
  if (actor.permissions.includes(ADMIN_PERMISSIONS.FULL_ACCESS)) {
    return true;
  }

  // Check for specific permission
  return actor.permissions.includes(permission);
}

/**
 * Ensures an actor has a required permission
 *
 * @param actor - The actor to check
 * @param permission - The required permission
 * @throws AuthError if the actor lacks the permission
 */
export function requirePermission(actor: Actor, permission: string): void {
  if (!hasPermission(actor, permission)) {
    throw new AuthError('FORBIDDEN', `Permission required: ${permission}`);
  }
}

/**
 * Checks if an actor can access a specific organization
 *
 * @param actor - The actor to check
 * @param targetOrgId - The organization to access
 * @returns Boolean indicating if access is allowed
 */
export function canAccessOrg(actor: Actor, targetOrgId: number): boolean {
  // System users can access any org
  if (actor.isSystemUser) {
    return true;
  }

  // Users with cross-org permission can access any org
  if (actor.permissions.includes("org:cross_org_access")) {
    return true;
  }

  // Otherwise, can only access their own org
  return actor.orgId === targetOrgId;
}

/**
 * Validates that an actor has the required organization context
 *
 * @param actor - The actor to validate
 * @param allowSystemWithoutOrg - Whether to allow system users without org context
 * @throws AuthError if validation fails
 */
export function validateOrgContext(
  actor: Actor,
  allowSystemWithoutOrg: boolean = false
): void {
  // System users may not need org context in certain scenarios
  if (allowSystemWithoutOrg && actor.isSystemUser && !actor.orgId) {
    return;
  }

  // Otherwise, org context is required
  if (!actor.orgId) {
    throw new AuthError('BAD_REQUEST', 'No organization context. Please select an organization.');
  }
}

/**
 * Creates a service context for business logic operations
 *
 * @param db - The database instance
 * @param actor - The authenticated actor
 * @param orgId - The organization ID to use
 * @returns ServiceContext for use in service layer
 */
export function createServiceContext<TDb = any>(
  db: TDb,
  actor: Actor,
  orgId?: number | null
): ServiceContext<TDb> {
  return {
    db,
    actor,
    orgId: orgId ?? actor.orgId,
    userId: actor.userId,
    isSystemUser: actor.isSystemUser,
    permissions: actor.permissions,
  };
}

/**
 * Type guard to check if a context has an actor
 */
export function hasActor(ctx: any): ctx is { actor: Actor } {
  return ctx?.actor && typeof ctx.actor === 'object';
}

/**
 * Export all actor utilities
 */
export const actorUtils = {
  createActor,
  hasPermission,
  requirePermission,
  canAccessOrg,
  validateOrgContext,
  createServiceContext,
  hasActor,
  isPlatformSystemRole,
};
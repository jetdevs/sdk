/**
 * Tenant tRPC Context Utilities
 *
 * This module provides utilities for enriching tRPC context with tenant
 * information and validating tenant access. These utilities bridge the
 * gap between middleware (which detects custom domains) and the tRPC
 * procedures (which need to enforce org isolation).
 *
 * @module @jetdevs/framework/tenant/trpc-context
 */

import type { TenantContext } from './types';

/**
 * Enriched context type returned by enrichContextWithTenant
 */
export type EnrichedTenantContext<T extends object> = T & {
  /**
   * The resolved tenant context (null for primary domain)
   */
  tenantContext: TenantContext | null;

  /**
   * The locked org ID for SDK router enforcement
   * When set, the SDK will reject any input.orgId that differs
   */
  lockedOrgId: number | undefined;

  /**
   * Legacy shape for backwards compatibility
   * @deprecated Use tenantContext instead
   */
  customDomainContext: {
    isCustomDomain: boolean;
    orgId: number;
    host: string | null;
  } | null;
};

/**
 * Enrich tRPC context with tenant information
 *
 * Adds tenant context to the base tRPC context. This enables:
 * 1. SDK router to enforce lockedOrgId (prevent input.orgId bypass)
 * 2. Procedures to check tenantContext.isCustomDomain
 * 3. Backwards compatibility via customDomainContext
 *
 * @param baseContext - The base tRPC context
 * @param tenantContext - The resolved tenant context (from parseTenantHeaders)
 * @returns Enhanced context with tenant and lockedOrgId
 *
 * @example
 * ```typescript
 * // In createTRPCContextFetch
 * const tenantContext = parseTenantHeaders(requestHeaders);
 *
 * return enrichContextWithTenant({
 *   session,
 *   db,
 *   headers: requestHeaders,
 * }, tenantContext);
 * ```
 */
export function enrichContextWithTenant<T extends object>(
  baseContext: T,
  tenantContext: TenantContext | null
): EnrichedTenantContext<T> {
  // Set lockedOrgId for SDK router enforcement
  // When undefined, SDK allows input.orgId (normal behavior)
  // When set, SDK rejects any input.orgId that differs
  const lockedOrgId = tenantContext?.lockedOrgId ?? undefined;

  // For backwards compatibility, also provide customDomainContext shape
  // This allows existing code to continue working during migration
  const customDomainContext = tenantContext?.isCustomDomain
    ? {
        isCustomDomain: true,
        orgId: tenantContext.lockedOrgId!,
        host: tenantContext.customDomainHost,
      }
    : null;

  return {
    ...baseContext,
    tenantContext,
    lockedOrgId,
    customDomainContext,
  };
}

/**
 * Get the effective org ID considering tenant context
 *
 * When on a custom domain, returns the locked org ID.
 * Otherwise, returns the actor's current org ID.
 *
 * @param actor - The current actor (with orgId)
 * @param tenantContext - Optional tenant context
 * @returns The effective org ID (locked org takes precedence)
 *
 * @example
 * ```typescript
 * // In orgProtectedProcedure
 * const effectiveOrgId = getEffectiveOrgId(actor, ctx.tenantContext);
 * // Use effectiveOrgId for all queries
 * ```
 */
export function getEffectiveOrgId(
  actor: { orgId: number | null },
  tenantContext: TenantContext | null
): number | null {
  // If on custom domain, always use locked org
  if (tenantContext?.isCustomDomain && tenantContext.lockedOrgId) {
    return tenantContext.lockedOrgId;
  }

  // Otherwise use actor's org
  return actor.orgId;
}

/**
 * Create middleware that blocks admin routes on custom domains
 *
 * Returns a function that can be used in middleware to check if
 * a route should be blocked based on tenant context.
 *
 * @param adminRoutePatterns - Patterns to match admin routes
 * @returns Function that checks if a route is blocked
 *
 * @example
 * ```typescript
 * const isBlocked = createAdminBlockMiddleware([
 *   '/admin',
 *   '/settings/org',
 *   '/backoffice/*'
 * ]);
 *
 * if (isBlocked(pathname, tenantContext)) {
 *   return new Response('Access denied', { status: 403 });
 * }
 * ```
 */
export function createAdminBlockMiddleware(
  adminRoutePatterns: string[] = ['/admin', '/settings/org', '/settings/billing']
) {
  return function isAdminRouteBlocked(
    pathname: string,
    tenantContext: TenantContext | null
  ): boolean {
    // Only block if tenant context says to block admin routes
    if (!tenantContext?.blockAdminRoutes) {
      return false;
    }

    // Check if pathname matches any admin route pattern
    return adminRoutePatterns.some(pattern => {
      if (pattern.endsWith('*')) {
        return pathname.startsWith(pattern.slice(0, -1));
      }
      return pathname === pattern || pathname.startsWith(`${pattern}/`);
    });
  };
}

/**
 * Result of tenant access validation
 */
export interface TenantAccessResult {
  /**
   * Whether access is allowed
   */
  allowed: boolean;

  /**
   * Reason for denial (only set if allowed is false)
   */
  reason?: string;
}

/**
 * Validate that a user can access the tenant
 *
 * This is a helper that apps can use to validate membership.
 * The actual database check is app-specific (passed as callback).
 *
 * System users are allowed without membership check (they're locked to the org).
 * Regular users must be members of the organization.
 *
 * @param userId - The user ID to check
 * @param tenantOrgId - The tenant's org ID
 * @param isSystemUser - Whether the user is a system user
 * @param checkMembership - App-provided function to check membership in database
 * @returns Promise resolving to access result
 *
 * @example
 * ```typescript
 * // In tRPC context creation
 * if (tenantContext?.isCustomDomain) {
 *   const result = await validateTenantAccess(
 *     session.user.id,
 *     tenantContext.lockedOrgId,
 *     isSystemUser,
 *     checkUserOrgMembership // App-specific DB function
 *   );
 *
 *   if (!result.allowed) {
 *     throw new TRPCError({
 *       code: 'FORBIDDEN',
 *       message: result.reason
 *     });
 *   }
 * }
 * ```
 */
export function validateTenantAccess(
  userId: number,
  tenantOrgId: number,
  isSystemUser: boolean,
  checkMembership: (userId: number, orgId: number) => Promise<boolean>
): Promise<TenantAccessResult> {
  // System users on custom domains are allowed but locked to org
  // This enables white-label scenarios where system users work on tenant data
  if (isSystemUser) {
    return Promise.resolve({ allowed: true });
  }

  // Regular users must be members of the organization
  // This checks the user_roles table, NOT session.currentOrgId
  return checkMembership(userId, tenantOrgId).then(isMember => ({
    allowed: isMember,
    reason: isMember ? undefined : 'User is not a member of this organization',
  }));
}

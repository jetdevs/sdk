/**
 * Tenant Middleware Utilities
 *
 * This module provides composable middleware utilities for handling
 * multi-tenant/custom domain requests. These utilities are designed
 * to be used by application middleware to:
 *
 * 1. Detect if a request is via a custom domain
 * 2. Securely set tenant headers (preventing spoofing attacks)
 * 3. Block certain routes on custom domains
 *
 * SECURITY: The createTenantHeaders function ALWAYS clears existing
 * tenant headers before setting new ones. This prevents header injection
 * attacks where an attacker could spoof tenant headers on primary domains.
 *
 * @module @jetdevs/framework/tenant/middleware
 */

import type { TenantContext, TenantMiddlewareConfig } from './types';
import { DEFAULT_TENANT_HEADERS } from './types';

/**
 * Check if a hostname is a platform domain (not a custom domain)
 *
 * SECURITY NOTE: Uses SUFFIX matching. A hostname is considered a platform
 * domain if it exactly matches or ends with `.{platformDomain}`.
 *
 * This is intentional behavior - platform domains like `jetdevs.ai` should
 * match `app.jetdevs.ai`, `staging.jetdevs.ai`, etc. Requiring exact matches
 * would mean listing every subdomain.
 *
 * Security consideration: Suffix matching means `attacker.jetdevs.ai` would
 * be treated as a platform domain IF the attacker controlled such a subdomain.
 * This is acceptable because:
 * - Platform DNS records are controlled by the ops team
 * - Custom domains are explicitly registered in the database
 * - The risk is "not being treated as custom domain" (less data), not "accessing wrong data"
 *
 * @example
 * ```typescript
 * // For platformDomains = ['jetdevs.ai']
 * isPlatformDomain('jetdevs.ai', ['jetdevs.ai']);        // true (exact match)
 * isPlatformDomain('app.jetdevs.ai', ['jetdevs.ai']);    // true (suffix match)
 * isPlatformDomain('staging.app.jetdevs.ai', ['jetdevs.ai']); // true (suffix match)
 * isPlatformDomain('attacker-jetdevs.ai', ['jetdevs.ai']); // false (different domain)
 * isPlatformDomain('ai.customer.com', ['jetdevs.ai']);   // false (custom domain)
 * ```
 *
 * @param hostname - The hostname to check (e.g., "app.jetdevs.ai")
 * @param platformDomains - List of platform domain roots (e.g., ["jetdevs.ai", "jetdevs.com"])
 * @returns true if hostname is a platform domain, false if it's a custom domain
 */
export function isPlatformDomain(
  hostname: string,
  platformDomains: string[]
): boolean {
  const normalized = normalizeHostname(hostname);
  return platformDomains.some(domain => {
    const normalizedDomain = domain.toLowerCase();
    // Exact match OR suffix match with preceding dot
    return normalized === normalizedDomain ||
           normalized.endsWith(`.${normalizedDomain}`);
  });
}

/**
 * Check if a route should be blocked on custom domains
 *
 * Supports wildcard patterns for flexible route matching:
 * - Exact match: '/admin' matches only '/admin' and '/admin/'
 * - Wildcard: '/admin/*' matches '/admin/anything'
 * - Prefix match: '/settings/org' matches '/settings/org/anything'
 *
 * @param pathname - The request pathname (e.g., "/admin/users")
 * @param blockedRoutes - List of blocked route patterns
 * @returns true if the route should be blocked
 *
 * @example
 * ```typescript
 * isBlockedRoute('/admin/users', ['/admin/*']);  // true
 * isBlockedRoute('/admin', ['/admin']);           // true
 * isBlockedRoute('/dashboard', ['/admin']);       // false
 * ```
 */
export function isBlockedRoute(
  pathname: string,
  blockedRoutes: string[] = []
): boolean {
  return blockedRoutes.some(route => {
    if (route.endsWith('*')) {
      // Wildcard match - check prefix
      return pathname.startsWith(route.slice(0, -1));
    }
    // Exact match or prefix match with trailing slash
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}

/**
 * Create tenant headers to pass through the request
 *
 * SECURITY: This function ALWAYS clears existing x-custom-domain* headers
 * first to prevent header spoofing attacks. An attacker could send a request
 * to a primary domain with spoofed headers trying to access another org's data.
 * By always clearing first, we ensure only legitimate tenant context is set.
 *
 * @param existingHeaders - The original request headers
 * @param tenantContext - The resolved tenant context (or null for primary domain)
 * @param config - Optional configuration for custom header names
 * @returns New Headers object with tenant headers set (or cleared)
 *
 * @example
 * ```typescript
 * // In middleware
 * const tenantContext = await resolveTenant(hostname);
 *
 * // SECURITY: This clears any spoofed headers and only sets valid ones
 * const requestHeaders = createTenantHeaders(request.headers, tenantContext);
 *
 * return NextResponse.next({ request: { headers: requestHeaders } });
 * ```
 */
export function createTenantHeaders(
  existingHeaders: Headers,
  tenantContext: TenantContext | null,
  config?: Pick<TenantMiddlewareConfig, 'headers'>
): Headers {
  const headers = new Headers(existingHeaders);
  const headerNames = { ...DEFAULT_TENANT_HEADERS, ...config?.headers };

  // SECURITY: ALWAYS clear custom domain headers first to prevent spoofing
  // An attacker on a primary domain could send fake x-custom-domain headers
  // This ensures we only pass through legitimate tenant context
  headers.delete(headerNames.isCustomDomain);
  headers.delete(headerNames.customDomainHost);
  headers.delete(headerNames.customDomainOrgId);

  // Only set headers if we have valid tenant context
  if (tenantContext?.isCustomDomain && tenantContext.lockedOrgId) {
    headers.set(headerNames.isCustomDomain, 'true');
    if (tenantContext.customDomainHost) {
      headers.set(headerNames.customDomainHost, tenantContext.customDomainHost);
    }
    headers.set(headerNames.customDomainOrgId, String(tenantContext.lockedOrgId));
  }

  return headers;
}

/**
 * Parse tenant headers from a request (PURE PARSING - no policy)
 *
 * This function only parses the headers and returns the raw tenant context.
 * It does NOT apply any policy decisions (like blockAdminRoutes).
 * Use applyTenantPolicy() after parsing to apply policy.
 *
 * @param headers - The request headers to parse
 * @param config - Optional configuration for custom header names
 * @returns Parsed tenant context or null if not a custom domain request
 *
 * @example
 * ```typescript
 * // In tRPC context creation
 * const tenantContext = parseTenantHeaders(request.headers);
 *
 * // Apply policy separately
 * const contextWithPolicy = applyTenantPolicy(tenantContext, {
 *   blockAdminRoutes: true
 * });
 * ```
 */
export function parseTenantHeaders(
  headers: Headers,
  config?: Pick<TenantMiddlewareConfig, 'headers'>
): TenantContext | null {
  const headerNames = { ...DEFAULT_TENANT_HEADERS, ...config?.headers };

  const isCustomDomain = headers.get(headerNames.isCustomDomain) === 'true';
  if (!isCustomDomain) {
    return null;
  }

  const customDomainHost = headers.get(headerNames.customDomainHost);
  const lockedOrgIdStr = headers.get(headerNames.customDomainOrgId);
  const lockedOrgId = lockedOrgIdStr ? parseInt(lockedOrgIdStr, 10) : null;

  if (!lockedOrgId || isNaN(lockedOrgId)) {
    return null;
  }

  // PARSE ONLY: Return raw parsed data without policy defaults
  // Policy (like blockAdminRoutes) is applied separately via applyTenantPolicy()
  return {
    isCustomDomain: true,
    customDomainHost,
    lockedOrgId,
    blockAdminRoutes: false, // Default to false - policy applied separately
  };
}

/**
 * Apply tenant policy to parsed context
 *
 * Called by app middleware AFTER parsing to apply application-specific
 * policy decisions. This separates parsing (pure) from policy (configurable).
 *
 * @param tenantContext - The parsed tenant context (from parseTenantHeaders)
 * @param policy - Policy options to apply
 * @returns Updated tenant context with policy applied, or null if input was null
 *
 * @example
 * ```typescript
 * // In middleware
 * const parsed = parseTenantHeaders(headers);
 * const tenantContext = applyTenantPolicy(parsed, {
 *   blockAdminRoutes: true,  // App-specific policy
 * });
 * ```
 */
export function applyTenantPolicy(
  tenantContext: TenantContext | null,
  policy: { blockAdminRoutes?: boolean }
): TenantContext | null {
  if (!tenantContext) {
    return null;
  }

  return {
    ...tenantContext,
    blockAdminRoutes: policy.blockAdminRoutes ?? tenantContext.blockAdminRoutes,
  };
}

/**
 * Normalize a hostname (remove port, lowercase)
 *
 * Handles hostnames that may include port numbers (e.g., from local dev).
 *
 * @param hostname - The hostname to normalize
 * @returns Normalized hostname (lowercase, no port)
 *
 * @example
 * ```typescript
 * normalizeHostname('App.JetDevs.AI:3000');  // 'app.jetdevs.ai'
 * normalizeHostname('localhost:8080');        // 'localhost'
 * ```
 */
export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, '');
}

/**
 * Tenant Types and Interfaces for Multi-Tenant/Custom Domain Support
 *
 * This module provides type definitions for multi-tenant SaaS applications
 * that support custom domains. The types are designed to be app-agnostic
 * and reusable across any SaaS application.
 *
 * @module @jetdevs/framework/tenant/types
 */

/**
 * Context information about the current tenant/custom domain
 *
 * This represents the resolved tenant context for a request.
 * When a request comes through a custom domain, this context
 * contains information about which organization the domain maps to.
 */
export interface TenantContext {
  /**
   * Whether this request is via a custom domain
   */
  isCustomDomain: boolean;

  /**
   * The custom domain hostname (e.g., "ai.customer.com")
   * Null when not on a custom domain
   */
  customDomainHost: string | null;

  /**
   * The org ID locked to this custom domain
   * When set, all operations are constrained to this org
   * Null when not on a custom domain
   */
  lockedOrgId: number | null;

  /**
   * Whether admin routes should be blocked on this domain
   * This is a policy decision set by the application
   */
  blockAdminRoutes: boolean;
}

/**
 * Result of resolving a custom domain to an organization
 *
 * Returned by TenantResolver.resolve() when a domain is found in the database.
 */
export interface TenantResolution {
  /**
   * The organization ID mapped to this domain
   */
  orgId: number;

  /**
   * The status of the custom domain
   */
  status: 'active' | 'pending' | 'inactive';

  /**
   * Optional organization name for display
   */
  orgName?: string;

  /**
   * Optional branding/theming configuration
   * Apps can define their own branding structure
   */
  branding?: Record<string, unknown>;
}

/**
 * Interface for custom domain resolution - apps implement this
 *
 * The SDK provides the interface, but apps provide the implementation
 * since database schemas and caching strategies vary between apps.
 *
 * @example
 * ```typescript
 * // App implementation
 * class CustomDomainResolver implements TenantResolver {
 *   async resolve(domain: string): Promise<TenantResolution | null> {
 *     // Check Redis cache first
 *     const cached = await redis.get(`domain:${domain}`);
 *     if (cached) return JSON.parse(cached);
 *
 *     // Query database
 *     const result = await db.query.customDomains.findFirst({
 *       where: eq(customDomains.domain, domain)
 *     });
 *
 *     if (result) {
 *       await redis.setex(`domain:${domain}`, 300, JSON.stringify(result));
 *     }
 *
 *     return result;
 *   }
 *
 *   async invalidate(domain: string): Promise<void> {
 *     await redis.del(`domain:${domain}`);
 *   }
 * }
 * ```
 */
export interface TenantResolver {
  /**
   * Resolve a custom domain to its mapped organization
   *
   * @param domain - The hostname to resolve (e.g., "ai.customer.com")
   * @returns Resolution result or null if not a custom domain
   */
  resolve(domain: string): Promise<TenantResolution | null>;

  /**
   * Invalidate cached resolution for a domain
   * Called when a domain mapping is updated or deleted
   *
   * @param domain - The hostname to invalidate
   */
  invalidate(domain: string): Promise<void>;
}

/**
 * Configuration for tenant middleware
 *
 * Apps provide this configuration to customize how the SDK
 * middleware utilities behave.
 */
export interface TenantMiddlewareConfig {
  /**
   * Platform domains that should NOT be treated as custom domains
   *
   * Any hostname that exactly matches or ends with `.{platformDomain}`
   * will be treated as a platform domain, not a custom domain.
   *
   * @example ['jetdevs.ai', 'jetdevs.com', 'localhost']
   */
  platformDomains: string[];

  /**
   * Routes that should be blocked on custom domains (e.g., admin routes)
   * Supports wildcards: '/admin/*' matches '/admin/anything'
   *
   * @example ['/admin', '/settings/org', '/backoffice/*']
   */
  blockedRoutes?: string[];

  /**
   * Custom header names for tenant information
   * Defaults to DEFAULT_TENANT_HEADERS if not specified
   */
  headers?: {
    isCustomDomain?: string;
    customDomainHost?: string;
    customDomainOrgId?: string;
  };
}

/**
 * Default header names for tenant context
 *
 * These headers are set by middleware and read by tRPC context.
 * They enable secure communication of tenant context between
 * the edge middleware and the application server.
 */
export const DEFAULT_TENANT_HEADERS = {
  isCustomDomain: 'x-custom-domain',
  customDomainHost: 'x-custom-domain-host',
  customDomainOrgId: 'x-custom-domain-org-id',
} as const;

/**
 * Type for the header names object
 */
export type TenantHeaders = typeof DEFAULT_TENANT_HEADERS;

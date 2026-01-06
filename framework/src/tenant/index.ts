/**
 * Tenant Module - Multi-Tenant/Custom Domain Support (Server-Safe)
 *
 * This module provides server-safe exports for multi-tenant SaaS applications
 * that support custom domains. It includes:
 *
 * - Type definitions for tenant context
 * - Middleware utilities for domain detection and header management
 * - tRPC context utilities for org isolation
 *
 * For React hooks and client-side utilities, use:
 * `import { useTenant, TenantProvider } from '@jetdevs/framework/tenant/client'`
 *
 * ## Security Features
 *
 * - Header spoofing prevention via createTenantHeaders()
 * - Locked org enforcement via lockedOrgId in tRPC context
 * - Membership validation utilities
 *
 * ## Usage
 *
 * ### Middleware (Edge)
 * ```typescript
 * import {
 *   isPlatformDomain,
 *   createTenantHeaders,
 *   applyTenantPolicy
 * } from '@jetdevs/framework/tenant';
 *
 * // In middleware.ts
 * if (!isPlatformDomain(hostname, PLATFORM_DOMAINS)) {
 *   const resolved = await resolver.resolve(hostname);
 *   const tenantContext = applyTenantPolicy({
 *     isCustomDomain: true,
 *     customDomainHost: hostname,
 *     lockedOrgId: resolved.orgId,
 *     blockAdminRoutes: false,
 *   }, { blockAdminRoutes: true });
 *
 *   const headers = createTenantHeaders(request.headers, tenantContext);
 *   return NextResponse.next({ request: { headers } });
 * }
 * ```
 *
 * ### tRPC Context
 * ```typescript
 * import {
 *   parseTenantHeaders,
 *   enrichContextWithTenant,
 *   validateTenantAccess
 * } from '@jetdevs/framework/tenant';
 *
 * // In trpc.ts
 * const tenantContext = parseTenantHeaders(headers);
 *
 * if (tenantContext?.isCustomDomain) {
 *   const result = await validateTenantAccess(
 *     userId, tenantContext.lockedOrgId, isSystemUser, checkMembership
 *   );
 *   if (!result.allowed) throw new TRPCError({ code: 'FORBIDDEN' });
 * }
 *
 * return enrichContextWithTenant(baseContext, tenantContext);
 * ```
 *
 * ### Client (import from tenant/client)
 * ```tsx
 * import { useTenant, TenantProvider } from '@jetdevs/framework/tenant/client';
 *
 * function MyComponent() {
 *   const { isCustomDomain, effectiveOrgId } = useTenant();
 *   // ...
 * }
 * ```
 *
 * @module @jetdevs/framework/tenant
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  TenantContext,
  TenantResolution,
  TenantResolver,
  TenantMiddlewareConfig,
  TenantHeaders,
} from './types';

export { DEFAULT_TENANT_HEADERS } from './types';

// =============================================================================
// MIDDLEWARE UTILITIES
// =============================================================================

export {
  isPlatformDomain,
  isBlockedRoute,
  createTenantHeaders,
  parseTenantHeaders,
  applyTenantPolicy,
  normalizeHostname,
} from './middleware';

// =============================================================================
// TRPC CONTEXT UTILITIES
// =============================================================================

export {
  enrichContextWithTenant,
  getEffectiveOrgId,
  createAdminBlockMiddleware,
  validateTenantAccess,
} from './trpc-context';

export type {
  EnrichedTenantContext,
  TenantAccessResult,
} from './trpc-context';

// =============================================================================
// CLIENT-SIDE HOOKS - USE @jetdevs/framework/tenant/client
// =============================================================================
// React hooks and client components are NOT exported from this module
// to prevent bundling React's createContext in server-side code.
//
// For client-side usage, import from '@jetdevs/framework/tenant/client':
//   import { useTenant, TenantProvider, createClientTenantContext } from '@jetdevs/framework/tenant/client';
//
// Available client exports:
//   - useTenant() - Hook to access tenant context
//   - useIsCustomDomain() - Convenience hook for custom domain check
//   - useEffectiveOrgId() - Convenience hook for effective org ID
//   - TenantProvider - React context provider
//   - createClientTenantContext() - Create context from headers (SSR)
//   - ClientTenantContext (type)

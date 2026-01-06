'use client';

/**
 * Tenant Client-Side Utilities
 *
 * This module provides React hooks and client components for accessing tenant
 * context. It is separated from the main tenant module to prevent React's
 * createContext from being bundled into server-side code.
 *
 * ## Usage
 *
 * ```tsx
 * import {
 *   useTenant,
 *   TenantProvider,
 *   createClientTenantContext
 * } from '@jetdevs/framework/tenant/client';
 *
 * // In server component (layout)
 * const headersList = await headers();
 * const tenantContext = createClientTenantContext(
 *   headersList,
 *   session?.user?.currentOrgId ?? null
 * );
 *
 * return (
 *   <TenantProvider value={tenantContext}>
 *     {children}
 *   </TenantProvider>
 * );
 *
 * // In client component
 * function MyComponent() {
 *   const { isCustomDomain, effectiveOrgId } = useTenant();
 *   // ...
 * }
 * ```
 *
 * @module @jetdevs/framework/tenant/client
 */

// Re-export all client-side utilities from use-tenant
export {
  useTenant,
  useIsCustomDomain,
  useEffectiveOrgId,
  createClientTenantContext,
  TenantProvider,
} from './use-tenant';

export type { ClientTenantContext } from './use-tenant';

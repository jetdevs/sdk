'use client';

/**
 * Tenant Client-Side Utilities
 *
 * This module provides React hooks and utilities for accessing tenant
 * context on the client side. The hooks work with SSR and provide
 * safe defaults when no provider is present.
 *
 * @module @jetdevs/framework/tenant/use-tenant
 */

import { useContext, createContext } from 'react';

/**
 * Client-side tenant context
 *
 * This is the shape of tenant context available to React components.
 * It includes computed properties like isOrgSwitchingDisabled.
 */
export interface ClientTenantContext {
  /**
   * Whether on a custom domain
   */
  isCustomDomain: boolean;

  /**
   * The custom domain hostname
   * Null when not on a custom domain
   */
  customDomainHost: string | null;

  /**
   * The locked organization ID
   * Null when not on a custom domain
   */
  lockedOrgId: number | null;

  /**
   * Whether org switching is disabled
   * True on custom domains (users can't switch to a different org)
   */
  isOrgSwitchingDisabled: boolean;

  /**
   * The effective org ID to use
   * On custom domains: lockedOrgId
   * On primary domain: actor's current org ID
   */
  effectiveOrgId: number | null;
}

/**
 * Default context for when no provider is present
 * Represents "not on a custom domain" state
 */
const defaultContext: ClientTenantContext = {
  isCustomDomain: false,
  customDomainHost: null,
  lockedOrgId: null,
  isOrgSwitchingDisabled: false,
  effectiveOrgId: null,
};

/**
 * React context for tenant information
 * @internal
 */
const TenantContextInternal = createContext<ClientTenantContext | null>(null);

/**
 * Provider component for tenant context
 *
 * Wrap your application (or a portion of it) with this provider
 * to make tenant context available to child components.
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * import { TenantProvider, createClientTenantContext } from '@jetdevs/framework/tenant';
 * import { headers } from 'next/headers';
 *
 * export default async function RootLayout({ children }) {
 *   const headersList = await headers();
 *   const tenantContext = createClientTenantContext(
 *     headersList,
 *     session?.user?.currentOrgId ?? null
 *   );
 *
 *   return (
 *     <TenantProvider value={tenantContext}>
 *       {children}
 *     </TenantProvider>
 *   );
 * }
 * ```
 */
export const TenantProvider = TenantContextInternal.Provider;

/**
 * Hook to access tenant context on the client
 *
 * Returns default non-custom-domain context when no provider is present,
 * making it safe to use without explicit provider wrapping.
 *
 * @returns The current tenant context
 *
 * @example
 * ```tsx
 * function OrgSwitcher() {
 *   const tenant = useTenant();
 *
 *   if (tenant.isOrgSwitchingDisabled) {
 *     return <div>Organization: {tenant.effectiveOrgId}</div>;
 *   }
 *
 *   return <OrgSwitcherDropdown />;
 * }
 * ```
 */
export function useTenant(): ClientTenantContext {
  const context = useContext(TenantContextInternal);

  if (!context) {
    // Return default non-custom-domain context
    // This allows components to work without explicit provider
    return defaultContext;
  }

  return context;
}

/**
 * Create tenant context from headers (for SSR)
 *
 * Use this in server components or layouts to create the tenant
 * context that will be passed to the TenantProvider.
 *
 * @param headers - Headers object with get() method (from next/headers)
 * @param actorOrgId - The actor's current org ID (from session)
 * @returns ClientTenantContext to pass to TenantProvider
 *
 * @example
 * ```tsx
 * // In server component
 * import { headers } from 'next/headers';
 * import { createClientTenantContext } from '@jetdevs/framework/tenant';
 *
 * const headersList = await headers();
 * const tenantContext = createClientTenantContext(
 *   headersList,
 *   session?.user?.currentOrgId ?? null
 * );
 * ```
 */
export function createClientTenantContext(
  headers: { get(name: string): string | null },
  actorOrgId: number | null
): ClientTenantContext {
  const isCustomDomain = headers.get('x-custom-domain') === 'true';
  const customDomainHost = headers.get('x-custom-domain-host');
  const lockedOrgIdStr = headers.get('x-custom-domain-org-id');
  const lockedOrgId = lockedOrgIdStr ? parseInt(lockedOrgIdStr, 10) : null;

  return {
    isCustomDomain,
    customDomainHost,
    lockedOrgId,
    isOrgSwitchingDisabled: isCustomDomain,
    effectiveOrgId: lockedOrgId ?? actorOrgId,
  };
}

/**
 * Hook to check if on custom domain (convenience)
 *
 * @returns true if on a custom domain
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isCustomDomain = useIsCustomDomain();
 *
 *   if (isCustomDomain) {
 *     return <CustomDomainBranding />;
 *   }
 *
 *   return <DefaultBranding />;
 * }
 * ```
 */
export function useIsCustomDomain(): boolean {
  const tenant = useTenant();
  return tenant.isCustomDomain;
}

/**
 * Hook to get effective org ID (convenience)
 *
 * @returns The effective org ID (locked org or actor's org)
 *
 * @example
 * ```tsx
 * function OrgDashboard() {
 *   const orgId = useEffectiveOrgId();
 *
 *   if (!orgId) {
 *     return <SelectOrganization />;
 *   }
 *
 *   return <Dashboard orgId={orgId} />;
 * }
 * ```
 */
export function useEffectiveOrgId(): number | null {
  const tenant = useTenant();
  return tenant.effectiveOrgId;
}

/**
 * Tenant Middleware Tests
 *
 * Tests for the SDK tenant middleware utilities that handle custom domain
 * detection, header management, and route blocking.
 *
 * @module @jetdevs/framework/tenant/middleware.test
 */

import { describe, it, expect } from 'vitest';
import {
  isPlatformDomain,
  isBlockedRoute,
  createTenantHeaders,
  parseTenantHeaders,
  applyTenantPolicy,
  normalizeHostname,
} from '../middleware';
import type { TenantContext } from '../types';

describe('isPlatformDomain', () => {
  const platformDomains = ['jetdevs.ai', 'jetdevs.com', 'localhost'];

  it('should return true for exact match', () => {
    expect(isPlatformDomain('jetdevs.ai', platformDomains)).toBe(true);
    expect(isPlatformDomain('localhost', platformDomains)).toBe(true);
  });

  it('should return true for subdomain match (suffix matching)', () => {
    expect(isPlatformDomain('app.jetdevs.ai', platformDomains)).toBe(true);
    expect(isPlatformDomain('staging.jetdevs.ai', platformDomains)).toBe(true);
    expect(isPlatformDomain('dev.staging.jetdevs.ai', platformDomains)).toBe(true);
  });

  it('should return false for different domains', () => {
    expect(isPlatformDomain('ai.customer.com', platformDomains)).toBe(false);
    expect(isPlatformDomain('mycompany.com', platformDomains)).toBe(false);
  });

  it('should return false for similar but different domains', () => {
    // attacker-jetdevs.ai is NOT a subdomain of jetdevs.ai
    expect(isPlatformDomain('attacker-jetdevs.ai', platformDomains)).toBe(false);
    expect(isPlatformDomain('fakejetdevs.ai', platformDomains)).toBe(false);
  });

  it('should handle case insensitively', () => {
    expect(isPlatformDomain('APP.JETDEVS.AI', platformDomains)).toBe(true);
    expect(isPlatformDomain('App.JetDevs.Ai', platformDomains)).toBe(true);
  });

  it('should handle port numbers in hostname', () => {
    expect(isPlatformDomain('localhost:3000', platformDomains)).toBe(true);
    expect(isPlatformDomain('app.jetdevs.ai:8080', platformDomains)).toBe(true);
  });
});

describe('normalizeHostname', () => {
  it('should convert to lowercase', () => {
    expect(normalizeHostname('APP.JETDEVS.AI')).toBe('app.jetdevs.ai');
  });

  it('should remove port numbers', () => {
    expect(normalizeHostname('localhost:3000')).toBe('localhost');
    expect(normalizeHostname('app.jetdevs.ai:8080')).toBe('app.jetdevs.ai');
  });

  it('should handle already normalized hostnames', () => {
    expect(normalizeHostname('app.jetdevs.ai')).toBe('app.jetdevs.ai');
  });
});

describe('isBlockedRoute', () => {
  const blockedRoutes = ['/admin', '/backoffice/*', '/settings/org'];

  it('should return true for exact match', () => {
    expect(isBlockedRoute('/admin', blockedRoutes)).toBe(true);
    expect(isBlockedRoute('/settings/org', blockedRoutes)).toBe(true);
  });

  it('should return true for prefix match with trailing slash', () => {
    expect(isBlockedRoute('/admin/users', blockedRoutes)).toBe(true);
    expect(isBlockedRoute('/settings/org/details', blockedRoutes)).toBe(true);
  });

  it('should return true for wildcard match', () => {
    expect(isBlockedRoute('/backoffice/dashboard', blockedRoutes)).toBe(true);
    expect(isBlockedRoute('/backoffice/users/list', blockedRoutes)).toBe(true);
  });

  it('should return false for non-matching routes', () => {
    expect(isBlockedRoute('/dashboard', blockedRoutes)).toBe(false);
    expect(isBlockedRoute('/api/users', blockedRoutes)).toBe(false);
  });

  it('should handle empty blocked routes', () => {
    expect(isBlockedRoute('/admin', [])).toBe(false);
  });
});

describe('createTenantHeaders', () => {
  it('should clear existing headers when tenantContext is null', () => {
    // Simulate an attacker trying to spoof headers on primary domain
    const existingHeaders = new Headers();
    existingHeaders.set('x-custom-domain', 'true');
    existingHeaders.set('x-custom-domain-host', 'evil.attacker.com');
    existingHeaders.set('x-custom-domain-org-id', '999');

    const result = createTenantHeaders(existingHeaders, null);

    // SECURITY: Headers should be cleared
    expect(result.get('x-custom-domain')).toBeNull();
    expect(result.get('x-custom-domain-host')).toBeNull();
    expect(result.get('x-custom-domain-org-id')).toBeNull();
  });

  it('should set headers when valid tenantContext is provided', () => {
    const existingHeaders = new Headers();
    const tenantContext: TenantContext = {
      isCustomDomain: true,
      customDomainHost: 'ai.customer.com',
      lockedOrgId: 123,
      blockAdminRoutes: true,
    };

    const result = createTenantHeaders(existingHeaders, tenantContext);

    expect(result.get('x-custom-domain')).toBe('true');
    expect(result.get('x-custom-domain-host')).toBe('ai.customer.com');
    expect(result.get('x-custom-domain-org-id')).toBe('123');
  });

  it('should replace spoofed headers with valid tenant context', () => {
    // Simulate someone trying to spoof headers even on a custom domain
    const existingHeaders = new Headers();
    existingHeaders.set('x-custom-domain', 'true');
    existingHeaders.set('x-custom-domain-host', 'evil.attacker.com');
    existingHeaders.set('x-custom-domain-org-id', '999'); // Wrong org

    const tenantContext: TenantContext = {
      isCustomDomain: true,
      customDomainHost: 'ai.customer.com',
      lockedOrgId: 123, // Correct org
      blockAdminRoutes: true,
    };

    const result = createTenantHeaders(existingHeaders, tenantContext);

    // SECURITY: Should use correct values, not spoofed ones
    expect(result.get('x-custom-domain-host')).toBe('ai.customer.com');
    expect(result.get('x-custom-domain-org-id')).toBe('123');
  });

  it('should not set headers if lockedOrgId is missing', () => {
    const existingHeaders = new Headers();
    const tenantContext: TenantContext = {
      isCustomDomain: true,
      customDomainHost: 'ai.customer.com',
      lockedOrgId: null, // Missing org
      blockAdminRoutes: true,
    };

    const result = createTenantHeaders(existingHeaders, tenantContext);

    // Should not set headers without a valid org
    expect(result.get('x-custom-domain')).toBeNull();
  });
});

describe('parseTenantHeaders', () => {
  it('should return null for non-custom-domain requests', () => {
    const headers = new Headers();
    expect(parseTenantHeaders(headers)).toBeNull();
  });

  it('should return null for incomplete headers', () => {
    // Missing org ID
    const headers = new Headers();
    headers.set('x-custom-domain', 'true');
    headers.set('x-custom-domain-host', 'ai.customer.com');
    // No x-custom-domain-org-id

    expect(parseTenantHeaders(headers)).toBeNull();
  });

  it('should return null for invalid org ID', () => {
    const headers = new Headers();
    headers.set('x-custom-domain', 'true');
    headers.set('x-custom-domain-host', 'ai.customer.com');
    headers.set('x-custom-domain-org-id', 'not-a-number');

    expect(parseTenantHeaders(headers)).toBeNull();
  });

  it('should parse valid tenant headers', () => {
    const headers = new Headers();
    headers.set('x-custom-domain', 'true');
    headers.set('x-custom-domain-host', 'ai.customer.com');
    headers.set('x-custom-domain-org-id', '123');

    const result = parseTenantHeaders(headers);

    expect(result).not.toBeNull();
    expect(result!.isCustomDomain).toBe(true);
    expect(result!.customDomainHost).toBe('ai.customer.com');
    expect(result!.lockedOrgId).toBe(123);
    expect(result!.blockAdminRoutes).toBe(false); // Default, policy not applied yet
  });
});

describe('applyTenantPolicy', () => {
  it('should return null if input is null', () => {
    expect(applyTenantPolicy(null, { blockAdminRoutes: true })).toBeNull();
  });

  it('should apply blockAdminRoutes policy', () => {
    const tenantContext: TenantContext = {
      isCustomDomain: true,
      customDomainHost: 'ai.customer.com',
      lockedOrgId: 123,
      blockAdminRoutes: false,
    };

    const result = applyTenantPolicy(tenantContext, { blockAdminRoutes: true });

    expect(result).not.toBeNull();
    expect(result!.blockAdminRoutes).toBe(true);
  });

  it('should preserve other properties', () => {
    const tenantContext: TenantContext = {
      isCustomDomain: true,
      customDomainHost: 'ai.customer.com',
      lockedOrgId: 123,
      blockAdminRoutes: false,
    };

    const result = applyTenantPolicy(tenantContext, { blockAdminRoutes: true });

    expect(result!.isCustomDomain).toBe(true);
    expect(result!.customDomainHost).toBe('ai.customer.com');
    expect(result!.lockedOrgId).toBe(123);
  });
});

describe('Security: Header Spoofing Prevention', () => {
  it('should prevent header injection attack on primary domain', () => {
    // Attack scenario: Attacker sends request to primary domain with spoofed headers
    // trying to access org 999's data
    const attackerHeaders = new Headers();
    attackerHeaders.set('x-custom-domain', 'true');
    attackerHeaders.set('x-custom-domain-host', 'evil.attacker.com');
    attackerHeaders.set('x-custom-domain-org-id', '999');

    // On primary domain, middleware passes null tenantContext
    const sanitizedHeaders = createTenantHeaders(attackerHeaders, null);

    // Downstream, parseTenantHeaders should return null (no custom domain)
    const parsed = parseTenantHeaders(sanitizedHeaders);
    expect(parsed).toBeNull();
  });

  it('should prevent org ID override attack on custom domain', () => {
    // Attack scenario: Attacker on custom domain for org 123 tries to
    // inject headers to access org 456's data
    const attackerHeaders = new Headers();
    attackerHeaders.set('x-custom-domain', 'true');
    attackerHeaders.set('x-custom-domain-host', 'ai.org456.com'); // Wrong domain
    attackerHeaders.set('x-custom-domain-org-id', '456'); // Wrong org

    // Middleware resolves the actual domain and creates correct context
    const realTenantContext: TenantContext = {
      isCustomDomain: true,
      customDomainHost: 'ai.customer123.com',
      lockedOrgId: 123, // Correct org from domain resolution
      blockAdminRoutes: true,
    };

    const sanitizedHeaders = createTenantHeaders(attackerHeaders, realTenantContext);

    // Downstream should get the correct org, not the attacker's
    const parsed = parseTenantHeaders(sanitizedHeaders);
    expect(parsed).not.toBeNull();
    expect(parsed!.lockedOrgId).toBe(123); // Correct org
    expect(parsed!.customDomainHost).toBe('ai.customer123.com'); // Correct domain
  });
});

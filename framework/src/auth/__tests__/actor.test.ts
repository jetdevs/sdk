/**
 * Platform system user = a role flagged `isSystemRole`, nothing else.
 *
 * The global Owner/Admin role TEMPLATE every org assigns carries
 * `admin:full_access` and the whole `admin:*` namespace. Deriving system or
 * super-user status from those permissions made every org Owner/Admin
 * platform staff: permission checks skipped, other orgs reachable through
 * `crossOrg` routes. Admin permissions stay ordinary, org-scoped permissions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canAccessOrg, createActor, hasPermission, mayAccessForeignOrg } from '../actor';

const OWN_ORG = 1;
const FOREIGN_ORG = 2;

const ADMIN_TEMPLATE_PERMISSIONS = [
  'admin:full_access',
  'admin:role_management',
  'admin:user_management',
  'org:cross_org_access',
  'user:read',
];

function ctxFor(roles: any[], permissions: string[]) {
  return {
    session: {
      user: { id: 7, email: 'owner@example.com', currentOrgId: OWN_ORG, roles, permissions },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

describe('createActor — system and super-user status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const name of ['Admin', 'Owner']) {
    it(`a non-system global ${name} role with admin:* is not a system or super user`, () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const actor = createActor(
        ctxFor([{ name, isSystemRole: false, isGlobalRole: true }], ADMIN_TEMPLATE_PERMISSIONS),
      );

      expect(actor.isSystemUser).toBe(false);
      expect(actor.isSuperUser).toBe(false);
      expect(mayAccessForeignOrg(actor)).toBe(false);
      expect(canAccessOrg(actor, FOREIGN_ORG)).toBe(false);
      expect(canAccessOrg(actor, OWN_ORG)).toBe(true);
    });
  }

  it('admin:* stays an ordinary permission in the own org', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const actor = createActor(ctxFor([{ name: 'Admin', isSystemRole: false }], ['admin:full_access']));

    expect(hasPermission(actor, 'admin:full_access')).toBe(true);
  });

  it('a role named like a platform role is not a system user', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const actor = createActor(ctxFor(['Super User', { name: 'super_user', isSystemRole: false }], []));

    expect(actor.isSystemUser).toBe(false);
    expect(actor.isSuperUser).toBe(false);
  });

  it('a role flagged isSystemRole is a system and super user', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const actor = createActor(ctxFor([{ name: 'Platform Staff', isSystemRole: true }], []));

    expect(actor.isSystemUser).toBe(true);
    expect(actor.isSuperUser).toBe(true);
    expect(mayAccessForeignOrg(actor)).toBe(true);
    expect(canAccessOrg(actor, FOREIGN_ORG)).toBe(true);
  });

  it('an inactive isSystemRole assignment grants nothing', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const actor = createActor(ctxFor([{ name: 'Platform Staff', isSystemRole: true, isActive: false }], []));

    expect(actor.isSystemUser).toBe(false);
    expect(actor.isSuperUser).toBe(false);
  });
});

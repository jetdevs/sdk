/**
 * `getUserPermissions` counts a GLOBAL role (Owner, Admin) only where it is
 * assigned.
 *
 * Owner and Admin are global role templates: the role row has no org
 * (`roles.org_id IS NULL`) and every org assigns it through `user_roles`. The
 * filter used to keep any assignment of a global role, whatever org it was in,
 * so the Owner of org B got Owner permissions while acting in org A. The
 * assignment's org decides, as in the session loader and `loadOrgGrants`.
 *
 * Classification: mocked db. The assignment select returns canned rows; the
 * assertion is on the roles the repository keeps.
 */
import { describe, expect, it } from 'vitest';

import { createUserRepositoryClass } from './repository';

const ORG_A = 1;
const ORG_B = 2;

interface UserRoleRow {
  roleId: number;
  orgId: number | null;
  roleName: string;
  roleDescription: string | null;
  roleUuid: string;
  isSystemRole: boolean;
  isGlobalRole: boolean;
  roleOrgId: number | null;
}

const role = (roleId: number, name: string, flags: Partial<UserRoleRow>, orgId: number | null): UserRoleRow => ({
  roleId,
  orgId,
  roleName: name,
  roleDescription: null,
  roleUuid: `uuid-${roleId}`,
  isSystemRole: false,
  isGlobalRole: false,
  roleOrgId: null,
  ...flags,
});

/** First select returns the user's assignments; the permission select returns none. */
function fakeDb(assignments: UserRoleRow[]) {
  let call = 0;
  return {
    select: () => {
      const rows = call++ === 0 ? assignments : [];
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => Promise.resolve(rows),
      };
      return chain;
    },
  } as any;
}

const Repository = createUserRepositoryClass({
  users: {} as any,
  userRoles: {} as any,
  roles: {} as any,
  orgs: {} as any,
  permissions: {} as any,
  rolePermissions: {} as any,
} as any);

function permissionsFor(assignments: UserRoleRow[], orgId: number) {
  return new Repository().getUserPermissions(fakeDb(assignments), 7, orgId);
}

describe('users repository — getUserPermissions org scope', () => {
  it('Owner assigned in org B grants nothing while acting in org A', async () => {
    const result = await permissionsFor(
      [
        role(2, 'Owner', { isGlobalRole: true }, ORG_B),
        role(3, 'Member', {}, ORG_A),
      ],
      ORG_A
    );

    expect(result.roles.map((r: any) => r.name)).toEqual(['Member']);
  });

  it('Owner assigned in org A counts in org A', async () => {
    const result = await permissionsFor([role(2, 'Owner', { isGlobalRole: true }, ORG_A)], ORG_A);

    expect(result.roles.map((r: any) => r.name)).toEqual(['Owner']);
  });

  it('platform staff (system role, org-less) count in every org', async () => {
    const result = await permissionsFor(
      [role(1, 'Super User', { isSystemRole: true, isGlobalRole: true }, null)],
      ORG_A
    );

    expect(result.roles.map((r: any) => r.name)).toEqual(['Super User']);
  });
});

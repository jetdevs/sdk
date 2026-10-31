import { describe, expect, it } from 'vitest';

import {
  filterRoleUsers,
  groupRoleHolders,
  roleUserCompanies,
  sortRoleUsersByLastSeen,
  type RoleHolderInput,
} from './role-users';

const NOW = new Date('2026-10-31T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

function h(p: Partial<RoleHolderInput> & { assignmentId: number; id: number }): RoleHolderInput {
  return {
    email: `u${p.id}@x.com`, name: `User ${p.id}`, isActive: true, orgId: null, orgName: null,
    assignedAt: null, lastSeenAt: null, assignedById: null, assignedByName: null, assignedByEmail: null,
    ...p,
  };
}

const holders = [
  h({ assignmentId: 1, id: 10, name: 'Ana', orgId: 1, orgName: 'Kopi', assignedAt: '2026-05-01T00:00:00Z', assignedByName: 'Late', lastSeenAt: daysAgo(2) }),
  h({ assignmentId: 2, id: 10, name: 'Ana', orgId: 2, orgName: 'Bakery', assignedAt: '2026-01-01T00:00:00Z', assignedByName: 'Early', lastSeenAt: daysAgo(2) }),
  h({ assignmentId: 3, id: 10, name: 'Ana', orgId: 3, orgName: 'Atelier', lastSeenAt: daysAgo(2) }),
  h({ assignmentId: 4, id: 20, name: 'Ben', email: 'ben@shop.io', orgId: 1, orgName: 'Kopi', isActive: false, lastSeenAt: daysAgo(40) }),
  h({ assignmentId: 5, id: 30, name: 'Cy', orgId: 2, orgName: 'Bakery' }),
];

describe('groupRoleHolders', () => {
  it('makes one row per user with every holding, added = earliest', () => {
    const rows = groupRoleHolders(holders);
    expect(rows.map((r) => r.userId)).toEqual([10, 20, 30]);
    const ana = rows[0]!;
    expect(ana.holdings.map((x) => x.orgId)).toEqual([1, 2, 3]);
    expect(ana.addedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(ana.addedByName).toBe('Early');
  });
});

describe('filterRoleUsers', () => {
  const rows = groupRoleHolders(holders);
  const ids = (f: Parameters<typeof filterRoleUsers>[1]) => filterRoleUsers(rows, { now: NOW, ...f }).map((r) => r.userId);

  it('searches name and email', () => {
    expect(ids({ search: 'ana' })).toEqual([10]);
    expect(ids({ search: 'SHOP.io' })).toEqual([20]);
  });
  it('filters by status chip', () => {
    expect(ids({ status: 'active' })).toEqual([10, 30]);
    expect(ids({ status: 'deactivated' })).toEqual([20]);
    // 40 days ago and never seen both count as not active
    expect(ids({ status: 'inactive30' })).toEqual([20, 30]);
  });
  it('filters by company', () => {
    expect(ids({ orgId: 2 })).toEqual([10, 30]);
  });
  it('sorts by last active, never-seen last', () => {
    expect(sortRoleUsersByLastSeen(rows, 'desc').map((r) => r.userId)).toEqual([10, 20, 30]);
    expect(sortRoleUsersByLastSeen(rows, 'asc').map((r) => r.userId)).toEqual([20, 10, 30]);
  });
  it('lists companies for the Company filter, sorted', () => {
    expect(roleUserCompanies(rows).map((c) => c.orgName)).toEqual(['Atelier', 'Bakery', 'Kopi']);
  });
});

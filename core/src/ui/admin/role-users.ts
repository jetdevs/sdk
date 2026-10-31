/**
 * Pure helpers behind the role Users page: group role holdings into one row
 * per user, then search, filter and sort those rows. No React here, so they
 * can be tested without rendering.
 *
 * @module @jetdevs/core/ui/admin
 */

/**
 * One holding of a role, as `userOrg.getUsersByRole` returns it. Dates may
 * arrive as strings when the app's tRPC client has no date transformer.
 */
export interface RoleHolderInput {
  assignmentId: number;
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  orgId: number | null;
  orgName: string | null;
  assignedAt: Date | string | null;
  lastSeenAt?: Date | string | null;
  assignedById: number | null;
  assignedByName: string | null;
  assignedByEmail: string | null;
}

/** One company (or the platform-wide grant, orgId null) a user holds the role in. */
export interface RoleUserHolding {
  assignmentId: number;
  orgId: number | null;
  orgName: string | null;
}

/** One table row: a user and every holding they have of the role. */
export interface RoleUserRow {
  userId: number;
  name: string | null;
  email: string;
  isActive: boolean;
  holdings: RoleUserHolding[];
  /** The earliest holding's assigned date. */
  addedAt: Date | null;
  /** Who made the earliest holding. */
  addedByName: string | null;
  lastSeenAt: Date | null;
}

export type RoleUserStatusFilter = 'all' | 'active' | 'deactivated' | 'inactive30';

export interface RoleUserFilter {
  search?: string;
  status?: RoleUserStatusFilter;
  /** Company filter: keep users holding the role in this org. */
  orgId?: number | null;
  /** Clock for "not active 30+ days"; defaults to now. */
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const NOT_ACTIVE_DAYS = 30;

export function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Group holdings into one row per user, keeping first-seen order. */
export function groupRoleHolders(holders: RoleHolderInput[]): RoleUserRow[] {
  const rows = new Map<number, RoleUserRow>();
  for (const h of holders) {
    const assignedAt = toDate(h.assignedAt);
    let row = rows.get(h.id);
    if (!row) {
      row = {
        userId: h.id,
        name: h.name,
        email: h.email,
        isActive: h.isActive,
        holdings: [],
        addedAt: assignedAt,
        addedByName: h.assignedByName ?? h.assignedByEmail ?? null,
        lastSeenAt: toDate(h.lastSeenAt),
      };
      rows.set(h.id, row);
    } else if (assignedAt && (!row.addedAt || assignedAt < row.addedAt)) {
      row.addedAt = assignedAt;
      row.addedByName = h.assignedByName ?? h.assignedByEmail ?? null;
    }
    if (!row.holdings.some((x) => x.assignmentId === h.assignmentId)) {
      row.holdings.push({ assignmentId: h.assignmentId, orgId: h.orgId, orgName: h.orgName });
    }
  }
  return [...rows.values()];
}

/** True when the user was never seen or was last seen 30+ days ago. */
export function isNotActiveFor30Days(row: RoleUserRow, now: Date = new Date()): boolean {
  if (!row.lastSeenAt) return true;
  return now.getTime() - row.lastSeenAt.getTime() >= NOT_ACTIVE_DAYS * DAY_MS;
}

/** Search name/email, then the status chip, then the company filter. */
export function filterRoleUsers(rows: RoleUserRow[], filter: RoleUserFilter = {}): RoleUserRow[] {
  const q = (filter.search ?? '').trim().toLowerCase();
  const status = filter.status ?? 'all';
  const now = filter.now ?? new Date();
  return rows.filter((r) => {
    if (q && !(r.name ?? '').toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) {
      return false;
    }
    if (status === 'active' && !r.isActive) return false;
    if (status === 'deactivated' && r.isActive) return false;
    if (status === 'inactive30' && !isNotActiveFor30Days(r, now)) return false;
    if (filter.orgId !== undefined && !r.holdings.some((h) => h.orgId === filter.orgId)) {
      return false;
    }
    return true;
  });
}

/** Sort by last active; never-seen users go last either way. */
export function sortRoleUsersByLastSeen(rows: RoleUserRow[], dir: 'asc' | 'desc'): RoleUserRow[] {
  return [...rows].sort((a, b) => {
    if (!a.lastSeenAt && !b.lastSeenAt) return 0;
    if (!a.lastSeenAt) return 1;
    if (!b.lastSeenAt) return -1;
    const diff = a.lastSeenAt.getTime() - b.lastSeenAt.getTime();
    return dir === 'asc' ? diff : -diff;
  });
}

/** The companies the role is held in, for the Company filter. */
export function roleUserCompanies(rows: RoleUserRow[]): Array<{ orgId: number; orgName: string }> {
  const seen = new Map<number, string>();
  for (const r of rows) {
    for (const h of r.holdings) {
      if (h.orgId !== null && !seen.has(h.orgId)) {
        seen.set(h.orgId, h.orgName ?? `Company ${h.orgId}`);
      }
    }
  }
  return [...seen.entries()]
    .map(([orgId, orgName]) => ({ orgId, orgName }))
    .sort((a, b) => a.orgName.localeCompare(b.orgName));
}

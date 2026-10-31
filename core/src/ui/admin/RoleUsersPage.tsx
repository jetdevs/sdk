'use client';

/**
 * Role Users Page Factory
 *
 * The Users tab of a role's page: who holds the role, where, since when, and
 * when they were last active, with search, filters and (bulk) removal.
 * Inviting is the app's job: pass `renderInvite` to show the app's own invite
 * dialog with the role pre-filled.
 *
 * @module @jetdevs/core/ui/admin
 *
 * @example
 * ```tsx
 * import { createRoleUsersPage } from '@jetdevs/core/ui/admin';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const RoleUsersPage = createRoleUsersPage({ api, ui: { ...UI, toast } });
 *
 * <RoleUsersPage
 *   role={{ id, name, isSystemRole }}
 *   currentUserId={session.user.id}
 *   renderInvite={({ role, open, onOpenChange, onInvited }) => (
 *     <InviteUserDialog open={open} onOpenChange={onOpenChange} defaultRoleId={role.id} onSuccess={onInvited} />
 *   )}
 * />
 * ```
 */

import * as React from 'react';
import { useMemo, useState } from 'react';

import {
  filterRoleUsers,
  groupRoleHolders,
  roleUserCompanies,
  sortRoleUsersByLastSeen,
  type RoleHolderInput,
  type RoleUserRow,
  type RoleUserStatusFilter,
} from './role-users';

// =============================================================================
// TYPES
// =============================================================================

export interface RoleUsersPageRole {
  id: number;
  name: string;
  description?: string | null;
  isSystemRole: boolean;
  permissionCount?: number;
}

export interface RoleUsersApi {
  userOrg: {
    getUsersByRole: {
      useQuery: (input: { roleId: number }) => {
        data: RoleHolderInput[] | undefined;
        isLoading: boolean;
        error: { message: string } | null;
      };
    };
    removeRole: {
      useMutation: () => {
        mutateAsync: (input: { userId: number; orgId: number | null; roleId: number }) => Promise<unknown>;
      };
    };
  };
  useUtils: () => {
    userOrg: { getUsersByRole: { invalidate: (input?: { roleId: number }) => Promise<void> } };
    role: { getAllWithStats: { invalidate: () => Promise<void> } };
  };
}

export interface RoleUsersUIComponents {
  Button: React.ComponentType<{
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'outline' | 'destructive' | 'ghost' | 'secondary';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    disabled?: boolean;
  }>;
  Input: React.ComponentType<{
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
  }>;
  Checkbox: React.ComponentType<{
    checked: boolean | 'indeterminate';
    onCheckedChange: (checked: boolean | 'indeterminate') => void;
    'aria-label'?: string;
  }>;
  AlertDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  AlertDialogContent: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogTitle: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  AlertDialogDescription: React.ComponentType<{ asChild?: boolean; children: React.ReactNode }>;
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogCancel: React.ComponentType<{ disabled?: boolean; children: React.ReactNode }>;
  AlertDialogAction: React.ComponentType<{
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  toast: { success: (message: string) => void; error: (message: string) => void };
}

export interface RoleUsersInviteArgs {
  role: RoleUsersPageRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Call after a successful invite: refreshes the list. */
  onInvited: () => void;
}

export interface RoleUsersPageProps {
  role: RoleUsersPageRole;
  currentUserId: number;
  /** The app's own invite dialog, role pre-filled. No button when absent. */
  renderInvite?: (args: RoleUsersInviteArgs) => React.ReactNode;
  onUserClick?: (userId: number) => void;
}

export interface RoleUsersPageFactoryConfig {
  api: RoleUsersApi;
  ui: RoleUsersUIComponents;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(d: Date | null): string {
  return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function formatLastSeen(d: Date | null, now: Date): string {
  if (!d) return 'Never';
  const days = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(d);
}

function displayName(r: RoleUserRow): string {
  return r.name || r.email;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong';
}

const STATUS_CHIPS: Array<{ value: RoleUserStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'inactive30', label: 'Not active 30+ days' },
];

// Flat look: fills, no outlines.
const chipClass = (on: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
  }`;

// =============================================================================
// FACTORY
// =============================================================================

export function createRoleUsersPage(config: RoleUsersPageFactoryConfig) {
  const { api, ui } = config;
  const {
    Button,
    Input,
    Checkbox,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    toast,
  } = ui;

  return function RoleUsersPage({ role, currentUserId, renderInvite, onUserClick }: RoleUsersPageProps) {
    const query = api.userOrg.getUsersByRole.useQuery({ roleId: role.id });
    const removeRole = api.userOrg.removeRole.useMutation();
    const utils = api.useUtils();

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<RoleUserStatusFilter>('all');
    const [orgId, setOrgId] = useState<number | undefined>(undefined);
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [confirmRows, setConfirmRows] = useState<RoleUserRow[] | null>(null);
    const [removing, setRemoving] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);

    const now = useMemo(() => new Date(), [query.data]);
    const allRows = useMemo(() => groupRoleHolders(query.data ?? []), [query.data]);
    const companies = useMemo(() => roleUserCompanies(allRows), [allRows]);
    // "Not active 30+ days" needs a last-seen date; apps without one get no chip.
    const hasLastSeen = allRows.some((r) => r.lastSeenAt !== null);
    const rows = useMemo(() => {
      const filtered = filterRoleUsers(allRows, {
        search,
        status,
        orgId: role.isSystemRole ? undefined : orgId,
        now,
      });
      return sortDir ? sortRoleUsersByLastSeen(filtered, sortDir) : filtered;
    }, [allRows, search, status, orgId, sortDir, now, role.isSystemRole]);

    const selectable = rows.filter((r) => r.userId !== currentUserId);
    // Only rows the current filter shows can be removed: hidden rows stay.
    const selectedRows = selectable.filter((r) => selected.has(r.userId));
    const allTicked = selectable.length > 0 && selectable.every((r) => selected.has(r.userId));
    const someTicked = selectable.some((r) => selected.has(r.userId));

    const toggle = (userId: number, on: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    const refresh = async () => {
      await Promise.all([
        utils.userOrg.getUsersByRole.invalidate({ roleId: role.id }),
        utils.role.getAllWithStats.invalidate(),
      ]);
    };

    const doRemove = async (targets: RoleUserRow[]) => {
      setRemoving(true);
      let removedUsers = 0;
      try {
        for (const r of targets) {
          let ok = true;
          // Every holding of this user for this role, each with its own org.
          for (const h of r.holdings) {
            try {
              await removeRole.mutateAsync({ userId: r.userId, orgId: h.orgId, roleId: role.id });
            } catch (err) {
              ok = false;
              const where = h.orgName ? ` (${h.orgName})` : '';
              toast.error(`${displayName(r)}${where}: ${errorMessage(err)}`);
            }
          }
          if (ok) removedUsers++;
        }
      } finally {
        try {
          await refresh();
        } catch (err) {
          toast.error(`Couldn't refresh the list: ${errorMessage(err)}`);
        }
        setRemoving(false);
        setSelected(new Set());
        setConfirmRows(null);
      }
      if (removedUsers > 0) {
        toast.success(
          removedUsers === 1
            ? `Removed ${role.name} from 1 user`
            : `Removed ${role.name} from ${removedUsers} users`,
        );
      }
    };

    const requestRemove = (targets: RoleUserRow[]) => {
      const companyFilter = !role.isSystemRole && orgId !== undefined && orgId !== null ? orgId : undefined;
      // With a company filter on, remove the role in that company only.
      const allowed = targets
        .filter((r) => r.userId !== currentUserId)
        .map((r) => (companyFilter === undefined ? r : { ...r, holdings: r.holdings.filter((h) => h.orgId === companyFilter) }))
        .filter((r) => r.holdings.length > 0);
      if (allowed.length === 0) return;
      if (role.isSystemRole) {
        setConfirmRows(allowed);
      } else {
        void doRemove(allowed);
      }
    };

    const colCount = role.isSystemRole ? 6 : 7;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.filter((c) => c.value !== 'inactive30' || hasLastSeen).map((c) => (
              <button key={c.value} type="button" className={chipClass(status === c.value)} onClick={() => setStatus(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          {!role.isSystemRole && companies.length > 1 && (
            <select
              className="rounded-md bg-muted px-2 py-1 text-sm"
              value={orgId === undefined ? '' : String(orgId)}
              onChange={(e) => setOrgId(e.target.value === '' ? undefined : Number(e.target.value))}
              aria-label="Company"
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.orgId} value={c.orgId}>
                  {c.orgName}
                </option>
              ))}
            </select>
          )}
          {renderInvite && (
            <div className="ml-auto">
              <Button onClick={() => setInviteOpen(true)}>Invite users</Button>
            </div>
          )}
        </div>

        {selectedRows.length > 0 && (
          <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{selectedRows.length} selected</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={removing}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => requestRemove(selectedRows)} disabled={removing}>
              Remove selected
            </Button>
          </div>
        )}

        <div className="overflow-x-auto rounded-md bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={allTicked ? true : someTicked ? 'indeterminate' : false}
                    onCheckedChange={(v) => {
                      setSelected(v === true ? new Set(selectable.map((r) => r.userId)) : new Set());
                    }}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Name</th>
                {!role.isSystemRole && <th className="px-3 py-2 font-medium">Where</th>}
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="font-medium hover:text-foreground"
                    onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                  >
                    Last active {sortDir === 'desc' ? '↓' : sortDir === 'asc' ? '↑' : ''}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-muted-foreground">Loading users…</td>
                </tr>
              )}
              {query.error && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-destructive">
                    Couldn't load users: {query.error.message}
                  </td>
                </tr>
              )}
              {!query.isLoading && !query.error && rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-muted-foreground">
                    {allRows.length === 0 ? 'No users have this role yet.' : 'No users match.'}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isSelf = r.userId === currentUserId;
                return (
                  <tr key={r.userId} className="border-t border-border/50">
                    <td className="px-3 py-2">
                      {!isSelf && (
                        <Checkbox
                          checked={selected.has(r.userId)}
                          onCheckedChange={(v) => toggle(r.userId, v === true)}
                          aria-label={`Select ${displayName(r)}`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left disabled:cursor-default"
                        onClick={() => onUserClick?.(r.userId)}
                        disabled={!onUserClick}
                      >
                        <div className="font-medium">{r.name || r.email}</div>
                        {r.name && <div className="text-xs text-muted-foreground">{r.email}</div>}
                      </button>
                    </td>
                    {!role.isSystemRole && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.holdings
                            .filter((h) => h.orgId !== null)
                            .map((h) => (
                              <span key={h.assignmentId} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                {h.orgName ?? `Company ${h.orgId}`}
                              </span>
                            ))}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div>{formatDate(r.addedAt)}</div>
                      {r.addedByName && <div className="text-xs text-muted-foreground">by {r.addedByName}</div>}
                    </td>
                    <td className="px-3 py-2">{formatLastSeen(r.lastSeenAt, now)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.isActive ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {r.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">Can't remove yourself</span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => requestRemove([r])} disabled={removing}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <AlertDialog open={confirmRows !== null} onOpenChange={(o) => !o && !removing && setConfirmRows(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {role.name} from {confirmRows?.length === 1 ? displayName(confirmRows[0]!) : `${confirmRows?.length ?? 0} users`}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {confirmRows && confirmRows.length > 1 && (
                    <ul className="list-disc pl-5">
                      {confirmRows.map((r) => (
                        <li key={r.userId}>{displayName(r)}</li>
                      ))}
                    </ul>
                  )}
                  <p>They lose full platform access at their next sign-in. Their accounts stay.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmRows) void doRemove(confirmRows);
                }}
                disabled={removing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removing ? 'Removing…' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {renderInvite?.({
          role,
          open: inviteOpen,
          onOpenChange: setInviteOpen,
          onInvited: () => {
            setInviteOpen(false);
            refresh().catch((err) => toast.error(`Couldn't refresh the list: ${errorMessage(err)}`));
          },
        })}
      </div>
    );
  };
}

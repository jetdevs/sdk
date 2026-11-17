/**
 * User role operations that broadcast a real-time permission update.
 *
 * Ported from cadra-web `src/lib/user-role-operations.ts` (most complete copy;
 * core-saas/crm lack updateUserRoleStatus/bulk/broadcastPermissionUpdate).
 * The store (privileged user_roles writes) and the publisher (redis pub/sub,
 * SSE hub, ...) are injected. The returned `assignUserRole` / `removeUserRole`
 * fit the SDK users-service hooks of the same names.
 *
 * These writes are privileged: an org-level caller must pass
 * `findRoleAssignmentRefusal` (rbac/assignable-role) BEFORE calling assign —
 * or wire it in as `refuseAssignment` so it cannot be skipped.
 */

export interface UserRoleAssignment {
  userId: number;
  orgId: number;
  roleId: number;
  isActive?: boolean;
  assignedBy?: number;
}

export interface UserRoleFilter {
  userId?: number;
  orgId?: number;
  roleId?: number;
}

/** Shape the SSE client consumes (cadra-web PermissionEventPayload). */
export interface PermissionEventPayload {
  currentOrgPermissions: string[];
  globalPermissions: string[];
  isUserActive: boolean;
  hasAnyOrgAccess: boolean;
  activeOrganizations: number[];
  shouldMaintainSession: boolean;
  timestamp: number;
}

export interface UserRoleStore<Row> {
  insert(rows: ReadonlyArray<Required<Pick<UserRoleAssignment, 'userId' | 'orgId' | 'roleId' | 'isActive'>> & { assignedBy?: number }>): Promise<Row[]>;
  /** Deletes matching rows; returns the deleted rows' user ids (read before delete). */
  remove(filter: UserRoleFilter): Promise<{ rows: Row[]; userIds: number[] }>;
  setActive(filter: UserRoleFilter, isActive: boolean): Promise<{ rows: Row[]; userIds: number[] }>;
}

export interface UserRoleOperationsDeps<Row> {
  store: UserRoleStore<Row>;
  /** Fresh payload for one user (real-time permissions + session status). */
  loadPayload(userId: number): Promise<PermissionEventPayload>;
  publish(channel: string, payload: PermissionEventPayload): Promise<void>;
  /** Default `permissions:user:{userId}` (cadra-web's current channel). */
  channelFor?: (userId: number) => string;
  /** Return a refusal message to block the assignment (e.g. assignable-role check). */
  refuseAssignment?: (assignment: UserRoleAssignment) => Promise<string | null>;
}

export const defaultPermissionChannel = (userId: number): string => `permissions:user:${userId}`;

function assertFilter(filter: UserRoleFilter): void {
  if (!filter.userId && !filter.orgId && !filter.roleId) {
    throw new Error('At least one filter condition must be provided');
  }
}

export function createUserRoleOperations<Row>(deps: UserRoleOperationsDeps<Row>) {
  const channelFor = deps.channelFor ?? defaultPermissionChannel;

  /** Never throws: a failed broadcast must not fail the write. Returns success count. */
  async function broadcastPermissionUpdate(userIds: readonly number[]): Promise<number> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return 0;
    const results = await Promise.all(
      unique.map(async (userId) => {
        try {
          await deps.publish(channelFor(userId), await deps.loadPayload(userId));
          return true;
        } catch (err) {
          console.error('[rbac] permission broadcast failed', { userId, err });
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }

  async function guard(assignments: readonly UserRoleAssignment[]): Promise<void> {
    if (!deps.refuseAssignment) return;
    for (const a of assignments) {
      const refusal = await deps.refuseAssignment(a);
      if (refusal) throw new Error(refusal);
    }
  }

  async function bulkAssignUserRoles(assignments: readonly UserRoleAssignment[]): Promise<Row[]> {
    if (assignments.length === 0) return [];
    await guard(assignments);
    const rows = await deps.store.insert(
      assignments.map((a) => ({
        userId: a.userId,
        orgId: a.orgId,
        roleId: a.roleId,
        isActive: a.isActive ?? true,
        assignedBy: a.assignedBy,
      })),
    );
    await broadcastPermissionUpdate(assignments.map((a) => a.userId));
    return rows;
  }

  async function assignUserRole(assignment: UserRoleAssignment): Promise<Row[]> {
    return bulkAssignUserRoles([assignment]);
  }

  async function removeUserRole(filter: UserRoleFilter): Promise<Row[]> {
    assertFilter(filter);
    const { rows, userIds } = await deps.store.remove(filter);
    await broadcastPermissionUpdate(userIds);
    return rows;
  }

  async function updateUserRoleStatus(filter: UserRoleFilter, isActive: boolean): Promise<Row[]> {
    assertFilter(filter);
    const { rows, userIds } = await deps.store.setActive(filter, isActive);
    await broadcastPermissionUpdate(userIds);
    return rows;
  }

  return { assignUserRole, bulkAssignUserRoles, removeUserRole, updateUserRoleStatus, broadcastPermissionUpdate };
}

/**
 * Org Membership Types
 *
 * Type definitions for organization membership operations.
 *
 * @module @jetdevs/core/org-membership
 */

// =============================================================================
// STATUS TYPES
// =============================================================================

/**
 * Org member status values
 */
export type OrgMemberStatus = 'invited' | 'active' | 'suspended' | 'removed';

/**
 * Valid status transitions for the membership state machine.
 *
 * invited -> active (accept)
 * active -> suspended (suspend)
 * suspended -> active (unsuspend)
 * active -> removed (remove)
 * suspended -> removed (remove)
 * removed -> invited (reinvite)
 */
export const VALID_STATUS_TRANSITIONS: Record<OrgMemberStatus, OrgMemberStatus[]> = {
  invited: ['active'],
  active: ['suspended', 'removed'],
  suspended: ['active', 'removed'],
  removed: ['invited'],
};

// =============================================================================
// MEMBER TYPES
// =============================================================================

/**
 * Org member record with user details
 */
export interface OrgMemberWithUser {
  id: number;
  uuid: string;
  userId: number;
  orgId: number;
  status: OrgMemberStatus;
  invitedBy: number | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  pendingRoleId: number | null;
  removedAt: Date | null;
  removedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined user fields
  user?: {
    id: number;
    uuid: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatar: string | null;
    isActive: boolean;
  };
  // Joined pending role fields
  pendingRole?: {
    id: number;
    name: string;
  } | null;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Input for inviting a user to an org
 */
export interface InviteInput {
  userId: number;
  orgId: number;
  invitedBy: number;
  pendingRoleId?: number;
}

/**
 * Input for listing org members
 */
export interface ListMembersInput {
  orgId: number;
  status?: OrgMemberStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Input for counting org members
 */
export interface CountMembersInput {
  orgId: number;
  status?: OrgMemberStatus[];
}

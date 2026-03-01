/**
 * Org Membership Types
 *
 * Type definitions for org membership management.
 *
 * @module @jetdevs/core/org-membership
 */

// =============================================================================
// STATUS TYPES
// =============================================================================

export type OrgMemberStatus = 'invited' | 'active' | 'suspended' | 'removed';

// =============================================================================
// RECORD TYPES
// =============================================================================

/**
 * Org member record as stored in database
 */
export interface OrgMemberRecord {
  id: number;
  uuid: string;
  userId: number;
  orgId: number;
  status: OrgMemberStatus;
  pendingRoleId: number | null;
  invitedBy: number | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  removedAt: Date | null;
  removedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Org member with user details attached
 */
export interface OrgMemberWithUser extends OrgMemberRecord {
  user: {
    id: number;
    uuid: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
    isActive: boolean;
  };
  pendingRole?: {
    id: number;
    name: string;
  } | null;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface InviteInput {
  userId: number;
  orgId: number;
  invitedBy: number;
  pendingRoleId?: number;
}

export interface InviteByEmailInput {
  email: string;
  orgId: number;
  invitedBy: number;
  pendingRoleId?: number;
}

// =============================================================================
// QUERY TYPES
// =============================================================================

export interface OrgMemberListOptions {
  status?: OrgMemberStatus[];
  search?: string;
  limit: number;
  offset: number;
}

export interface OrgMemberListResult {
  members: OrgMemberWithUser[];
  totalCount: number;
}

// =============================================================================
// HOOK TYPES
// =============================================================================

export interface OrgMembershipHooks {
  /** Called after a member is invited */
  onInvite?: (member: OrgMemberRecord) => Promise<void>;
  /** Called after a member accepts their invitation */
  onAccept?: (member: OrgMemberRecord) => Promise<void>;
  /** Called after a member is removed - should deactivate user_roles */
  onRemove?: (member: OrgMemberRecord, removedBy: number) => Promise<void>;
  /** Called after a member is suspended */
  onSuspend?: (member: OrgMemberRecord) => Promise<void>;
  /** Called after a member is unsuspended */
  onUnsuspend?: (member: OrgMemberRecord) => Promise<void>;
}

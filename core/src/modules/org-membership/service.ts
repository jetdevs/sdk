/**
 * Org Membership Service
 *
 * Business logic for org membership lifecycle operations.
 * Manages status transitions and lifecycle hooks (onInvite, onAccept, onRemove).
 *
 * @module @jetdevs/core/org-membership
 */

import type { IOrgMemberRepository } from './repository';
import type { OrgMemberWithUser } from './types';

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Lifecycle hooks that consuming apps can provide
 */
export interface OrgMembershipHooks {
  /**
   * Called after a user is invited. Use to send invitation emails.
   */
  onInvite?: (params: {
    member: OrgMemberWithUser;
    orgId: number;
    invitedBy: number;
  }) => Promise<void>;

  /**
   * Called after a user accepts an invitation. Use to assign pending role.
   */
  onAccept?: (params: {
    member: OrgMemberWithUser;
    orgId: number;
    userId: number;
    pendingRoleId: number | null;
  }) => Promise<void>;

  /**
   * Called after a user is removed. Use to deactivate user_roles for this org.
   */
  onRemove?: (params: {
    member: OrgMemberWithUser;
    orgId: number;
    userId: number;
    removedBy: number;
  }) => Promise<void>;

  /**
   * Called after a user is suspended.
   */
  onSuspend?: (params: {
    member: OrgMemberWithUser;
    orgId: number;
    userId: number;
  }) => Promise<void>;

  /**
   * Called after a user is unsuspended.
   */
  onUnsuspend?: (params: {
    member: OrgMemberWithUser;
    orgId: number;
    userId: number;
  }) => Promise<void>;

  /**
   * Look up or create a user by email. Required for inviteByEmail.
   */
  findOrCreateUserByEmail?: (params: {
    email: string;
    db: any;
  }) => Promise<{ id: number; isNew: boolean }>;
}

/**
 * Service context provided by createRouterWithActor
 */
export interface OrgMembershipServiceContext {
  db: any;
  orgId: number | null;
  userId: string;
}

/**
 * Error class for membership service operations
 */
export class OrgMembershipServiceError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'OrgMembershipServiceError';
  }
}

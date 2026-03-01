/**
 * Org Membership Service
 *
 * Business logic for org membership lifecycle transitions.
 * Handles hooks for side effects (e.g., role assignment on accept,
 * role cleanup on remove).
 *
 * @module @jetdevs/core/org-membership
 */

import type { IOrgMemberRepository } from './repository';
import type { OrgMemberRecord, OrgMembershipHooks } from './types';

// =============================================================================
// SERVICE TYPES
// =============================================================================

export interface OrgMembershipServiceDeps {
  /** Repository instance for database operations */
  repository: IOrgMemberRepository;

  /** Optional hooks for lifecycle side effects */
  hooks?: OrgMembershipHooks;

  /** Look up or create a user by email (app-specific) */
  findOrCreateUserByEmail?: (
    db: any,
    email: string
  ) => Promise<{ id: number; isNew: boolean }>;

  /** Assign a role to a user in an org (from user_roles) */
  assignRole?: (
    db: any,
    userId: number,
    roleId: number,
    orgId: number,
    assignedBy: number
  ) => Promise<void>;

  /** Deactivate all roles for a user in an org */
  deactivateRolesInOrg?: (db: any, userId: number, orgId: number) => Promise<void>;
}

// =============================================================================
// SERVICE ERROR
// =============================================================================

export class OrgMembershipServiceError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'OrgMembershipServiceError';
  }
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

export function createOrgMembershipService(deps: OrgMembershipServiceDeps) {
  const { repository, hooks } = deps;

  return {
    /**
     * List members in an org with optional filtering
     */
    async list(
      db: any,
      orgId: number,
      options?: { status?: string[]; search?: string; limit?: number; offset?: number }
    ) {
      const members = await repository.findByOrg(db, orgId, options as any);
      const totalCount = await repository.countByOrg(db, orgId, {
        status: options?.status as any,
        search: options?.search,
      });

      return { members, totalCount };
    },

    /**
     * Invite a user by email. Looks up or creates user, then creates membership.
     */
    async inviteByEmail(
      db: any,
      email: string,
      orgId: number,
      invitedBy: number,
      pendingRoleId?: number
    ): Promise<OrgMemberRecord> {
      if (!deps.findOrCreateUserByEmail) {
        throw new OrgMembershipServiceError(
          'BAD_REQUEST',
          'findOrCreateUserByEmail hook is required for inviteByEmail'
        );
      }

      const { id: userId } = await deps.findOrCreateUserByEmail(db, email);
      const member = await repository.invite(db, {
        userId,
        orgId,
        invitedBy,
        pendingRoleId,
      });

      await hooks?.onInvite?.(member);
      return member;
    },

    /**
     * Invite an existing platform user to an org
     */
    async inviteExistingUser(
      db: any,
      userId: number,
      orgId: number,
      invitedBy: number,
      pendingRoleId?: number
    ): Promise<OrgMemberRecord> {
      const member = await repository.invite(db, {
        userId,
        orgId,
        invitedBy,
        pendingRoleId,
      });

      await hooks?.onInvite?.(member);
      return member;
    },

    /**
     * Accept an invitation. Assigns pending role if configured.
     */
    async accept(
      db: any,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord> {
      // Get the membership to check pending role before accepting
      const existing = await repository.findByUserAndOrg(db, userId, orgId);
      if (!existing) {
        throw new OrgMembershipServiceError('NOT_FOUND', 'No membership found');
      }

      const member = await repository.accept(db, userId, orgId);

      // Assign pending role if configured
      if (existing.pendingRoleId && deps.assignRole) {
        await deps.assignRole(db, userId, existing.pendingRoleId, orgId, userId);
      }

      await hooks?.onAccept?.(member);
      return member;
    },

    /**
     * Suspend a member
     */
    async suspend(
      db: any,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord> {
      const member = await repository.suspend(db, userId, orgId);
      await hooks?.onSuspend?.(member);
      return member;
    },

    /**
     * Unsuspend a member
     */
    async unsuspend(
      db: any,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord> {
      const member = await repository.unsuspend(db, userId, orgId);
      await hooks?.onUnsuspend?.(member);
      return member;
    },

    /**
     * Remove a member. Deactivates roles if hook configured.
     */
    async remove(
      db: any,
      userId: number,
      orgId: number,
      removedBy: number
    ): Promise<OrgMemberRecord> {
      const member = await repository.remove(db, userId, orgId, removedBy);

      // Deactivate roles in org
      if (deps.deactivateRolesInOrg) {
        await deps.deactivateRolesInOrg(db, userId, orgId);
      }

      await hooks?.onRemove?.(member, removedBy);
      return member;
    },

    /**
     * Reinvite a previously removed member
     */
    async reinvite(
      db: any,
      userId: number,
      orgId: number,
      invitedBy: number,
      pendingRoleId?: number
    ): Promise<OrgMemberRecord> {
      const member = await repository.reinvite(db, userId, orgId, invitedBy, pendingRoleId);
      await hooks?.onInvite?.(member);
      return member;
    },

    /**
     * Check if a user is an active member of an org
     */
    async isActiveMember(db: any, userId: number, orgId: number): Promise<boolean> {
      return repository.isActiveMember(db, userId, orgId);
    },

    /**
     * Get membership record for user in org
     */
    async getMembership(db: any, userId: number, orgId: number) {
      return repository.findByUserAndOrg(db, userId, orgId);
    },
  };
}

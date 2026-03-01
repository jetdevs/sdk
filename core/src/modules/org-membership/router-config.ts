/**
 * Org Membership Router Configuration Factory
 *
 * Creates router configuration for use with createRouterWithActor.
 * Provides endpoints for invite, accept, suspend, unsuspend, remove, and list.
 *
 * @module @jetdevs/core/org-membership
 */

import { z } from 'zod';
import type { IOrgMemberRepository } from './repository';
import {
  orgMemberListSchema,
  inviteByEmailSchema,
  inviteExistingUserSchema,
  acceptSchema,
  suspendSchema,
  unsuspendSchema,
  removeSchema,
  reinviteSchema,
} from './schemas';
import type { OrgMembershipHooks } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface OrgMembershipRouterDeps {
  /** Repository class constructor */
  Repository: new (db: any) => IOrgMemberRepository;

  /** Optional hooks for lifecycle side effects */
  hooks?: OrgMembershipHooks;

  /** Look up or create a user by email */
  findOrCreateUserByEmail?: (
    db: any,
    email: string
  ) => Promise<{ id: number; isNew: boolean }>;

  /** Assign a role to a user in an org */
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

interface HandlerContext<TInput = any> {
  input: TInput;
  service: { db: any; orgId: number | null; userId: string };
  actor: any;
  db: any;
  repo: IOrgMemberRepository;
  ctx: any;
}

class OrgMembershipRouterError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'OrgMembershipRouterError';
  }
}

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

export function createOrgMembershipRouterConfig(deps: OrgMembershipRouterDeps) {
  return {
    // -------------------------------------------------------------------------
    // LIST MEMBERS
    // -------------------------------------------------------------------------
    list: {
      type: 'query' as const,
      permission: 'org-member:read',
      input: orgMemberListSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof orgMemberListSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        const members = await repo.findByOrg(db, service.orgId, {
          status: input.status as any,
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        });

        const totalCount = await repo.countByOrg(db, service.orgId, {
          status: input.status as any,
          search: input.search,
        });

        return { members, totalCount };
      },
    },

    // -------------------------------------------------------------------------
    // INVITE BY EMAIL
    // -------------------------------------------------------------------------
    inviteByEmail: {
      permission: 'org-member:invite',
      input: inviteByEmailSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof inviteByEmailSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        if (!deps.findOrCreateUserByEmail) {
          throw new OrgMembershipRouterError(
            'BAD_REQUEST',
            'findOrCreateUserByEmail hook is required for inviteByEmail'
          );
        }

        const invitedBy = parseInt(service.userId);
        const { id: userId } = await deps.findOrCreateUserByEmail(db, input.email);

        const member = await repo.invite(db, {
          userId,
          orgId: service.orgId,
          invitedBy,
          pendingRoleId: input.roleId,
        });

        await deps.hooks?.onInvite?.(member);
        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // INVITE EXISTING USER
    // -------------------------------------------------------------------------
    inviteExistingUser: {
      permission: 'org-member:invite',
      input: inviteExistingUserSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof inviteExistingUserSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        const invitedBy = parseInt(service.userId);

        const member = await repo.invite(db, {
          userId: input.userId,
          orgId: service.orgId,
          invitedBy,
          pendingRoleId: input.roleId,
        });

        await deps.hooks?.onInvite?.(member);
        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // ACCEPT INVITATION (self-service)
    // -------------------------------------------------------------------------
    accept: {
      input: acceptSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof acceptSchema>>) => {
        const userId = parseInt(service.userId);

        // Get existing membership to check pending role
        const existing = await repo.findByUserAndOrg(db, userId, input.orgId);
        if (!existing) {
          throw new OrgMembershipRouterError('NOT_FOUND', 'No invitation found');
        }

        // Accept the membership
        const member = await repo.accept(db, userId, input.orgId);

        // Assign pending role if configured
        if (existing.pendingRoleId && deps.assignRole) {
          await deps.assignRole(db, userId, existing.pendingRoleId, input.orgId, userId);
        }

        await deps.hooks?.onAccept?.(member);
        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // SUSPEND MEMBER
    // -------------------------------------------------------------------------
    suspend: {
      permission: 'org-member:update',
      input: suspendSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof suspendSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        const member = await repo.suspend(db, input.userId, service.orgId);
        await deps.hooks?.onSuspend?.(member);
        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // UNSUSPEND MEMBER
    // -------------------------------------------------------------------------
    unsuspend: {
      permission: 'org-member:update',
      input: unsuspendSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof unsuspendSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        const member = await repo.unsuspend(db, input.userId, service.orgId);
        await deps.hooks?.onUnsuspend?.(member);
        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // REMOVE MEMBER
    // -------------------------------------------------------------------------
    remove: {
      permission: 'org-member:remove',
      input: removeSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof removeSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        // Prevent self-removal
        if (input.userId === parseInt(service.userId)) {
          throw new OrgMembershipRouterError('FORBIDDEN', 'Cannot remove yourself from the organization');
        }

        const removedBy = parseInt(service.userId);
        const member = await repo.remove(db, input.userId, service.orgId, removedBy);

        // Deactivate roles
        if (deps.deactivateRolesInOrg) {
          await deps.deactivateRolesInOrg(db, input.userId, service.orgId);
        }

        await deps.hooks?.onRemove?.(member, removedBy);
        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // REINVITE REMOVED MEMBER
    // -------------------------------------------------------------------------
    reinvite: {
      permission: 'org-member:invite',
      input: reinviteSchema,
      invalidates: ['orgMembership', 'users'],
      entityType: 'org_member',
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof reinviteSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipRouterError('BAD_REQUEST', 'Organization context required');
        }

        const invitedBy = parseInt(service.userId);
        const member = await repo.reinvite(
          db,
          input.userId,
          service.orgId,
          invitedBy,
          input.roleId
        );

        await deps.hooks?.onInvite?.(member);
        return { member };
      },
    },
  };
}

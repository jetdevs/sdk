/**
 * Org Membership Router Configuration Factory
 *
 * Creates router config for use with createRouterWithActor.
 * Provides tRPC endpoints for invite, accept, suspend, unsuspend, remove, and list.
 *
 * @module @jetdevs/core/org-membership
 */

import { z } from 'zod';
import type { IOrgMemberRepository } from './repository';
import type { OrgMembershipHooks, OrgMembershipServiceContext } from './service';
import { OrgMembershipServiceError } from './service';
import {
  listMembersSchema,
  inviteByEmailSchema,
  inviteExistingUserSchema,
  acceptSchema,
  memberActionSchema,
  reinviteSchema,
} from './schemas';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dependencies that must be provided by the consuming app
 */
export interface OrgMembershipRouterDeps {
  /**
   * Repository class constructor
   */
  Repository: new (db: any) => IOrgMemberRepository;

  /**
   * Lifecycle hooks for app-specific behavior
   */
  hooks?: OrgMembershipHooks;
}

/**
 * Handler context from createRouterWithActor
 */
interface HandlerContext<TInput = any> {
  input: TInput;
  service: OrgMembershipServiceContext;
  actor: any;
  db: any;
  repo: IOrgMemberRepository;
  ctx: any;
}

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

/**
 * Create org membership router configuration for use with createRouterWithActor.
 *
 * @example
 * ```typescript
 * import { createOrgMembershipRouterConfig } from '@jetdevs/core/org-membership';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 * import { OrgMemberRepository } from './repositories';
 *
 * const orgMembershipConfig = createOrgMembershipRouterConfig({
 *   Repository: OrgMemberRepository,
 *   hooks: {
 *     onAccept: async ({ member, orgId, pendingRoleId }) => {
 *       // Assign pending role to user_roles
 *     },
 *     onRemove: async ({ member, orgId, userId }) => {
 *       // Deactivate user_roles for this org
 *     },
 *   },
 * });
 *
 * export const orgMembershipRouter = createRouterWithActor(orgMembershipConfig);
 * ```
 */
export function createOrgMembershipRouterConfig(deps: OrgMembershipRouterDeps) {
  const { hooks } = deps;

  return {
    // -------------------------------------------------------------------------
    // LIST MEMBERS (query)
    // -------------------------------------------------------------------------
    list: {
      type: 'query' as const,
      permission: 'org-member:read',
      input: listMembersSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof listMembersSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        const members = await repo.findByOrg(db, {
          orgId: service.orgId,
          status: input.status,
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        });

        const totalCount = await repo.countByOrg(db, {
          orgId: service.orgId,
          status: input.status,
        });

        return {
          members,
          totalCount,
          hasMore: input.offset + input.limit < totalCount,
        };
      },
    },

    // -------------------------------------------------------------------------
    // INVITE BY EMAIL (mutation)
    // -------------------------------------------------------------------------
    inviteByEmail: {
      type: 'mutation' as const,
      permission: 'org-member:invite',
      input: inviteByEmailSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof inviteByEmailSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        if (!hooks?.findOrCreateUserByEmail) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'findOrCreateUserByEmail hook is required for inviteByEmail');
        }

        const { id: userId } = await hooks.findOrCreateUserByEmail({
          email: input.email,
          db,
        });

        const actorId = parseInt(service.userId, 10);

        const member = await repo.invite(db, {
          userId,
          orgId: service.orgId,
          invitedBy: actorId,
          pendingRoleId: input.roleId,
        });

        if (hooks?.onInvite) {
          await hooks.onInvite({
            member,
            orgId: service.orgId,
            invitedBy: actorId,
          });
        }

        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // INVITE EXISTING USER (mutation)
    // -------------------------------------------------------------------------
    inviteExistingUser: {
      type: 'mutation' as const,
      permission: 'org-member:invite',
      input: inviteExistingUserSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof inviteExistingUserSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        const actorId = parseInt(service.userId, 10);

        const member = await repo.invite(db, {
          userId: input.userId,
          orgId: service.orgId,
          invitedBy: actorId,
          pendingRoleId: input.roleId,
        });

        if (hooks?.onInvite) {
          await hooks.onInvite({
            member,
            orgId: service.orgId,
            invitedBy: actorId,
          });
        }

        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // ACCEPT INVITATION (mutation, self-service)
    // -------------------------------------------------------------------------
    accept: {
      type: 'mutation' as const,
      // No permission required - self-service for authenticated users
      input: acceptSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof acceptSchema>>) => {
        const actorId = parseInt(service.userId, 10);

        // Validate the authenticated user is the invited user
        const existing = await repo.findByUserAndOrg(db, actorId, input.orgId);
        if (!existing) {
          throw new OrgMembershipServiceError('NOT_FOUND', 'No invitation found for this organization');
        }
        if (existing.userId !== actorId) {
          throw new OrgMembershipServiceError('FORBIDDEN', 'You can only accept your own invitations');
        }

        const member = await repo.accept(db, actorId, input.orgId);

        if (hooks?.onAccept) {
          await hooks.onAccept({
            member,
            orgId: input.orgId,
            userId: actorId,
            pendingRoleId: existing.pendingRoleId,
          });
        }

        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // SUSPEND MEMBER (mutation)
    // -------------------------------------------------------------------------
    suspend: {
      type: 'mutation' as const,
      permission: 'org-member:update',
      input: memberActionSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof memberActionSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        const member = await repo.suspend(db, input.userId, service.orgId);

        if (hooks?.onSuspend) {
          await hooks.onSuspend({
            member,
            orgId: service.orgId,
            userId: input.userId,
          });
        }

        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // UNSUSPEND MEMBER (mutation)
    // -------------------------------------------------------------------------
    unsuspend: {
      type: 'mutation' as const,
      permission: 'org-member:update',
      input: memberActionSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof memberActionSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        const member = await repo.unsuspend(db, input.userId, service.orgId);

        if (hooks?.onUnsuspend) {
          await hooks.onUnsuspend({
            member,
            orgId: service.orgId,
            userId: input.userId,
          });
        }

        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // REMOVE MEMBER (mutation)
    // -------------------------------------------------------------------------
    remove: {
      type: 'mutation' as const,
      permission: 'org-member:remove',
      input: memberActionSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof memberActionSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        const actorId = parseInt(service.userId, 10);

        const member = await repo.remove(db, input.userId, service.orgId, actorId);

        // Hook to deactivate user_roles for this org
        if (hooks?.onRemove) {
          await hooks.onRemove({
            member,
            orgId: service.orgId,
            userId: input.userId,
            removedBy: actorId,
          });
        }

        return { member };
      },
    },

    // -------------------------------------------------------------------------
    // REINVITE MEMBER (mutation)
    // -------------------------------------------------------------------------
    reinvite: {
      type: 'mutation' as const,
      permission: 'org-member:invite',
      input: reinviteSchema,
      repository: deps.Repository,
      handler: async ({ input, service, repo, db }: HandlerContext<z.infer<typeof reinviteSchema>>) => {
        if (!service.orgId) {
          throw new OrgMembershipServiceError('BAD_REQUEST', 'Organization context is required');
        }

        const actorId = parseInt(service.userId, 10);

        const member = await repo.reinvite(db, input.userId, service.orgId, actorId, input.roleId);

        if (hooks?.onInvite) {
          await hooks.onInvite({
            member,
            orgId: service.orgId,
            invitedBy: actorId,
          });
        }

        return { member };
      },
    },
  };
}

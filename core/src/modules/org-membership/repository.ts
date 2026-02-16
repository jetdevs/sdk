/**
 * Org Member Repository Factory
 *
 * Creates a repository class for org membership operations.
 * Follows the SDK repository factory pattern with schema injection.
 *
 * @module @jetdevs/core/org-membership
 */

import {
  and,
  count,
  eq,
  inArray,
  or,
  like,
  type SQL,
} from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  OrgMemberStatus,
  OrgMemberWithUser,
  InviteInput,
  ListMembersInput,
  CountMembersInput,
} from './types';
import { VALID_STATUS_TRANSITIONS } from './types';

// =============================================================================
// SCHEMA INTERFACE
// =============================================================================

/**
 * Schema dependencies required by the org member repository
 */
export interface OrgMemberRepositorySchema {
  orgMembers: PgTable & {
    id: any;
    uuid: any;
    userId: any;
    orgId: any;
    status: any;
    invitedBy: any;
    invitedAt: any;
    joinedAt: any;
    pendingRoleId: any;
    removedAt: any;
    removedBy: any;
    createdAt: any;
    updatedAt: any;
  };
  users: PgTable & {
    id: any;
    uuid: any;
    name: any;
    firstName: any;
    lastName: any;
    email: any;
    avatar: any;
    isActive: any;
  };
  roles: PgTable & {
    id: any;
    name: any;
  };
}

// =============================================================================
// REPOSITORY INTERFACE
// =============================================================================

export interface IOrgMemberRepository {
  // Query methods
  findByOrg(db: any, input: ListMembersInput): Promise<OrgMemberWithUser[]>;
  findByUserAndOrg(db: any, userId: number, orgId: number): Promise<OrgMemberWithUser | null>;
  countByOrg(db: any, input: CountMembersInput): Promise<number>;
  isActiveMember(db: any, userId: number, orgId: number): Promise<boolean>;

  // Mutation methods
  invite(db: any, data: InviteInput): Promise<OrgMemberWithUser>;
  accept(db: any, userId: number, orgId: number): Promise<OrgMemberWithUser>;
  suspend(db: any, userId: number, orgId: number): Promise<OrgMemberWithUser>;
  unsuspend(db: any, userId: number, orgId: number): Promise<OrgMemberWithUser>;
  remove(db: any, userId: number, orgId: number, removedBy: number): Promise<OrgMemberWithUser>;
  reinvite(db: any, userId: number, orgId: number, invitedBy: number, pendingRoleId?: number): Promise<OrgMemberWithUser>;
}

// =============================================================================
// ERROR CLASS
// =============================================================================

export class OrgMemberRepositoryError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_TRANSITION' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'OrgMemberRepositoryError';
  }
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Create an OrgMember Repository class with injected schema dependencies.
 *
 * @example
 * ```typescript
 * import { createOrgMemberRepositoryClass } from '@jetdevs/core/org-membership';
 * import { orgMembers, users, roles } from '@/db/schema';
 *
 * const OrgMemberRepository = createOrgMemberRepositoryClass({
 *   orgMembers, users, roles
 * });
 * ```
 */
export function createOrgMemberRepositoryClass(schema: OrgMemberRepositorySchema) {
  const { orgMembers, users, roles } = schema;

  return class OrgMemberRepository implements IOrgMemberRepository {

    // -------------------------------------------------------------------------
    // QUERY METHODS
    // -------------------------------------------------------------------------

    /**
     * Find org members with optional filters and pagination
     */
    async findByOrg(db: PostgresJsDatabase<any>, input: ListMembersInput): Promise<OrgMemberWithUser[]> {
      const { orgId, status, search, limit = 20, offset = 0 } = input;

      const whereConditions: SQL<unknown>[] = [
        eq(orgMembers.orgId, orgId),
      ];

      if (status && status.length > 0) {
        whereConditions.push(inArray(orgMembers.status, status));
      }

      if (search) {
        const searchCondition = or(
          like(users.name, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        );
        if (searchCondition) whereConditions.push(searchCondition);
      }

      const result = await db
        .select({
          id: orgMembers.id,
          uuid: orgMembers.uuid,
          userId: orgMembers.userId,
          orgId: orgMembers.orgId,
          status: orgMembers.status,
          invitedBy: orgMembers.invitedBy,
          invitedAt: orgMembers.invitedAt,
          joinedAt: orgMembers.joinedAt,
          pendingRoleId: orgMembers.pendingRoleId,
          removedAt: orgMembers.removedAt,
          removedBy: orgMembers.removedBy,
          createdAt: orgMembers.createdAt,
          updatedAt: orgMembers.updatedAt,
          userName: users.name,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
          userAvatar: users.avatar,
          userUuid: users.uuid,
          userIsActive: users.isActive,
          roleName: roles.name,
        })
        .from(orgMembers)
        .innerJoin(users, eq(orgMembers.userId, users.id))
        .leftJoin(roles, eq(orgMembers.pendingRoleId, roles.id))
        .where(and(...whereConditions))
        .limit(limit)
        .offset(offset);

      return result.map((r: any) => ({
        id: r.id,
        uuid: r.uuid,
        userId: r.userId,
        orgId: r.orgId,
        status: r.status as OrgMemberStatus,
        invitedBy: r.invitedBy,
        invitedAt: r.invitedAt,
        joinedAt: r.joinedAt,
        pendingRoleId: r.pendingRoleId,
        removedAt: r.removedAt,
        removedBy: r.removedBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: {
          id: r.userId,
          uuid: r.userUuid,
          name: r.userName,
          firstName: r.userFirstName,
          lastName: r.userLastName,
          email: r.userEmail,
          avatar: r.userAvatar,
          isActive: r.userIsActive,
        },
        pendingRole: r.pendingRoleId ? { id: r.pendingRoleId, name: r.roleName } : null,
      }));
    }

    /**
     * Find a specific membership by user + org
     */
    async findByUserAndOrg(db: PostgresJsDatabase<any>, userId: number, orgId: number): Promise<OrgMemberWithUser | null> {
      const result = await db
        .select()
        .from(orgMembers)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
        ))
        .limit(1);

      if (!result[0]) return null;

      return result[0] as unknown as OrgMemberWithUser;
    }

    /**
     * Count org members matching filters
     */
    async countByOrg(db: PostgresJsDatabase<any>, input: CountMembersInput): Promise<number> {
      const { orgId, status } = input;

      const whereConditions: SQL<unknown>[] = [
        eq(orgMembers.orgId, orgId),
      ];

      if (status && status.length > 0) {
        whereConditions.push(inArray(orgMembers.status, status));
      }

      const result = await db
        .select({ count: count() })
        .from(orgMembers)
        .where(and(...whereConditions));

      return (result[0]?.count as number) || 0;
    }

    /**
     * Check if a user is an active member of an org
     */
    async isActiveMember(db: PostgresJsDatabase<any>, userId: number, orgId: number): Promise<boolean> {
      const result = await db
        .select({ id: orgMembers.id })
        .from(orgMembers)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
          inArray(orgMembers.status, ['active', 'suspended']),
        ))
        .limit(1);

      return result.length > 0;
    }

    // -------------------------------------------------------------------------
    // MUTATION METHODS
    // -------------------------------------------------------------------------

    /**
     * Invite a user to an org. Handles both new and existing (removed) memberships via upsert.
     */
    async invite(db: PostgresJsDatabase<any>, data: InviteInput): Promise<OrgMemberWithUser> {
      const { userId, orgId, invitedBy, pendingRoleId } = data;

      // Check for existing membership
      const existing = await this.findByUserAndOrg(db, userId, orgId);

      if (existing) {
        if (existing.status === 'removed') {
          // Re-invite: update existing removed row
          return this.reinvite(db, userId, orgId, invitedBy, pendingRoleId);
        }
        if (existing.status === 'invited') {
          throw new OrgMemberRepositoryError('CONFLICT', 'User already has a pending invitation to this organization');
        }
        if (existing.status === 'active' || existing.status === 'suspended') {
          throw new OrgMemberRepositoryError('CONFLICT', 'User is already a member of this organization');
        }
      }

      // New invitation
      const now = new Date();
      const result = await db
        .insert(orgMembers)
        .values({
          userId,
          orgId,
          status: 'invited',
          invitedBy,
          invitedAt: now,
          pendingRoleId: pendingRoleId ?? null,
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning();

      return result[0] as unknown as OrgMemberWithUser;
    }

    /**
     * Accept an invitation. Transitions from 'invited' to 'active'.
     */
    async accept(db: PostgresJsDatabase<any>, userId: number, orgId: number): Promise<OrgMemberWithUser> {
      const member = await this.findByUserAndOrg(db, userId, orgId);
      if (!member) {
        throw new OrgMemberRepositoryError('NOT_FOUND', 'No membership found for this user in this organization');
      }

      this.validateTransition(member.status as OrgMemberStatus, 'active');

      const now = new Date();
      const result = await db
        .update(orgMembers)
        .set({
          status: 'active',
          joinedAt: now,
          updatedAt: now,
        } as any)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
        ))
        .returning();

      return result[0] as unknown as OrgMemberWithUser;
    }

    /**
     * Suspend a member. Transitions from 'active' to 'suspended'.
     */
    async suspend(db: PostgresJsDatabase<any>, userId: number, orgId: number): Promise<OrgMemberWithUser> {
      const member = await this.findByUserAndOrg(db, userId, orgId);
      if (!member) {
        throw new OrgMemberRepositoryError('NOT_FOUND', 'No membership found for this user in this organization');
      }

      this.validateTransition(member.status as OrgMemberStatus, 'suspended');

      const result = await db
        .update(orgMembers)
        .set({
          status: 'suspended',
          updatedAt: new Date(),
        } as any)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
        ))
        .returning();

      return result[0] as unknown as OrgMemberWithUser;
    }

    /**
     * Unsuspend a member. Transitions from 'suspended' to 'active'.
     */
    async unsuspend(db: PostgresJsDatabase<any>, userId: number, orgId: number): Promise<OrgMemberWithUser> {
      const member = await this.findByUserAndOrg(db, userId, orgId);
      if (!member) {
        throw new OrgMemberRepositoryError('NOT_FOUND', 'No membership found for this user in this organization');
      }

      this.validateTransition(member.status as OrgMemberStatus, 'active');

      const result = await db
        .update(orgMembers)
        .set({
          status: 'active',
          updatedAt: new Date(),
        } as any)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
        ))
        .returning();

      return result[0] as unknown as OrgMemberWithUser;
    }

    /**
     * Remove a member. Transitions from 'active' or 'suspended' to 'removed'.
     */
    async remove(db: PostgresJsDatabase<any>, userId: number, orgId: number, removedBy: number): Promise<OrgMemberWithUser> {
      const member = await this.findByUserAndOrg(db, userId, orgId);
      if (!member) {
        throw new OrgMemberRepositoryError('NOT_FOUND', 'No membership found for this user in this organization');
      }

      this.validateTransition(member.status as OrgMemberStatus, 'removed');

      const now = new Date();
      const result = await db
        .update(orgMembers)
        .set({
          status: 'removed',
          removedAt: now,
          removedBy,
          updatedAt: now,
        } as any)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
        ))
        .returning();

      return result[0] as unknown as OrgMemberWithUser;
    }

    /**
     * Re-invite a previously removed member. Transitions from 'removed' to 'invited'.
     */
    async reinvite(db: PostgresJsDatabase<any>, userId: number, orgId: number, invitedBy: number, pendingRoleId?: number): Promise<OrgMemberWithUser> {
      const member = await this.findByUserAndOrg(db, userId, orgId);
      if (!member) {
        throw new OrgMemberRepositoryError('NOT_FOUND', 'No membership found for this user in this organization');
      }

      this.validateTransition(member.status as OrgMemberStatus, 'invited');

      const now = new Date();
      const result = await db
        .update(orgMembers)
        .set({
          status: 'invited',
          invitedBy,
          invitedAt: now,
          pendingRoleId: pendingRoleId ?? null,
          removedAt: null,
          removedBy: null,
          joinedAt: null,
          updatedAt: now,
        } as any)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
        ))
        .returning();

      return result[0] as unknown as OrgMemberWithUser;
    }

    // -------------------------------------------------------------------------
    // PRIVATE HELPERS
    // -------------------------------------------------------------------------

    /**
     * Validate a status transition against the state machine
     * @internal
     */
    validateTransition(currentStatus: OrgMemberStatus, targetStatus: OrgMemberStatus): void {
      const validTargets = VALID_STATUS_TRANSITIONS[currentStatus];
      if (!validTargets || !validTargets.includes(targetStatus)) {
        throw new OrgMemberRepositoryError(
          'INVALID_TRANSITION',
          `Cannot transition from '${currentStatus}' to '${targetStatus}'. Valid transitions: ${validTargets?.join(', ') || 'none'}`
        );
      }
    }
  };
}

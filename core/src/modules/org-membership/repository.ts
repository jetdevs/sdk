/**
 * Org Member Repository Factory
 *
 * Creates an org member repository with injected schema dependencies.
 * Follows the SDK repository factory pattern.
 *
 * @module @jetdevs/core/org-membership
 */

import {
  and,
  count,
  eq,
  inArray,
  like,
  or,
  type SQL,
} from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { OrgMemberRecord, OrgMemberWithUser, OrgMemberStatus } from './types';

// =============================================================================
// SCHEMA INTERFACE
// =============================================================================

export interface OrgMemberRepositorySchema {
  orgMembers: PgTable & {
    id: any;
    uuid: any;
    userId: any;
    orgId: any;
    status: any;
    pendingRoleId: any;
    invitedBy: any;
    invitedAt: any;
    joinedAt: any;
    removedAt: any;
    removedBy: any;
    createdAt: any;
    updatedAt: any;
  };
  users: PgTable & {
    id: any;
    uuid: any;
    name: any;
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
  // Query
  findByOrg(
    db: any,
    orgId: number,
    options?: { status?: OrgMemberStatus[]; search?: string; limit?: number; offset?: number }
  ): Promise<OrgMemberWithUser[]>;
  findByUserAndOrg(db: any, userId: number, orgId: number): Promise<OrgMemberRecord | null>;
  countByOrg(db: any, orgId: number, options?: { status?: OrgMemberStatus[]; search?: string }): Promise<number>;
  isActiveMember(db: any, userId: number, orgId: number): Promise<boolean>;

  // Mutations
  invite(
    db: any,
    data: { userId: number; orgId: number; invitedBy: number; pendingRoleId?: number }
  ): Promise<OrgMemberRecord>;
  accept(db: any, userId: number, orgId: number): Promise<OrgMemberRecord>;
  suspend(db: any, userId: number, orgId: number): Promise<OrgMemberRecord>;
  unsuspend(db: any, userId: number, orgId: number): Promise<OrgMemberRecord>;
  remove(db: any, userId: number, orgId: number, removedBy: number): Promise<OrgMemberRecord>;
  reinvite(
    db: any,
    userId: number,
    orgId: number,
    invitedBy: number,
    pendingRoleId?: number
  ): Promise<OrgMemberRecord>;
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Create an OrgMember Repository class with injected schema dependencies.
 */
export function createOrgMemberRepositoryClass(schema: OrgMemberRepositorySchema) {
  const { orgMembers, users, roles } = schema;

  return class OrgMemberRepository implements IOrgMemberRepository {
    // -------------------------------------------------------------------------
    // QUERY OPERATIONS
    // -------------------------------------------------------------------------

    async findByOrg(
      db: PostgresJsDatabase<any>,
      orgId: number,
      options?: { status?: OrgMemberStatus[]; search?: string; limit?: number; offset?: number }
    ): Promise<OrgMemberWithUser[]> {
      const whereConditions: SQL<unknown>[] = [eq(orgMembers.orgId, orgId)];

      if (options?.status && options.status.length > 0) {
        whereConditions.push(inArray(orgMembers.status, options.status));
      }

      if (options?.search) {
        const searchCondition = or(
          like(users.name, `%${options.search}%`),
          like(users.email, `%${options.search}%`)
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
          pendingRoleId: orgMembers.pendingRoleId,
          invitedBy: orgMembers.invitedBy,
          invitedAt: orgMembers.invitedAt,
          joinedAt: orgMembers.joinedAt,
          removedAt: orgMembers.removedAt,
          removedBy: orgMembers.removedBy,
          createdAt: orgMembers.createdAt,
          updatedAt: orgMembers.updatedAt,
          userName: users.name,
          userUuid: users.uuid,
          userEmail: users.email,
          userAvatar: users.avatar,
          userIsActive: users.isActive,
          roleName: roles.name,
        })
        .from(orgMembers)
        .innerJoin(users, eq(orgMembers.userId, users.id))
        .leftJoin(roles, eq(orgMembers.pendingRoleId, roles.id))
        .where(and(...whereConditions))
        .limit(options?.limit ?? 20)
        .offset(options?.offset ?? 0);

      return result.map((r: any) => ({
        id: r.id,
        uuid: r.uuid,
        userId: r.userId,
        orgId: r.orgId,
        status: r.status,
        pendingRoleId: r.pendingRoleId,
        invitedBy: r.invitedBy,
        invitedAt: r.invitedAt,
        joinedAt: r.joinedAt,
        removedAt: r.removedAt,
        removedBy: r.removedBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: {
          id: r.userId,
          uuid: r.userUuid,
          name: r.userName,
          email: r.userEmail,
          avatar: r.userAvatar,
          isActive: r.userIsActive,
        },
        pendingRole: r.pendingRoleId
          ? { id: r.pendingRoleId, name: r.roleName }
          : null,
      }));
    }

    async findByUserAndOrg(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord | null> {
      const result = await db
        .select()
        .from(orgMembers)
        .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
        .limit(1);

      return (result[0] as unknown as OrgMemberRecord) || null;
    }

    async countByOrg(
      db: PostgresJsDatabase<any>,
      orgId: number,
      options?: { status?: OrgMemberStatus[]; search?: string }
    ): Promise<number> {
      const whereConditions: SQL<unknown>[] = [eq(orgMembers.orgId, orgId)];

      if (options?.status && options.status.length > 0) {
        whereConditions.push(inArray(orgMembers.status, options.status));
      }

      if (options?.search) {
        const searchCondition = or(
          like(users.name, `%${options.search}%`),
          like(users.email, `%${options.search}%`)
        );
        if (searchCondition) whereConditions.push(searchCondition);
      }

      // If search is specified, we need to JOIN users
      if (options?.search) {
        const result = await db
          .select({ count: count() })
          .from(orgMembers)
          .innerJoin(users, eq(orgMembers.userId, users.id))
          .where(and(...whereConditions));
        return (result[0]?.count as number) || 0;
      }

      const result = await db
        .select({ count: count() })
        .from(orgMembers)
        .where(and(...whereConditions));

      return (result[0]?.count as number) || 0;
    }

    async isActiveMember(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number
    ): Promise<boolean> {
      const result = await db
        .select({ id: orgMembers.id })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.userId, userId),
            eq(orgMembers.orgId, orgId),
            inArray(orgMembers.status, ['active', 'suspended'])
          )
        )
        .limit(1);

      return result.length > 0;
    }

    // -------------------------------------------------------------------------
    // MUTATION OPERATIONS
    // -------------------------------------------------------------------------

    async invite(
      db: PostgresJsDatabase<any>,
      data: { userId: number; orgId: number; invitedBy: number; pendingRoleId?: number }
    ): Promise<OrgMemberRecord> {
      // Check for existing membership
      const existing = await this.findByUserAndOrg(db, data.userId, data.orgId);

      if (existing) {
        if (existing.status === 'removed') {
          // Re-invite: update existing row
          return this.reinvite(db, data.userId, data.orgId, data.invitedBy, data.pendingRoleId);
        }
        if (existing.status === 'invited') {
          // Already invited, update pending role if changed
          if (data.pendingRoleId) {
            const result = await db
              .update(orgMembers)
              .set({
                pendingRoleId: data.pendingRoleId,
                invitedBy: data.invitedBy,
                updatedAt: new Date(),
              } as any)
              .where(eq(orgMembers.id, existing.id))
              .returning();
            return result[0] as unknown as OrgMemberRecord;
          }
          return existing;
        }
        throw new Error(
          `User ${data.userId} already has membership in org ${data.orgId} with status '${existing.status}'`
        );
      }

      const result = await db
        .insert(orgMembers)
        .values({
          userId: data.userId,
          orgId: data.orgId,
          status: 'invited',
          pendingRoleId: data.pendingRoleId ?? null,
          invitedBy: data.invitedBy,
          invitedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();

      return result[0] as unknown as OrgMemberRecord;
    }

    async accept(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord> {
      const existing = await this.findByUserAndOrg(db, userId, orgId);
      if (!existing) {
        throw new Error(`No membership found for user ${userId} in org ${orgId}`);
      }
      if (existing.status !== 'invited') {
        throw new Error(
          `Cannot accept membership with status '${existing.status}'. Only 'invited' memberships can be accepted.`
        );
      }

      const result = await db
        .update(orgMembers)
        .set({
          status: 'active',
          joinedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(orgMembers.id, existing.id))
        .returning();

      return result[0] as unknown as OrgMemberRecord;
    }

    async suspend(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord> {
      const existing = await this.findByUserAndOrg(db, userId, orgId);
      if (!existing) {
        throw new Error(`No membership found for user ${userId} in org ${orgId}`);
      }
      if (existing.status !== 'active') {
        throw new Error(
          `Cannot suspend membership with status '${existing.status}'. Only 'active' memberships can be suspended.`
        );
      }

      const result = await db
        .update(orgMembers)
        .set({
          status: 'suspended',
          updatedAt: new Date(),
        } as any)
        .where(eq(orgMembers.id, existing.id))
        .returning();

      return result[0] as unknown as OrgMemberRecord;
    }

    async unsuspend(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number
    ): Promise<OrgMemberRecord> {
      const existing = await this.findByUserAndOrg(db, userId, orgId);
      if (!existing) {
        throw new Error(`No membership found for user ${userId} in org ${orgId}`);
      }
      if (existing.status !== 'suspended') {
        throw new Error(
          `Cannot unsuspend membership with status '${existing.status}'. Only 'suspended' memberships can be unsuspended.`
        );
      }

      const result = await db
        .update(orgMembers)
        .set({
          status: 'active',
          updatedAt: new Date(),
        } as any)
        .where(eq(orgMembers.id, existing.id))
        .returning();

      return result[0] as unknown as OrgMemberRecord;
    }

    async remove(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number,
      removedBy: number
    ): Promise<OrgMemberRecord> {
      const existing = await this.findByUserAndOrg(db, userId, orgId);
      if (!existing) {
        throw new Error(`No membership found for user ${userId} in org ${orgId}`);
      }
      if (existing.status === 'removed') {
        throw new Error(`User ${userId} is already removed from org ${orgId}`);
      }
      if (existing.status === 'invited') {
        // For invited users, just remove directly
      }

      const result = await db
        .update(orgMembers)
        .set({
          status: 'removed',
          removedAt: new Date(),
          removedBy: removedBy,
          updatedAt: new Date(),
        } as any)
        .where(eq(orgMembers.id, existing.id))
        .returning();

      return result[0] as unknown as OrgMemberRecord;
    }

    async reinvite(
      db: PostgresJsDatabase<any>,
      userId: number,
      orgId: number,
      invitedBy: number,
      pendingRoleId?: number
    ): Promise<OrgMemberRecord> {
      const existing = await this.findByUserAndOrg(db, userId, orgId);
      if (!existing) {
        throw new Error(`No membership found for user ${userId} in org ${orgId}`);
      }
      if (existing.status !== 'removed') {
        throw new Error(
          `Cannot reinvite membership with status '${existing.status}'. Only 'removed' memberships can be reinvited.`
        );
      }

      const result = await db
        .update(orgMembers)
        .set({
          status: 'invited',
          pendingRoleId: pendingRoleId ?? null,
          invitedBy: invitedBy,
          invitedAt: new Date(),
          removedAt: null,
          removedBy: null,
          joinedAt: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(orgMembers.id, existing.id))
        .returning();

      return result[0] as unknown as OrgMemberRecord;
    }
  };
}

/**
 * Organization Repository Factory
 *
 * Creates an organization repository class with injected schema dependencies.
 * This factory pattern allows apps to inject their own schema while
 * reusing the repository logic from core.
 *
 * @module @yobolabs/core/organizations
 */

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  count,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgTable } from 'drizzle-orm/pg-core';

import type {
  OrgRecord,
  OrgWithStats,
  OrgStats,
  OrgFilters,
  OrgListOptions,
  OrgListResult,
  OrgCreateData,
  OrgUpdateData,
  OrgSetting,
  OrgSettingUpdate,
  AuditLogFilters,
  AuditLogOptions,
  AuditLogListResult,
  OrgAuditLogRecord,
  OrgAnalytics,
  OrgUser,
} from './types';

// =============================================================================
// SCHEMA INTERFACE
// =============================================================================

/**
 * Schema dependencies required by the organization repository
 */
export interface OrgRepositorySchema {
  orgs: PgTable & {
    id: any;
    uuid: any;
    name: any;
    description: any;
    slug: any;
    logoUrl: any;
    website: any;
    businessAddress: any;
    merchantId: any;
    businessCategory: any;
    defaultCategoryTreeId: any;
    currency: any;
    currencySymbol: any;
    currencyLocale: any;
    copilotEnabled: any;
    isActive: any;
    createdAt: any;
    updatedAt: any;
  };
  users: PgTable & {
    id: any;
    name: any;
    email: any;
    isActive: any;
  };
  userRoles: PgTable & {
    id: any;
    userId: any;
    roleId: any;
    orgId: any;
    isActive: any;
    createdAt: any;
  };
  roles: PgTable & {
    id: any;
    name: any;
  };
  orgAuditLogs: PgTable & {
    id: any;
    uuid: any;
    orgId: any;
    userId: any;
    userEmail: any;
    userName: any;
    action: any;
    entityType: any;
    entityId: any;
    entityName: any;
    changes: any;
    metadata: any;
    performedAt: any;
    createdAt: any;
  };
  orgSettings: PgTable & {
    id: any;
    uuid: any;
    orgId: any;
    key: any;
    value: any;
    category: any;
    description: any;
    lastModifiedBy: any;
    lastModifiedAt: any;
    isActive: any;
    createdAt: any;
    updatedAt: any;
  };
}

// =============================================================================
// REPOSITORY INTERFACE
// =============================================================================

/**
 * Interface for the Organization Repository
 */
export interface IOrgRepository {
  // CRUD operations
  list(db: any, options: OrgListOptions): Promise<OrgListResult>;
  findById(db: any, id: number | string): Promise<OrgRecord | null>;
  findBySlug(db: any, slug: string): Promise<OrgRecord | null>;
  exists(db: any, field: 'name' | 'slug', value: string, excludeId?: number): Promise<boolean>;
  create(db: any, data: OrgCreateData): Promise<OrgRecord>;
  update(db: any, id: number, data: OrgUpdateData): Promise<OrgRecord | null>;
  softDelete(db: any, id: number): Promise<OrgRecord | null>;
  hardDelete(db: any, id: number): Promise<void>;

  // Stats operations
  getStats(db: any, orgId: number): Promise<OrgStats>;
  getUserCount(db: any, orgId: number): Promise<number>;
  getOrgUsers(db: any, orgId: number): Promise<OrgUser[]>;

  // Settings operations
  getSettings(db: any, orgId: number, category?: string): Promise<OrgSetting[]>;
  getSettingByKey(db: any, orgId: number, key: string): Promise<OrgSetting | null>;
  updateSetting(db: any, orgId: number, setting: OrgSettingUpdate, userId: number): Promise<{ updated: OrgSetting; isNew: boolean }>;

  // Audit log operations
  logAudit(
    db: any,
    orgId: number,
    userId: number | null,
    action: string,
    entityType: string,
    entityId: string | null,
    changes?: any,
    metadata?: any
  ): Promise<void>;
  getAuditLogs(db: any, options: AuditLogOptions): Promise<AuditLogListResult>;
  getRecentAuditLogs(db: any, orgId: number, startDate?: Date, endDate?: Date, limit?: number): Promise<OrgAuditLogRecord[]>;

  // Analytics operations
  getAnalytics(db: any, orgId: number, startDate?: Date, endDate?: Date, compareWithOrgs?: number[]): Promise<OrgAnalytics>;
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Create an Organization Repository class with injected schema dependencies.
 *
 * @example
 * ```typescript
 * import { createOrgRepositoryClass } from '@yobolabs/core/organizations';
 * import { orgs, users, userRoles, roles, orgAuditLogs, orgSettings } from '@/db/schema';
 *
 * const OrgRepositoryBase = createOrgRepositoryClass({
 *   orgs, users, userRoles, roles, orgAuditLogs, orgSettings
 * });
 *
 * // Extend with app-specific methods if needed
 * export class OrgRepository extends OrgRepositoryBase {
 *   async getWithWorkspaces(db: any, id: number) {
 *     // App-specific implementation
 *   }
 * }
 * ```
 */
export function createOrgRepositoryClass(schema: OrgRepositorySchema) {
  const { orgs, users, userRoles, roles, orgAuditLogs, orgSettings } = schema;

  return class OrgRepository implements IOrgRepository {
    // Expose schema for use in router handlers that need direct table access
    static __schema__ = schema;
    // -------------------------------------------------------------------------
    // ORGANIZATION CRUD OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * List organizations with pagination and filtering
     */
    async list(db: PostgresJsDatabase<any>, options: OrgListOptions): Promise<OrgListResult> {
      const { page, pageSize, sortBy, sortOrder, filters, includeStats } = options;
      const offset = (page - 1) * pageSize;

      // Build where conditions
      const conditions: SQL<unknown>[] = [];

      if (filters.search) {
        const searchCondition = or(
          sql`${orgs.name} ILIKE ${`%${filters.search}%`}`,
          sql`${orgs.description} ILIKE ${`%${filters.search}%`}`,
          sql`${orgs.merchantId} ILIKE ${`%${filters.search}%`}`
        );
        if (searchCondition) conditions.push(searchCondition);
      }

      if (filters.isActive !== undefined) {
        conditions.push(eq(orgs.isActive, filters.isActive));
      }

      // Get total count
      const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(orgs);
      const countQueryResult = conditions.length > 0
        ? await countQuery.where(and(...conditions))
        : await countQuery;
      const totalCount = countQueryResult[0]?.count || 0;

      // Build user stats subquery if needed
      const userStatsSubquery = includeStats
        ? db
            .select({
              orgId: userRoles.orgId,
              user_count: sql<number>`COUNT(DISTINCT ${userRoles.userId})::int`.as('user_count'),
              role_count: sql<number>`COUNT(DISTINCT ${userRoles.roleId})::int`.as('role_count'),
              active_user_count: sql<number>`
                COUNT(DISTINCT CASE
                  WHEN ${users.isActive} = true
                  THEN ${userRoles.userId}
                END)::int
              `.as('active_user_count'),
            })
            .from(userRoles)
            .leftJoin(users, eq(userRoles.userId, users.id))
            .groupBy(userRoles.orgId)
            .as('user_stats')
        : null;

      // Base projection
      const baseProjection = {
        id: orgs.id,
        uuid: orgs.uuid,
        name: orgs.name,
        description: orgs.description,
        slug: orgs.slug,
        logoUrl: orgs.logoUrl,
        website: orgs.website,
        businessAddress: orgs.businessAddress,
        merchantId: orgs.merchantId,
        businessCategory: orgs.businessCategory,
        defaultCategoryTreeId: orgs.defaultCategoryTreeId,
        currency: orgs.currency,
        currencySymbol: orgs.currencySymbol,
        currencyLocale: orgs.currencyLocale,
        copilotEnabled: orgs.copilotEnabled,
        isActive: orgs.isActive,
        createdAt: orgs.createdAt,
        updatedAt: orgs.updatedAt,
      } as const;

      const projection = includeStats && userStatsSubquery
        ? {
            ...baseProjection,
            user_count: userStatsSubquery.user_count,
            role_count: userStatsSubquery.role_count,
            active_user_count: userStatsSubquery.active_user_count,
          }
        : baseProjection;

      // Build order by clause
      let orderByClause;
      switch (sortBy) {
        case 'name':
          orderByClause = sortOrder === 'asc' ? asc(orgs.name) : desc(orgs.name);
          break;
        case 'updatedAt':
          orderByClause = sortOrder === 'asc' ? asc(orgs.updatedAt) : desc(orgs.updatedAt);
          break;
        case 'userCount':
          if (includeStats && userStatsSubquery) {
            orderByClause = sortOrder === 'asc'
              ? asc(sql`COALESCE(${userStatsSubquery.user_count}, 0)`)
              : desc(sql`COALESCE(${userStatsSubquery.user_count}, 0)`);
          } else {
            orderByClause = sortOrder === 'asc' ? asc(orgs.createdAt) : desc(orgs.createdAt);
          }
          break;
        case 'createdAt':
        default:
          orderByClause = sortOrder === 'asc' ? asc(orgs.createdAt) : desc(orgs.createdAt);
          break;
      }

      // Execute query - Build in steps to avoid type reassignment issues
      let orgList: any[];

      if (includeStats && userStatsSubquery) {
        const baseQuery = db.select(projection).from(orgs)
          .leftJoin(userStatsSubquery, eq(orgs.id, userStatsSubquery.orgId));

        if (conditions.length > 0) {
          orgList = await baseQuery
            .where(and(...conditions))
            .orderBy(orderByClause)
            .limit(pageSize)
            .offset(offset);
        } else {
          orgList = await baseQuery
            .orderBy(orderByClause)
            .limit(pageSize)
            .offset(offset);
        }
      } else {
        const baseQuery = db.select(projection).from(orgs);

        if (conditions.length > 0) {
          orgList = await baseQuery
            .where(and(...conditions))
            .orderBy(orderByClause)
            .limit(pageSize)
            .offset(offset);
        } else {
          orgList = await baseQuery
            .orderBy(orderByClause)
            .limit(pageSize)
            .offset(offset);
        }
      }

      return {
        organizations: orgList.map((row: any) => ({
          id: row.id,
          uuid: row.uuid,
          name: row.name,
          description: row.description,
          slug: row.slug,
          logoUrl: row.logoUrl,
          website: row.website,
          businessAddress: row.businessAddress,
          merchantId: row.merchantId,
          businessCategory: row.businessCategory,
          defaultCategoryTreeId: row.defaultCategoryTreeId,
          currency: row.currency,
          currencySymbol: row.currencySymbol,
          currencyLocale: row.currencyLocale,
          copilotEnabled: row.copilotEnabled,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          ...(includeStats ? {
            userCount: Number(row.user_count || 0),
            roleCount: Number(row.role_count || 0),
            activeUserCount: Number(row.active_user_count || 0),
          } : {}),
        })),
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      };
    }

    /**
     * Get organization by ID or UUID
     */
    async findById(db: PostgresJsDatabase<any>, id: number | string): Promise<OrgRecord | null> {
      const whereCondition = typeof id === 'string'
        ? eq(orgs.uuid, id)
        : eq(orgs.id, id);

      const result = await db
        .select()
        .from(orgs)
        .where(whereCondition)
        .limit(1);

      return (result[0] as unknown as OrgRecord) || null;
    }

    /**
     * Get organization by slug
     */
    async findBySlug(db: PostgresJsDatabase<any>, slug: string): Promise<OrgRecord | null> {
      const result = await db
        .select()
        .from(orgs)
        .where(eq(orgs.slug, slug))
        .limit(1);

      return (result[0] as unknown as OrgRecord) || null;
    }

    /**
     * Check if organization exists by name or slug
     */
    async exists(db: PostgresJsDatabase<any>, field: 'name' | 'slug', value: string, excludeId?: number): Promise<boolean> {
      const conditions: SQL<unknown>[] = [
        field === 'name' ? eq(orgs.name, value) : eq(orgs.slug, value)
      ];

      if (excludeId !== undefined) {
        conditions.push(sql`${orgs.id} != ${excludeId}`);
      }

      const result = await db
        .select({ id: orgs.id })
        .from(orgs)
        .where(and(...conditions))
        .limit(1);

      return result.length > 0;
    }

    /**
     * Create new organization
     */
    async create(db: PostgresJsDatabase<any>, data: OrgCreateData): Promise<OrgRecord> {
      const result = await db
        .insert(orgs)
        .values({
          ...data,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();

      return result[0] as unknown as OrgRecord;
    }

    /**
     * Update organization
     */
    async update(db: PostgresJsDatabase<any>, id: number, data: OrgUpdateData): Promise<OrgRecord | null> {
      const result = await db
        .update(orgs)
        .set({
          ...data,
          updatedAt: new Date(),
        } as any)
        .where(eq(orgs.id, id))
        .returning();

      return (result[0] as unknown as OrgRecord) || null;
    }

    /**
     * Soft delete organization
     */
    async softDelete(db: PostgresJsDatabase<any>, id: number): Promise<OrgRecord | null> {
      const result = await db
        .update(orgs)
        .set({
          isActive: false,
          updatedAt: new Date(),
        } as any)
        .where(eq(orgs.id, id))
        .returning();

      return (result[0] as unknown as OrgRecord) || null;
    }

    /**
     * Hard delete organization
     */
    async hardDelete(db: PostgresJsDatabase<any>, id: number): Promise<void> {
      await db.delete(orgs).where(eq(orgs.id, id));
    }

    // -------------------------------------------------------------------------
    // STATS OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get organization statistics
     */
    async getStats(db: PostgresJsDatabase<any>, orgId: number): Promise<OrgStats> {
      // Get user statistics
      const [userStats] = await db
        .select({
          totalUsers: sql<number>`COUNT(DISTINCT ${userRoles.userId})::int`,
          activeUsers: sql<number>`
            COUNT(DISTINCT CASE
              WHEN ${users.isActive} = true
              THEN ${userRoles.userId}
            END)::int
          `,
          totalRoles: sql<number>`COUNT(DISTINCT ${userRoles.roleId})::int`,
        })
        .from(userRoles)
        .leftJoin(users, eq(userRoles.userId, users.id))
        .where(eq(userRoles.orgId, orgId));

      // Get role distribution
      const roleDistribution = await db
        .select({
          roleName: roles.name,
          userCount: sql<number>`COUNT(${userRoles.userId})::int`,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.orgId, orgId))
        .groupBy(roles.name)
        .orderBy(desc(sql`COUNT(${userRoles.userId})`));

      return {
        totalUsers: Number(userStats?.totalUsers || 0),
        activeUsers: Number(userStats?.activeUsers || 0),
        totalRoles: Number(userStats?.totalRoles || 0),
        roleDistribution: roleDistribution.map((r: any) => ({
          roleName: r.roleName,
          userCount: Number(r.userCount || 0),
        })),
      };
    }

    /**
     * Get organization user count
     */
    async getUserCount(db: PostgresJsDatabase<any>, orgId: number): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userRoles)
        .where(eq(userRoles.orgId, orgId));

      return Number(result[0]?.count || 0);
    }

    /**
     * Get all users in an organization with their roles
     */
    async getOrgUsers(db: PostgresJsDatabase<any>, orgId: number): Promise<OrgUser[]> {
      const result = await db
        .select({
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
          userIsActive: users.isActive,
          relationshipIsActive: userRoles.isActive,
          orgRole: roles.name,
          roleId: roles.id,
        })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(
          eq(userRoles.orgId, orgId),
          eq(userRoles.isActive, true)
        ))
        .orderBy(asc(users.name));

      return result as unknown as OrgUser[];
    }

    // -------------------------------------------------------------------------
    // SETTINGS OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get organization settings
     */
    async getSettings(db: PostgresJsDatabase<any>, orgId: number, category?: string): Promise<OrgSetting[]> {
      const conditions: SQL<unknown>[] = [
        eq(orgSettings.orgId, orgId),
        eq(orgSettings.isActive, true),
      ];

      if (category) {
        conditions.push(eq(orgSettings.category, category));
      }

      const settings = await db
        .select()
        .from(orgSettings)
        .where(and(...conditions))
        .orderBy(asc(orgSettings.category), asc(orgSettings.key));

      return settings as unknown as OrgSetting[];
    }

    /**
     * Get organization setting by key
     */
    async getSettingByKey(db: PostgresJsDatabase<any>, orgId: number, key: string): Promise<OrgSetting | null> {
      const result = await db
        .select()
        .from(orgSettings)
        .where(and(
          eq(orgSettings.orgId, orgId),
          eq(orgSettings.key, key)
        ))
        .limit(1);

      return (result[0] as unknown as OrgSetting) || null;
    }

    /**
     * Update organization setting (upsert)
     */
    async updateSetting(
      db: PostgresJsDatabase<any>,
      orgId: number,
      setting: OrgSettingUpdate,
      userId: number
    ): Promise<{ updated: OrgSetting; isNew: boolean }> {
      const existingSetting = await this.getSettingByKey(db, orgId, setting.key);

      if (existingSetting) {
        const [updated] = await db
          .update(orgSettings)
          .set({
            value: setting.value,
            category: setting.category || existingSetting.category,
            description: setting.description || existingSetting.description,
            lastModifiedBy: userId,
            lastModifiedAt: new Date(),
            updatedAt: new Date(),
          } as any)
          .where(and(
            eq(orgSettings.orgId, orgId),
            eq(orgSettings.key, setting.key)
          ))
          .returning();

        return { updated: updated as unknown as OrgSetting, isNew: false };
      } else {
        const [created] = await db
          .insert(orgSettings)
          .values({
            orgId,
            key: setting.key,
            value: setting.value,
            category: setting.category || 'features',
            description: setting.description,
            lastModifiedBy: userId,
            lastModifiedAt: new Date(),
          } as any)
          .returning();

        return { updated: created as unknown as OrgSetting, isNew: true };
      }
    }

    // -------------------------------------------------------------------------
    // AUDIT LOG OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Log audit event
     */
    async logAudit(
      db: PostgresJsDatabase<any>,
      orgId: number,
      userId: number | null,
      action: string,
      entityType: string,
      entityId: string | null,
      changes?: any,
      metadata?: any
    ): Promise<void> {
      try {
        await db.insert(orgAuditLogs).values({
          orgId,
          userId,
          action,
          entityType,
          entityId,
          entityName: entityType === 'organization' ? 'Organization' : entityType,
          changes: changes ? JSON.stringify(changes) : null,
          metadata: metadata ? JSON.stringify(metadata) : null,
          performedAt: new Date(),
        } as any);
      } catch (error) {
        console.error('Failed to log audit event:', error);
        // Don't throw - audit logging failure shouldn't break the operation
      }
    }

    /**
     * Get audit logs with pagination and filtering
     */
    async getAuditLogs(db: PostgresJsDatabase<any>, options: AuditLogOptions): Promise<AuditLogListResult> {
      const { page, pageSize, filters } = options;
      const offset = (page - 1) * pageSize;

      const conditions: SQL<unknown>[] = [];

      if (filters.orgId) {
        conditions.push(eq(orgAuditLogs.orgId, filters.orgId));
      }

      if (filters.action) {
        conditions.push(eq(orgAuditLogs.action, filters.action));
      }

      if (filters.entityType) {
        conditions.push(eq(orgAuditLogs.entityType, filters.entityType));
      }

      if (filters.userId) {
        conditions.push(eq(orgAuditLogs.userId, filters.userId));
      }

      if (filters.startDate) {
        conditions.push(gte(orgAuditLogs.performedAt, filters.startDate));
      }

      if (filters.endDate) {
        conditions.push(lte(orgAuditLogs.performedAt, filters.endDate));
      }

      // Get total count
      const [{ totalCount }] = await db
        .select({ totalCount: sql<number>`count(*)::int` })
        .from(orgAuditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Get audit logs
      const logs = await db
        .select()
        .from(orgAuditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(orgAuditLogs.performedAt))
        .limit(pageSize)
        .offset(offset);

      return {
        auditLogs: logs as unknown as OrgAuditLogRecord[],
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      };
    }

    /**
     * Get recent audit logs for an organization
     */
    async getRecentAuditLogs(
      db: PostgresJsDatabase<any>,
      orgId: number,
      startDate?: Date,
      endDate?: Date,
      limit: number = 20
    ): Promise<OrgAuditLogRecord[]> {
      const conditions: SQL<unknown>[] = [eq(orgAuditLogs.orgId, orgId)];

      if (startDate) {
        conditions.push(gte(orgAuditLogs.performedAt, startDate));
      }
      if (endDate) {
        conditions.push(lte(orgAuditLogs.performedAt, endDate));
      }

      const logs = await db
        .select()
        .from(orgAuditLogs)
        .where(and(...conditions))
        .orderBy(desc(orgAuditLogs.performedAt))
        .limit(limit);

      return logs as unknown as OrgAuditLogRecord[];
    }

    // -------------------------------------------------------------------------
    // ANALYTICS OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get organization analytics
     */
    async getAnalytics(
      db: PostgresJsDatabase<any>,
      orgId: number,
      startDate?: Date,
      endDate?: Date,
      compareWithOrgs?: number[]
    ): Promise<OrgAnalytics> {
      const org = await this.findById(db, orgId);

      if (!org) {
        throw new Error('Organization not found');
      }

      // Get user growth over time
      const userGrowth = await db
        .select({
          date: sql<string>`DATE(${userRoles.createdAt})`,
          newUsers: sql<number>`COUNT(*)::int`,
          cumulativeUsers: sql<number>`
            SUM(COUNT(*)) OVER (ORDER BY DATE(${userRoles.createdAt}))::int
          `,
        })
        .from(userRoles)
        .where(and(
          eq(userRoles.orgId, orgId),
          startDate ? gte(userRoles.createdAt, startDate) : sql`true`,
          endDate ? lte(userRoles.createdAt, endDate) : sql`true`
        ))
        .groupBy(sql`DATE(${userRoles.createdAt})`)
        .orderBy(sql`DATE(${userRoles.createdAt})`);

      // Get activity metrics
      const [activityMetrics] = await db
        .select({
          totalActions: sql<number>`COUNT(*)::int`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${orgAuditLogs.userId})::int`,
          avgActionsPerUser: sql<number>`
            COALESCE(
              COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT ${orgAuditLogs.userId}), 0),
              0
            )::int
          `,
        })
        .from(orgAuditLogs)
        .where(and(
          eq(orgAuditLogs.orgId, orgId),
          startDate ? gte(orgAuditLogs.performedAt, startDate) : sql`true`,
          endDate ? lte(orgAuditLogs.performedAt, endDate) : sql`true`
        ));

      // Get top actions
      const topActions = await db
        .select({
          action: orgAuditLogs.action,
          actionCount: sql<number>`COUNT(*)::int`,
        })
        .from(orgAuditLogs)
        .where(and(
          eq(orgAuditLogs.orgId, orgId),
          startDate ? gte(orgAuditLogs.performedAt, startDate) : sql`true`,
          endDate ? lte(orgAuditLogs.performedAt, endDate) : sql`true`
        ))
        .groupBy(orgAuditLogs.action)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(10);

      // Get comparison data if requested
      let comparison = undefined;
      if (compareWithOrgs && compareWithOrgs.length > 0) {
        const comparisonData = await db
          .select({
            orgId: orgs.id,
            orgName: orgs.name,
            userCount: sql<number>`COUNT(DISTINCT ${userRoles.userId})::int`,
            roleCount: sql<number>`COUNT(DISTINCT ${userRoles.roleId})::int`,
            isActive: orgs.isActive,
          })
          .from(orgs)
          .leftJoin(userRoles, eq(orgs.id, userRoles.orgId))
          .where(inArray(orgs.id, [...compareWithOrgs, orgId]))
          .groupBy(orgs.id, orgs.name, orgs.isActive);

        comparison = comparisonData.map((comp: any) => ({
          orgId: comp.orgId,
          orgName: comp.orgName,
          userCount: Number(comp.userCount || 0),
          roleCount: Number(comp.roleCount || 0),
          isActive: comp.isActive,
          isTarget: comp.orgId === orgId,
        }));
      }

      return {
        organization: {
          id: org.id,
          name: org.name,
          isActive: org.isActive,
        },
        period: {
          startDate,
          endDate,
        },
        userMetrics: {
          growth: userGrowth.map((g: any) => ({
            date: g.date,
            newUsers: Number(g.newUsers || 0),
            cumulativeUsers: Number(g.cumulativeUsers || 0),
          })),
        },
        activityMetrics: {
          totalActions: Number(activityMetrics?.totalActions || 0),
          uniqueUsers: Number(activityMetrics?.uniqueUsers || 0),
          avgActionsPerUser: Number(activityMetrics?.avgActionsPerUser || 0),
          topActions: topActions.map((a: any) => ({
            action: a.action,
            count: Number(a.actionCount || 0),
          })),
        },
        comparison,
      };
    }
  };
}

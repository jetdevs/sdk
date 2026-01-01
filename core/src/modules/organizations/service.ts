/**
 * Organization Service Factory
 *
 * Creates an organization service class with injected dependencies.
 * This factory pattern allows apps to inject their own implementations
 * for privileged database access and role template copying.
 *
 * @module @jetdevs/core/organizations
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type {
    AuditLogListResult,
    OrgAnalytics,
    OrgAuditLogRecord,
    OrgCreateData,
    OrgDeleteResult,
    OrgListResult,
    OrgRecord,
    OrgSetting,
    OrgSettingUpdate,
    OrgStats,
    OrgUser
} from './types';

import type { IOrgRepository } from './repository';

// =============================================================================
// SERVICE CONTEXT
// =============================================================================

/**
 * Actor context for service operations
 */
export interface OrgActor {
  userId: number;
  orgId?: number | null;
  isSystemUser: boolean;
  email?: string;
  name?: string;
}

/**
 * Service context with database and actor
 */
export interface OrgServiceContext {
  db: PostgresJsDatabase<any>;
  actor: OrgActor;
  orgId?: number | null;
}

// =============================================================================
// SERVICE HOOKS
// =============================================================================

/**
 * Hooks for customizing organization service behavior
 */
export interface OrgServiceHooks {
  /**
   * Called after an organization is created
   */
  onOrgCreated?: (org: OrgRecord, ctx: OrgServiceContext) => Promise<void>;

  /**
   * Called before an organization is deleted
   */
  onOrgDeleted?: (orgId: number, ctx: OrgServiceContext) => Promise<void>;

  /**
   * @deprecated Roles are now global (orgId = null, isGlobalRole = true).
   * Org-specific role templates are no longer needed. This hook is kept
   * for backward compatibility but will be ignored.
   */
  copyRoleTemplates?: (orgId: number) => Promise<void>;

  /**
   * Generates a unique slug from an organization name
   */
  generateSlug?: (name: string, db: PostgresJsDatabase<any>) => Promise<string>;

  /**
   * Creates a privileged database connection for cross-org operations
   */
  withPrivilegedDb?: <T>(fn: (db: PostgresJsDatabase<any>) => Promise<T>) => Promise<T>;
}

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * Interface for the Organization Service
 */
export interface IOrgService {
  // List & Read operations
  list(params: OrgListParams, ctx: OrgServiceContext): Promise<OrgListResult>;
  getById(params: OrgGetByIdParams, ctx: OrgServiceContext): Promise<OrgWithDetails | null>;
  getCurrent(ctx: OrgServiceContext): Promise<OrgRecord | null>;
  getAllWithStats(params: OrgGetAllWithStatsParams, ctx: OrgServiceContext): Promise<OrgListResult>;
  count(ctx: OrgServiceContext): Promise<number>;

  // CRUD operations
  create(params: OrgCreateData, ctx: OrgServiceContext): Promise<OrgRecord>;
  update(params: OrgUpdateParams, ctx: OrgServiceContext): Promise<OrgRecord | null>;
  updateCurrent(params: OrgUpdateCurrentParams, ctx: OrgServiceContext): Promise<OrgRecord | null>;
  delete(params: OrgDeleteParams, ctx: OrgServiceContext): Promise<OrgDeleteResult>;

  // Settings operations
  getSettings(params: OrgGetSettingsParams, ctx: OrgServiceContext): Promise<OrgSetting[]>;
  updateSettings(params: OrgUpdateSettingsParams, ctx: OrgServiceContext): Promise<{ updated: number; settings: OrgSetting[] }>;

  // Copilot operations
  getCopilotStatus(ctx: OrgServiceContext): Promise<{ copilotEnabled: boolean }>;
  updateCopilotStatus(orgId: number, copilotEnabled: boolean, ctx: OrgServiceContext): Promise<{ success: boolean; copilotEnabled: boolean }>;

  // Analytics & Audit
  getAnalytics(params: OrgAnalyticsParams, ctx: OrgServiceContext): Promise<OrgAnalytics>;
  getAuditLogs(params: OrgAuditLogsParams, ctx: OrgServiceContext): Promise<AuditLogListResult>;

  // Utility operations
  ensureDefaultOrg(ctx: OrgServiceContext): Promise<OrgRecord>;
}

// =============================================================================
// PARAM TYPES
// =============================================================================

export interface OrgListParams {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'userCount';
  sortOrder: 'asc' | 'desc';
  crossOrgAccess?: boolean;
  includeStats?: boolean;
}

export interface OrgGetByIdParams {
  id: string | number;
  includeStats?: boolean;
  includeSettings?: boolean;
  includeAuditLogs?: boolean;
  auditStartDate?: Date;
  auditEndDate?: Date;
  crossOrgAccess?: boolean;
}

export interface OrgGetAllWithStatsParams {
  search?: string;
  isActive?: boolean;
  limit: number;
  offset: number;
}

export interface OrgUpdateParams {
  id: string | number;
  name?: string;
  description?: string;
  slug?: string;
  logoUrl?: string;
  website?: string;
  businessAddress?: string;
  merchantId?: string;
  currency?: string;
  currencySymbol?: string;
  currencyLocale?: string;
  isActive?: boolean;
  copilotEnabled?: boolean;
  crossOrgAccess?: boolean;
}

export interface OrgUpdateCurrentParams {
  name?: string;
  description?: string;
  website?: string;
  businessAddress?: string;
  currency?: string;
  currencySymbol?: string;
  currencyLocale?: string;
}

export interface OrgDeleteParams {
  id: string | number;
  force?: boolean;
}

export interface OrgGetSettingsParams {
  orgId: number;
  category?: string;
}

export interface OrgUpdateSettingsParams {
  orgId: number;
  settings: OrgSettingUpdate[];
}

export interface OrgAnalyticsParams {
  orgId: number;
  startDate?: Date;
  endDate?: Date;
  compareWithOrgs?: number[];
}

export interface OrgAuditLogsParams {
  orgId?: number;
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
  crossOrgAccess?: boolean;
}

export interface OrgWithDetails extends OrgRecord {
  stats?: OrgStats;
  settings?: OrgSetting[];
  auditLogs?: OrgAuditLogRecord[];
  users?: OrgUser[];
  userCount?: number;
}

// =============================================================================
// AUDIT ACTIONS
// =============================================================================

export const OrgAuditActions = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  SOFT_DELETE: 'SOFT_DELETE',
  RESTORE: 'RESTORE',
  ACTIVATE: 'ACTIVATE',
  DEACTIVATE: 'DEACTIVATE',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  MEMBER_ADD: 'MEMBER_ADD',
  MEMBER_REMOVE: 'MEMBER_REMOVE',
  ROLE_CHANGE: 'ROLE_CHANGE',
} as const;

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Custom error class for organization service errors
 */
export class OrgServiceError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'INTERNAL_ERROR',
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'OrgServiceError';
  }
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

/**
 * Create an Organization Service class with injected dependencies.
 *
 * @example
 * ```typescript
 * import { createOrgServiceClass } from '@jetdevs/core/organizations';
 * import { OrgRepository } from './org.repository';
 * import { withPrivilegedDb } from '@/db/clients';
 * import { copyOrgRoleTemplates } from '@/db/seeds/seed-rbac';
 *
 * const OrgServiceBase = createOrgServiceClass(
 *   OrgRepository,
 *   {
 *     withPrivilegedDb,
 *     copyRoleTemplates: copyOrgRoleTemplates,
 *     onOrgCreated: async (org, ctx) => {
 *       // Custom logic
 *     },
 *   }
 * );
 *
 * export class OrgService extends OrgServiceBase {
 *   // Add app-specific methods
 * }
 * ```
 */
export function createOrgServiceClass(
  RepositoryClass: new () => IOrgRepository,
  hooks?: OrgServiceHooks
) {
  return class OrgService implements IOrgService {
    /** @internal */
    _hooks = hooks;

    /** @internal */
    _createRepository(): IOrgRepository {
      return new RepositoryClass();
    }

    /**
     * Validate cross-org access
     * @internal
     */
    _validateCrossOrgAccess(ctx: OrgServiceContext, requested: boolean = false): boolean {
      if (requested && !ctx.actor.isSystemUser) {
        throw new OrgServiceError(
          'FORBIDDEN',
          'Cross-organization access requires system role'
        );
      }
      return requested && ctx.actor.isSystemUser;
    }

    /**
     * Execute with privileged database if available
     * @internal
     */
    async _withPrivileged<T>(
      ctx: OrgServiceContext,
      fn: (db: PostgresJsDatabase<any>) => Promise<T>
    ): Promise<T> {
      if (this._hooks?.withPrivilegedDb) {
        return this._hooks.withPrivilegedDb(fn);
      }
      return fn(ctx.db);
    }

    // -------------------------------------------------------------------------
    // LIST & READ OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * List organizations with pagination and filtering
     */
    async list(params: OrgListParams, ctx: OrgServiceContext): Promise<OrgListResult> {
      const {
        page,
        pageSize,
        search,
        isActive,
        sortBy,
        sortOrder,
        crossOrgAccess,
        includeStats
      } = params;

      const shouldUseCrossOrg = this._validateCrossOrgAccess(ctx, crossOrgAccess);

      try {
        const repo = this._createRepository();

        if (shouldUseCrossOrg) {
          // Cross-org access - return all orgs
          return await repo.list(ctx.db, {
            page,
            pageSize,
            sortBy,
            sortOrder,
            filters: { search, isActive, crossOrgAccess: true },
            includeStats,
          });
        } else {
          // Regular org-scoped access - only return current org
          if (ctx.orgId) {
            const org = await repo.findById(ctx.db, ctx.orgId);
            if (!org) {
              return {
                organizations: [],
                pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
              };
            }

            // Check if org matches filters
            const matchesSearch = !search ||
              org.name.toLowerCase().includes(search.toLowerCase()) ||
              org.description?.toLowerCase().includes(search.toLowerCase()) ||
              org.merchantId?.toLowerCase().includes(search.toLowerCase());

            const matchesActive = isActive === undefined || org.isActive === isActive;

            if (!matchesSearch || !matchesActive) {
              return {
                organizations: [],
                pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
              };
            }

            // Get stats if requested
            let orgWithStats: any = { ...org };
            if (includeStats) {
              const stats = await repo.getStats(ctx.db, org.id);
              orgWithStats = {
                ...org,
                userCount: stats.totalUsers,
                roleCount: stats.totalRoles,
                activeUserCount: stats.activeUsers,
              };
            }

            return {
              organizations: [orgWithStats],
              pagination: { page: 1, pageSize, totalCount: 1, totalPages: 1 },
            };
          }

          return {
            organizations: [],
            pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
          };
        }
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error listing organizations:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to list organizations', error);
      }
    }

    /**
     * Get organization by ID with optional details
     */
    async getById(params: OrgGetByIdParams, ctx: OrgServiceContext): Promise<OrgWithDetails | null> {
      const {
        id,
        includeStats,
        includeSettings,
        includeAuditLogs,
        auditStartDate,
        auditEndDate,
        crossOrgAccess
      } = params;

      const shouldUseCrossOrg = this._validateCrossOrgAccess(ctx, crossOrgAccess);

      try {
        const repo = this._createRepository();

        const fetchOrgDetails = async (db: PostgresJsDatabase<any>): Promise<OrgWithDetails | null> => {
          const org = await repo.findById(db, id);

          if (!org) {
            throw new OrgServiceError('NOT_FOUND', 'Organization not found');
          }

          // Verify access for non-cross-org queries
          if (!shouldUseCrossOrg && org.id !== ctx.orgId) {
            throw new OrgServiceError('FORBIDDEN', 'Access denied to this organization');
          }

          const result: OrgWithDetails = { ...org };

          if (includeStats) {
            result.stats = await repo.getStats(db, org.id);
          }

          if (includeSettings) {
            result.settings = await repo.getSettings(db, org.id);
          }

          if (includeAuditLogs) {
            result.auditLogs = await repo.getRecentAuditLogs(
              db,
              org.id,
              auditStartDate,
              auditEndDate,
              20
            );
          }

          // Always include users for organization detail pages
          result.users = await repo.getOrgUsers(db, org.id);
          result.userCount = result.users?.length || 0;

          return result;
        };

        if (shouldUseCrossOrg) {
          return await this._withPrivileged(ctx, fetchOrgDetails);
        }

        return await fetchOrgDetails(ctx.db);
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error getting organization by ID:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to get organization', error);
      }
    }

    /**
     * Get current user's organization
     */
    async getCurrent(ctx: OrgServiceContext): Promise<OrgRecord | null> {
      try {
        if (!ctx.orgId) {
          return null;
        }

        const repo = this._createRepository();
        return await repo.findById(ctx.db, ctx.orgId);
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error getting current organization:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to get current organization', error);
      }
    }

    /**
     * Get all organizations with statistics (admin/system only)
     */
    async getAllWithStats(params: OrgGetAllWithStatsParams, ctx: OrgServiceContext): Promise<OrgListResult> {
      try {
        if (!ctx.actor.isSystemUser) {
          throw new OrgServiceError('FORBIDDEN', 'System access required for cross-org statistics');
        }

        const repo = this._createRepository();

        return await this._withPrivileged(ctx, async (db) => {
          return await repo.list(db, {
            page: Math.floor(params.offset / params.limit) + 1,
            pageSize: params.limit,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            filters: {
              search: params.search,
              isActive: params.isActive,
              crossOrgAccess: true
            },
            includeStats: true,
          });
        });
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error getting all orgs with stats:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to get organizations with statistics', error);
      }
    }

    /**
     * Get total count of organizations (admin only)
     */
    async count(ctx: OrgServiceContext): Promise<number> {
      try {
        if (!ctx.actor.isSystemUser) {
          throw new OrgServiceError('FORBIDDEN', 'System access required for org count');
        }

        const repo = this._createRepository();

        return await this._withPrivileged(ctx, async (db) => {
          const result = await repo.list(db, {
            page: 1,
            pageSize: 1,
            sortBy: 'createdAt',
            sortOrder: 'asc',
            filters: { isActive: true, crossOrgAccess: true },
            includeStats: false,
          });
          return result.pagination.totalCount;
        });
      } catch (error) {
        console.error('Error counting organizations:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to count organizations', error);
      }
    }

    // -------------------------------------------------------------------------
    // CRUD OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Create new organization
     */
    async create(params: OrgCreateData, ctx: OrgServiceContext): Promise<OrgRecord> {
      try {
        return await this._withPrivileged(ctx, async (db) => {
          const repo = this._createRepository();

          // Check for duplicate slug if provided
          if (params.slug) {
            const slugExists = await repo.exists(db, 'slug', params.slug);
            if (slugExists) {
              throw new OrgServiceError('CONFLICT', 'An organization with this slug already exists');
            }
          }

          // Generate unique slug if hook is provided
          let finalSlug = params.slug;
          if (!finalSlug && this._hooks?.generateSlug) {
            finalSlug = await this._hooks.generateSlug(params.name, db);
          }

          // Create organization
          const newOrg = await repo.create(db, { ...params, slug: finalSlug });

          // Log audit event
          await repo.logAudit(
            db,
            newOrg.id,
            ctx.actor.userId,
            OrgAuditActions.CREATE,
            'organization',
            newOrg.uuid,
            null,
            { initialData: params }
          );

          // NOTE: copyRoleTemplates hook is deprecated and no longer called.
          // Roles are now global (orgId = null, isGlobalRole = true) and shared across all organizations.

          // Call onOrgCreated hook if provided
          if (this._hooks?.onOrgCreated) {
            await this._hooks.onOrgCreated(newOrg, ctx);
          }

          return newOrg;
        });
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error creating organization:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to create organization', error);
      }
    }

    /**
     * Update organization
     */
    async update(params: OrgUpdateParams, ctx: OrgServiceContext): Promise<OrgRecord | null> {
      const { id, crossOrgAccess, ...updateData } = params;

      const shouldUseCrossOrg = this._validateCrossOrgAccess(ctx, crossOrgAccess);

      try {
        return await this._withPrivileged(ctx, async (db) => {
          const repo = this._createRepository();

          // Get existing organization
          const existingOrg = await repo.findById(db, id);

          if (!existingOrg) {
            throw new OrgServiceError('NOT_FOUND', 'Organization not found');
          }

          // Verify access
          if (!shouldUseCrossOrg && existingOrg.id !== ctx.orgId) {
            throw new OrgServiceError('FORBIDDEN', 'Access denied to this organization');
          }

          // Check for duplicate slug if being updated
          if (updateData.slug && updateData.slug !== existingOrg.slug) {
            const slugExists = await repo.exists(db, 'slug', updateData.slug, existingOrg.id);
            if (slugExists) {
              throw new OrgServiceError('CONFLICT', 'Another organization with this slug already exists');
            }
          }

          // Track changes for audit
          const changes = {
            before: {} as Record<string, any>,
            after: {} as Record<string, any>,
          };

          Object.keys(updateData).forEach(key => {
            const existingValue = existingOrg[key as keyof typeof existingOrg];
            const newValue = updateData[key as keyof typeof updateData];
            if (existingValue !== newValue) {
              changes.before[key] = existingValue;
              changes.after[key] = newValue;
            }
          });

          // Update organization
          const updatedOrg = await repo.update(db, existingOrg.id, updateData);

          // Log audit event if changes were made
          if (Object.keys(changes.before).length > 0 && updatedOrg) {
            await repo.logAudit(
              db,
              updatedOrg.id,
              ctx.actor.userId,
              OrgAuditActions.UPDATE,
              'organization',
              updatedOrg.uuid,
              changes,
              null
            );
          }

          return updatedOrg;
        });
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error updating organization:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to update organization', error);
      }
    }

    /**
     * Update current user's organization settings
     */
    async updateCurrent(params: OrgUpdateCurrentParams, ctx: OrgServiceContext): Promise<OrgRecord | null> {
      try {
        if (!ctx.orgId) {
          throw new OrgServiceError('FORBIDDEN', 'No organization context');
        }

        const repo = this._createRepository();

        // Get existing organization
        const existingOrg = await repo.findById(ctx.db, ctx.orgId);

        if (!existingOrg) {
          throw new OrgServiceError('NOT_FOUND', 'Organization not found');
        }

        // Check name uniqueness if being updated
        if (params.name && params.name !== existingOrg.name) {
          const nameExists = await repo.exists(ctx.db, 'name', params.name, existingOrg.id);
          if (nameExists) {
            throw new OrgServiceError('CONFLICT', 'An organization with this name already exists');
          }
        }

        // Track changes for audit
        const changes = {
          before: {} as Record<string, any>,
          after: {} as Record<string, any>,
        };

        Object.keys(params).forEach(key => {
          const existingValue = existingOrg[key as keyof typeof existingOrg];
          const newValue = params[key as keyof typeof params];
          if (existingValue !== newValue) {
            changes.before[key] = existingValue;
            changes.after[key] = newValue;
          }
        });

        // Update organization
        const updatedOrg = await repo.update(ctx.db, existingOrg.id, params);

        // Log audit event if changes were made
        if (Object.keys(changes.before).length > 0 && updatedOrg) {
          await repo.logAudit(
            ctx.db,
            updatedOrg.id,
            ctx.actor.userId,
            OrgAuditActions.UPDATE,
            'organization',
            updatedOrg.uuid,
            changes,
            null
          );
        }

        return updatedOrg;
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error updating current organization:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to update organization settings', error);
      }
    }

    /**
     * Delete organization
     */
    async delete(params: OrgDeleteParams, ctx: OrgServiceContext): Promise<OrgDeleteResult> {
      const { id, force } = params;

      // Only system users can force hard delete
      if (force && !ctx.actor.isSystemUser) {
        throw new OrgServiceError('FORBIDDEN', 'Force delete requires system role');
      }

      try {
        const repo = this._createRepository();

        // Check if organization exists
        const existingOrg = await repo.findById(ctx.db, id);

        if (!existingOrg) {
          throw new OrgServiceError('NOT_FOUND', 'Organization not found');
        }

        // Verify access
        if (existingOrg.id !== ctx.orgId && !ctx.actor.isSystemUser) {
          throw new OrgServiceError('FORBIDDEN', 'Access denied to this organization');
        }

        // Call onOrgDeleted hook if provided
        if (this._hooks?.onOrgDeleted) {
          await this._hooks.onOrgDeleted(existingOrg.id, ctx);
        }

        // Check if organization has users
        const userCount = await repo.getUserCount(ctx.db, existingOrg.id);

        if (userCount > 0 && !force) {
          // Soft delete by deactivating
          const deactivated = await repo.softDelete(ctx.db, existingOrg.id);

          if (deactivated) {
            await repo.logAudit(
              ctx.db,
              deactivated.id,
              ctx.actor.userId,
              OrgAuditActions.SOFT_DELETE,
              'organization',
              deactivated.uuid,
              { reason: 'Has active users' },
              null
            );
          }

          return {
            deleted: false,
            deactivated: true,
            organization: deactivated,
            message: 'Organization deactivated (has active users)'
          };
        } else if (force && ctx.actor.isSystemUser) {
          // Hard delete if forced by system user
          await repo.hardDelete(ctx.db, existingOrg.id);

          console.log('Hard deleted organization:', existingOrg.uuid, 'by user:', ctx.actor.userId);

          return {
            deleted: true,
            organization: existingOrg,
            message: 'Organization permanently deleted'
          };
        } else {
          // Soft delete for organizations without users
          const deactivated = await repo.softDelete(ctx.db, existingOrg.id);

          if (deactivated) {
            await repo.logAudit(
              ctx.db,
              deactivated.id,
              ctx.actor.userId,
              OrgAuditActions.SOFT_DELETE,
              'organization',
              deactivated.uuid,
              null,
              null
            );
          }

          return {
            deleted: false,
            deactivated: true,
            organization: deactivated,
            message: 'Organization deactivated'
          };
        }
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error deleting organization:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to delete organization', error);
      }
    }

    // -------------------------------------------------------------------------
    // SETTINGS OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get organization settings
     */
    async getSettings(params: OrgGetSettingsParams, ctx: OrgServiceContext): Promise<OrgSetting[]> {
      const { orgId, category } = params;

      // Verify access to the organization
      if (orgId !== ctx.orgId && !ctx.actor.isSystemUser) {
        throw new OrgServiceError('FORBIDDEN', 'Access denied to this organization');
      }

      try {
        const repo = this._createRepository();
        return await repo.getSettings(ctx.db, orgId, category);
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error getting organization settings:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to get organization settings', error);
      }
    }

    /**
     * Update organization settings
     */
    async updateSettings(params: OrgUpdateSettingsParams, ctx: OrgServiceContext): Promise<{ updated: number; settings: OrgSetting[] }> {
      const { orgId, settings } = params;

      // Verify access to the organization
      if (orgId !== ctx.orgId && !ctx.actor.isSystemUser) {
        throw new OrgServiceError('FORBIDDEN', 'Access denied to this organization');
      }

      try {
        const repo = this._createRepository();
        const updatedSettings: OrgSetting[] = [];

        for (const setting of settings) {
          const result = await repo.updateSetting(ctx.db, orgId, setting, ctx.actor.userId);
          updatedSettings.push(result.updated);

          // Log audit event
          if (result.isNew) {
            await repo.logAudit(
              ctx.db,
              orgId,
              ctx.actor.userId,
              OrgAuditActions.SETTINGS_UPDATE,
              'settings',
              setting.key,
              null,
              { action: 'created', value: setting.value }
            );
          } else {
            await repo.logAudit(
              ctx.db,
              orgId,
              ctx.actor.userId,
              OrgAuditActions.SETTINGS_UPDATE,
              'settings',
              setting.key,
              {
                before: { value: result.updated.value },
                after: { value: setting.value },
              },
              null
            );
          }
        }

        return {
          updated: updatedSettings.length,
          settings: updatedSettings,
        };
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error updating organization settings:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to update organization settings', error);
      }
    }

    // -------------------------------------------------------------------------
    // COPILOT OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get copilot feature status for current organization
     */
    async getCopilotStatus(ctx: OrgServiceContext): Promise<{ copilotEnabled: boolean }> {
      try {
        if (!ctx.orgId) {
          return { copilotEnabled: true }; // Default to enabled if no org context
        }

        const repo = this._createRepository();
        const org = await repo.findById(ctx.db, ctx.orgId);

        return { copilotEnabled: org?.copilotEnabled ?? true };
      } catch (error) {
        console.error('Error getting copilot status:', error);
        return { copilotEnabled: true }; // Fail open
      }
    }

    /**
     * Update copilot feature status (superuser only)
     */
    async updateCopilotStatus(
      orgId: number,
      copilotEnabled: boolean,
      ctx: OrgServiceContext
    ): Promise<{ success: boolean; copilotEnabled: boolean }> {
      try {
        if (!ctx.actor.isSystemUser) {
          throw new OrgServiceError('FORBIDDEN', 'System access required to update copilot status');
        }

        return await this._withPrivileged(ctx, async (db) => {
          const repo = this._createRepository();

          // Check if org exists
          const existingOrg = await repo.findById(db, orgId);

          if (!existingOrg) {
            throw new OrgServiceError('NOT_FOUND', 'Organization not found');
          }

          // Update organization
          const updatedOrg = await repo.update(db, orgId, { copilotEnabled });

          console.log(`Updated copilot status for org ${orgId} to ${copilotEnabled}`);

          return { success: true, copilotEnabled: updatedOrg!.copilotEnabled };
        });
      } catch (error) {
        console.error('Error updating copilot status:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to update copilot status', error);
      }
    }

    // -------------------------------------------------------------------------
    // ANALYTICS & AUDIT OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Get organization analytics
     */
    async getAnalytics(params: OrgAnalyticsParams, ctx: OrgServiceContext): Promise<OrgAnalytics> {
      const { orgId, startDate, endDate, compareWithOrgs } = params;

      // Verify access to the organization
      if (orgId !== ctx.orgId && !ctx.actor.isSystemUser) {
        throw new OrgServiceError('FORBIDDEN', 'Access denied to this organization analytics');
      }

      try {
        const repo = this._createRepository();
        return await repo.getAnalytics(ctx.db, orgId, startDate, endDate, compareWithOrgs);
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error getting organization analytics:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to get organization analytics', error);
      }
    }

    /**
     * Get audit logs
     */
    async getAuditLogs(params: OrgAuditLogsParams, ctx: OrgServiceContext): Promise<AuditLogListResult> {
      const {
        orgId,
        page,
        pageSize,
        action,
        entityType,
        userId,
        startDate,
        endDate,
        crossOrgAccess
      } = params;

      const shouldUseCrossOrg = this._validateCrossOrgAccess(ctx, crossOrgAccess);

      try {
        const repo = this._createRepository();
        const targetOrgId = orgId || ctx.orgId;

        const fetchAuditLogs = async (db: PostgresJsDatabase<any>) => {
          return await repo.getAuditLogs(db, {
            page,
            pageSize,
            filters: {
              orgId: shouldUseCrossOrg ? orgId : targetOrgId,
              action,
              entityType,
              userId,
              startDate,
              endDate,
            },
          });
        };

        if (shouldUseCrossOrg) {
          return await this._withPrivileged(ctx, fetchAuditLogs);
        }

        return await fetchAuditLogs(ctx.db);
      } catch (error) {
        if (error instanceof OrgServiceError) throw error;
        console.error('Error getting audit logs:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to get audit logs', error);
      }
    }

    // -------------------------------------------------------------------------
    // UTILITY OPERATIONS
    // -------------------------------------------------------------------------

    /**
     * Ensure default organization exists (system utility)
     */
    async ensureDefaultOrg(ctx: OrgServiceContext): Promise<OrgRecord> {
      try {
        return await this._withPrivileged(ctx, async (db) => {
          const repo = this._createRepository();

          // Check if any orgs exist
          const existingOrgs = await repo.list(db, {
            page: 1,
            pageSize: 1,
            sortBy: 'createdAt',
            sortOrder: 'asc',
            filters: {},
            includeStats: false,
          });

          if (existingOrgs.organizations.length === 0) {
            // Create default org
            const defaultOrg = await repo.create(db, {
              name: 'Default Organization',
              description: 'Default org for initial setup',
              slug: 'default-org',
            });

            console.log('Created default org:', { orgId: defaultOrg.id });

            // NOTE: copyRoleTemplates hook is deprecated and no longer called.
            // Roles are now global (orgId = null, isGlobalRole = true) and shared across all organizations.

            return defaultOrg;
          }

          return existingOrgs.organizations[0] as OrgRecord;
        });
      } catch (error) {
        console.error('Error ensuring default org:', error);
        throw new OrgServiceError('INTERNAL_ERROR', 'Failed to ensure default organization', error);
      }
    }
  };
}

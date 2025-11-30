/**
 * Organization Router Configuration Factory
 *
 * Creates organization router configuration for use with createRouterWithActor.
 * This factory pattern allows apps to inject their own dependencies while
 * reusing the core organization management logic.
 *
 * @module @yobolabs/core/organizations
 */

import { z } from 'zod';
import {
  orgListSchema,
  orgGetByIdSchema,
  orgGetByUuidSchema,
  orgCreateSchema,
  orgUpdateSchema,
  orgUpdateCurrentSchema,
  orgDeleteSchema,
  orgCreateForUserSchema,
  orgAnalyticsSchema,
  orgStatsSchema,
  orgGetAllWithStatsSchema,
  orgGetSettingsSchema,
  orgUpdateSettingsSchema,
  orgAuditLogsSchema,
  orgUpdateCopilotStatusSchema,
  orgAddUserSchema,
  orgRemoveUserSchema,
  orgUpdateUserRoleSchema,
} from './schemas';
import type { IOrgRepository } from './repository';
import type { IOrgService } from './service';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dependencies that must be provided by the consuming app
 */
export interface OrgRouterDeps {
  /**
   * Repository class constructor - will be instantiated per request
   */
  Repository: new () => IOrgRepository;

  /**
   * Service class constructor - will be instantiated per request
   */
  Service: new () => IOrgService;

  /**
   * Function to execute with privileged database access (bypasses RLS)
   */
  withPrivilegedDb?: <T>(fn: (db: any) => Promise<T>) => Promise<T>;

  /**
   * Function to copy role templates for a new organization
   */
  copyRoleTemplates?: (orgId: number) => Promise<void>;
}

/**
 * Service context from createRouterWithActor
 */
export interface OrgServiceContext {
  db: any;
  orgId: number;
  userId: string;
}

/**
 * Handler context from createRouterWithActor
 */
export interface OrgHandlerContext<TInput = any> {
  input: TInput;
  service: OrgServiceContext;
  actor: any;
  db: any;
  repo: IOrgRepository;
  ctx: any;
}

/**
 * Error class for organization operations
 */
export class OrgRouterError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'BAD_REQUEST' | 'INTERNAL_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'OrgRouterError';
  }
}

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

/**
 * Create organization router configuration for use with createRouterWithActor.
 *
 * This factory creates a configuration object that can be passed to
 * createRouterWithActor. It handles all common organization management operations.
 *
 * @example
 * ```typescript
 * import { createOrgRouterConfig } from '@yobolabs/core/organizations';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 * import { OrgRepository } from '@/server/repos/org.repository';
 * import { OrgService } from '@/server/services/domain/org.service';
 * import { withPrivilegedDb } from '@/db/clients';
 *
 * const orgRouterConfig = createOrgRouterConfig({
 *   Repository: OrgRepository,
 *   Service: OrgService,
 *   withPrivilegedDb,
 * });
 *
 * export const orgRouter = createRouterWithActor(orgRouterConfig);
 * ```
 */
export function createOrgRouterConfig(deps: OrgRouterDeps) {
  const { Repository, Service, withPrivilegedDb } = deps;

  /**
   * Helper to execute with privileged access if available
   */
  const executePrivileged = async <T>(fn: (db: any) => Promise<T>, db: any): Promise<T> => {
    if (withPrivilegedDb) {
      return withPrivilegedDb(fn);
    }
    return fn(db);
  };

  return {
    // -------------------------------------------------------------------------
    // GET CURRENT ORGANIZATION
    // -------------------------------------------------------------------------
    getCurrent: {
      type: 'query' as const,
      repository: Repository,
      handler: async ({ service, repo, db }: OrgHandlerContext) => {
        if (!service.orgId) {
          return null;
        }
        return repo.findById(db, service.orgId);
      },
    },

    // -------------------------------------------------------------------------
    // LIST ORGANIZATIONS
    // -------------------------------------------------------------------------
    list: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgListSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgListSchema>>) => {
        // Non-system users can only see their own org
        if (!actor.isSystemUser && !input.crossOrgAccess) {
          if (service.orgId) {
            const org = await repo.findById(db, service.orgId);
            if (!org) {
              return { organizations: [], pagination: { page: 1, pageSize: input.pageSize, totalCount: 0, totalPages: 0 } };
            }
            return {
              organizations: [org],
              pagination: { page: 1, pageSize: input.pageSize, totalCount: 1, totalPages: 1 },
            };
          }
          return { organizations: [], pagination: { page: 1, pageSize: input.pageSize, totalCount: 0, totalPages: 0 } };
        }

        // System users can list all organizations
        return executePrivileged((privilegedDb) =>
          repo.list(privilegedDb, {
            page: input.page,
            pageSize: input.pageSize,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
            filters: {
              search: input.search,
              isActive: input.isActive,
              crossOrgAccess: true,
            },
            includeStats: input.includeStats,
          }), db);
      },
    },

    // -------------------------------------------------------------------------
    // GET ORGANIZATION BY ID
    // -------------------------------------------------------------------------
    getById: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgGetByIdSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgGetByIdSchema>>) => {
        const orgId = typeof input.id === 'string' ? input.id : input.id;

        // Use privileged access if cross-org or system user
        const getOrg = async (targetDb: any) => {
          const org = await repo.findById(targetDb, orgId);
          if (!org) {
            throw new OrgRouterError('NOT_FOUND', 'Organization not found');
          }

          const result: any = { ...org };

          if (input.includeStats) {
            result.stats = await repo.getStats(targetDb, org.id);
          }

          if (input.includeSettings) {
            result.settings = await repo.getSettings(targetDb, org.id);
          }

          if (input.includeAuditLogs) {
            result.auditLogs = await repo.getRecentAuditLogs(
              targetDb,
              org.id,
              input.auditStartDate,
              input.auditEndDate,
              20
            );
          }

          result.users = await repo.getOrgUsers(targetDb, org.id);
          result.userCount = result.users?.length || 0;

          return result;
        };

        if (input.crossOrgAccess && actor.isSystemUser) {
          return executePrivileged(getOrg, db);
        }

        // Regular access - verify permission
        const org = await repo.findById(db, orgId);
        if (!org) {
          throw new OrgRouterError('NOT_FOUND', 'Organization not found');
        }

        if (org.id !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        return getOrg(db);
      },
    },

    // -------------------------------------------------------------------------
    // GET ORGANIZATION BY UUID
    // -------------------------------------------------------------------------
    getByUuid: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgGetByUuidSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgGetByUuidSchema>>) => {
        const getOrg = async (targetDb: any) => {
          const org = await repo.findById(targetDb, input.uuid);
          if (!org) {
            throw new OrgRouterError('NOT_FOUND', 'Organization not found');
          }
          return org;
        };

        if (input.crossOrgAccess && actor.isSystemUser) {
          return executePrivileged(getOrg, db);
        }

        const org = await getOrg(db);
        if (org.id !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        return org;
      },
    },

    // -------------------------------------------------------------------------
    // GET ALL ORGANIZATIONS WITH STATS (system only)
    // -------------------------------------------------------------------------
    getAllWithStats: {
      type: 'query' as const,
      permission: 'admin:manage',
      input: orgGetAllWithStatsSchema,
      repository: Repository,
      handler: async ({ input, repo, db }: OrgHandlerContext<z.infer<typeof orgGetAllWithStatsSchema>>) => {
        return executePrivileged((privilegedDb) =>
          repo.list(privilegedDb, {
            page: Math.floor(input.offset / input.limit) + 1,
            pageSize: input.limit,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            filters: {
              search: input.search,
              isActive: input.isActive,
              crossOrgAccess: true,
            },
            includeStats: true,
          }), db);
      },
    },

    // -------------------------------------------------------------------------
    // GET ORGANIZATION STATS
    // -------------------------------------------------------------------------
    getStats: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgStatsSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgStatsSchema>>) => {
        const getStats = async (targetDb: any) => {
          return repo.getStats(targetDb, input.orgId);
        };

        if (input.crossOrgAccess && actor.isSystemUser) {
          return executePrivileged(getStats, db);
        }

        if (input.orgId !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        return getStats(db);
      },
    },

    // -------------------------------------------------------------------------
    // COUNT ORGANIZATIONS (system only)
    // -------------------------------------------------------------------------
    count: {
      type: 'query' as const,
      permission: 'admin:manage',
      repository: Repository,
      handler: async ({ repo, db }: OrgHandlerContext) => {
        const result = await executePrivileged(async (privilegedDb) => {
          const list = await repo.list(privilegedDb, {
            page: 1,
            pageSize: 1,
            sortBy: 'createdAt',
            sortOrder: 'asc',
            filters: { isActive: true, crossOrgAccess: true },
            includeStats: false,
          });
          return list.pagination.totalCount;
        }, db);
        return { count: result };
      },
    },

    // -------------------------------------------------------------------------
    // CREATE ORGANIZATION
    // -------------------------------------------------------------------------
    create: {
      permission: 'org:create',
      input: orgCreateSchema,
      invalidates: ['organizations'],
      entityType: 'organization',
      repository: Repository,
      handler: async ({ input, service, repo, db }: OrgHandlerContext<z.infer<typeof orgCreateSchema>>) => {
        return executePrivileged(async (privilegedDb) => {
          // Check for duplicate slug if provided
          if (input.slug) {
            const slugExists = await repo.exists(privilegedDb, 'slug', input.slug);
            if (slugExists) {
              throw new OrgRouterError('CONFLICT', 'An organization with this slug already exists');
            }
          }

          // Generate slug from name if not provided
          const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

          // Create organization
          const newOrg = await repo.create(privilegedDb, { ...input, slug });

          // Log audit event
          await repo.logAudit(
            privilegedDb,
            newOrg.id,
            parseInt(service.userId),
            'CREATE',
            'organization',
            newOrg.uuid,
            null,
            { initialData: input }
          );

          // Copy role templates if hook provided
          if (deps.copyRoleTemplates) {
            await deps.copyRoleTemplates(newOrg.id);
          }

          return newOrg;
        }, db);
      },
    },

    // -------------------------------------------------------------------------
    // CREATE ORGANIZATION FOR USER (regular user creating org)
    // -------------------------------------------------------------------------
    createForUser: {
      permission: 'org:create',
      input: orgCreateForUserSchema,
      invalidates: ['organizations'],
      entityType: 'organization',
      repository: Repository,
      handler: async ({ input, service, repo, db }: OrgHandlerContext<z.infer<typeof orgCreateForUserSchema>>) => {
        return executePrivileged(async (privilegedDb) => {
          const slug = input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

          // Check for duplicate slug
          const slugExists = await repo.exists(privilegedDb, 'slug', slug);
          if (slugExists) {
            throw new OrgRouterError('CONFLICT', 'An organization with this name already exists');
          }

          const newOrg = await repo.create(privilegedDb, {
            name: input.name,
            description: input.description,
            slug,
          });

          // Log audit event
          await repo.logAudit(
            privilegedDb,
            newOrg.id,
            parseInt(service.userId),
            'CREATE',
            'organization',
            newOrg.uuid,
            null,
            { initialData: input, createdBy: 'user' }
          );

          // Copy role templates if hook provided
          if (deps.copyRoleTemplates) {
            await deps.copyRoleTemplates(newOrg.id);
          }

          return newOrg;
        }, db);
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE ORGANIZATION
    // -------------------------------------------------------------------------
    update: {
      permission: 'org:update',
      input: orgUpdateSchema,
      invalidates: ['organizations'],
      entityType: 'organization',
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgUpdateSchema>>) => {
        const { id, crossOrgAccess, ...updateData } = input;

        const updateOrg = async (targetDb: any) => {
          const existingOrg = await repo.findById(targetDb, id);

          if (!existingOrg) {
            throw new OrgRouterError('NOT_FOUND', 'Organization not found');
          }

          // Check for duplicate slug if being updated
          if (updateData.slug && updateData.slug !== existingOrg.slug) {
            const slugExists = await repo.exists(targetDb, 'slug', updateData.slug, existingOrg.id);
            if (slugExists) {
              throw new OrgRouterError('CONFLICT', 'Another organization with this slug already exists');
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

          const updatedOrg = await repo.update(targetDb, existingOrg.id, updateData);

          // Log audit event if changes were made
          if (Object.keys(changes.before).length > 0 && updatedOrg) {
            await repo.logAudit(
              targetDb,
              updatedOrg.id,
              parseInt(service.userId),
              'UPDATE',
              'organization',
              updatedOrg.uuid,
              changes,
              null
            );
          }

          return updatedOrg;
        };

        if (crossOrgAccess && actor.isSystemUser) {
          return executePrivileged(updateOrg, db);
        }

        // Verify access
        const existingOrg = await repo.findById(db, id);
        if (!existingOrg) {
          throw new OrgRouterError('NOT_FOUND', 'Organization not found');
        }
        if (existingOrg.id !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        return updateOrg(db);
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE CURRENT ORGANIZATION
    // -------------------------------------------------------------------------
    updateCurrent: {
      permission: 'org:update',
      input: orgUpdateCurrentSchema,
      invalidates: ['organizations'],
      entityType: 'organization',
      repository: Repository,
      handler: async ({ input, service, repo, db }: OrgHandlerContext<z.infer<typeof orgUpdateCurrentSchema>>) => {
        if (!service.orgId) {
          throw new OrgRouterError('FORBIDDEN', 'No organization context');
        }

        const existingOrg = await repo.findById(db, service.orgId);
        if (!existingOrg) {
          throw new OrgRouterError('NOT_FOUND', 'Organization not found');
        }

        // Check name uniqueness if being updated
        if (input.name && input.name !== existingOrg.name) {
          const nameExists = await repo.exists(db, 'name', input.name, existingOrg.id);
          if (nameExists) {
            throw new OrgRouterError('CONFLICT', 'An organization with this name already exists');
          }
        }

        // Track changes for audit
        const changes = {
          before: {} as Record<string, any>,
          after: {} as Record<string, any>,
        };

        Object.keys(input).forEach(key => {
          const existingValue = existingOrg[key as keyof typeof existingOrg];
          const newValue = input[key as keyof typeof input];
          if (existingValue !== newValue) {
            changes.before[key] = existingValue;
            changes.after[key] = newValue;
          }
        });

        const updatedOrg = await repo.update(db, existingOrg.id, input);

        // Log audit event if changes were made
        if (Object.keys(changes.before).length > 0 && updatedOrg) {
          await repo.logAudit(
            db,
            updatedOrg.id,
            parseInt(service.userId),
            'UPDATE',
            'organization',
            updatedOrg.uuid,
            changes,
            null
          );
        }

        return updatedOrg;
      },
    },

    // -------------------------------------------------------------------------
    // DELETE ORGANIZATION
    // -------------------------------------------------------------------------
    delete: {
      permission: 'org:delete',
      input: orgDeleteSchema,
      invalidates: ['organizations'],
      entityType: 'organization',
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgDeleteSchema>>) => {
        const { id, force } = input;

        // Only system users can force hard delete
        if (force && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Force delete requires system role');
        }

        return executePrivileged(async (privilegedDb) => {
          const existingOrg = await repo.findById(privilegedDb, id);

          if (!existingOrg) {
            throw new OrgRouterError('NOT_FOUND', 'Organization not found');
          }

          // Verify access
          if (existingOrg.id !== service.orgId && !actor.isSystemUser) {
            throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
          }

          // Check if organization has users
          const userCount = await repo.getUserCount(privilegedDb, existingOrg.id);

          if (userCount > 0 && !force) {
            // Soft delete by deactivating
            const deactivated = await repo.softDelete(privilegedDb, existingOrg.id);

            if (deactivated) {
              await repo.logAudit(
                privilegedDb,
                deactivated.id,
                parseInt(service.userId),
                'SOFT_DELETE',
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
          } else if (force && actor.isSystemUser) {
            // Hard delete if forced by system user
            await repo.hardDelete(privilegedDb, existingOrg.id);

            return {
              deleted: true,
              organization: existingOrg,
              message: 'Organization permanently deleted'
            };
          } else {
            // Soft delete for organizations without users
            const deactivated = await repo.softDelete(privilegedDb, existingOrg.id);

            if (deactivated) {
              await repo.logAudit(
                privilegedDb,
                deactivated.id,
                parseInt(service.userId),
                'SOFT_DELETE',
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
        }, db);
      },
    },

    // -------------------------------------------------------------------------
    // GET ORGANIZATION SETTINGS
    // -------------------------------------------------------------------------
    getSettings: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgGetSettingsSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgGetSettingsSchema>>) => {
        // Verify access to the organization
        if (input.orgId !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        return repo.getSettings(db, input.orgId, input.category);
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE ORGANIZATION SETTINGS
    // -------------------------------------------------------------------------
    updateSettings: {
      permission: 'org:update',
      input: orgUpdateSettingsSchema,
      invalidates: ['organizations'],
      entityType: 'organization_settings',
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgUpdateSettingsSchema>>) => {
        // Verify access to the organization
        if (input.orgId !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        const updatedSettings: any[] = [];

        for (const setting of input.settings) {
          // Cast to OrgSettingUpdate to ensure type compatibility
          const settingUpdate: import('./types').OrgSettingUpdate = {
            key: setting.key,
            value: setting.value,
            category: setting.category,
            description: setting.description,
          };
          const result = await repo.updateSetting(db, input.orgId, settingUpdate, parseInt(service.userId));
          updatedSettings.push(result.updated);

          // Log audit event
          await repo.logAudit(
            db,
            input.orgId,
            parseInt(service.userId),
            'SETTINGS_UPDATE',
            'settings',
            setting.key,
            result.isNew ? null : { before: { value: result.updated.value }, after: { value: setting.value } },
            { action: result.isNew ? 'created' : 'updated' }
          );
        }

        return {
          updated: updatedSettings.length,
          settings: updatedSettings,
        };
      },
    },

    // -------------------------------------------------------------------------
    // GET COPILOT STATUS
    // -------------------------------------------------------------------------
    getCopilotStatus: {
      type: 'query' as const,
      repository: Repository,
      handler: async ({ service, repo, db }: OrgHandlerContext) => {
        if (!service.orgId) {
          return { copilotEnabled: true };
        }

        const org = await repo.findById(db, service.orgId);
        return { copilotEnabled: org?.copilotEnabled ?? true };
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE COPILOT STATUS (system only)
    // -------------------------------------------------------------------------
    updateCopilotStatus: {
      permission: 'admin:manage',
      input: orgUpdateCopilotStatusSchema,
      invalidates: ['organizations'],
      entityType: 'organization',
      repository: Repository,
      handler: async ({ input, repo, db }: OrgHandlerContext<z.infer<typeof orgUpdateCopilotStatusSchema>>) => {
        return executePrivileged(async (privilegedDb) => {
          const existingOrg = await repo.findById(privilegedDb, input.orgId);

          if (!existingOrg) {
            throw new OrgRouterError('NOT_FOUND', 'Organization not found');
          }

          const updatedOrg = await repo.update(privilegedDb, input.orgId, { copilotEnabled: input.copilotEnabled });

          return { success: true, copilotEnabled: updatedOrg!.copilotEnabled };
        }, db);
      },
    },

    // -------------------------------------------------------------------------
    // GET ORGANIZATION ANALYTICS
    // -------------------------------------------------------------------------
    getAnalytics: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgAnalyticsSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgAnalyticsSchema>>) => {
        // Verify access to the organization
        if (input.orgId !== service.orgId && !actor.isSystemUser) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization analytics');
        }

        return repo.getAnalytics(db, input.orgId, input.startDate, input.endDate, input.compareWithOrgs);
      },
    },

    // -------------------------------------------------------------------------
    // GET AUDIT LOGS
    // -------------------------------------------------------------------------
    getAuditLogs: {
      type: 'query' as const,
      permission: 'org:read',
      input: orgAuditLogsSchema,
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgAuditLogsSchema>>) => {
        const targetOrgId = input.orgId || service.orgId;

        const getAuditLogs = async (targetDb: any) => {
          return repo.getAuditLogs(targetDb, {
            page: input.page,
            pageSize: input.pageSize,
            filters: {
              orgId: input.crossOrgAccess ? input.orgId : targetOrgId,
              action: input.action,
              entityType: input.entityType,
              userId: input.userId,
              startDate: input.startDate,
              endDate: input.endDate,
            },
          });
        };

        if (input.crossOrgAccess && actor.isSystemUser) {
          return executePrivileged(getAuditLogs, db);
        }

        return getAuditLogs(db);
      },
    },

    // -------------------------------------------------------------------------
    // ENSURE DEFAULT ORGANIZATION EXISTS
    // -------------------------------------------------------------------------
    ensureDefault: {
      permission: 'admin:manage',
      repository: Repository,
      handler: async ({ service, repo, db }: OrgHandlerContext) => {
        return executePrivileged(async (privilegedDb) => {
          const existingOrgs = await repo.list(privilegedDb, {
            page: 1,
            pageSize: 1,
            sortBy: 'createdAt',
            sortOrder: 'asc',
            filters: {},
            includeStats: false,
          });

          if (existingOrgs.organizations.length === 0) {
            const defaultOrg = await repo.create(privilegedDb, {
              name: 'Default Organization',
              description: 'Default org for initial setup',
              slug: 'default-org',
            });

            // Copy role templates if hook provided
            if (deps.copyRoleTemplates) {
              await deps.copyRoleTemplates(defaultOrg.id);
            }

            return defaultOrg;
          }

          return existingOrgs.organizations[0];
        }, db);
      },
    },

    // -------------------------------------------------------------------------
    // ADD USER TO ORGANIZATION
    // -------------------------------------------------------------------------
    addUser: {
      permission: 'admin:role_management',
      input: orgAddUserSchema,
      invalidates: ['organizations', 'users'],
      entityType: 'organization_member',
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgAddUserSchema>>) => {
        // Verify access to the organization
        if (input.orgId !== service.orgId && !actor.isSystemUser && !input.crossOrgAccess) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        // Log audit event
        await repo.logAudit(
          db,
          input.orgId,
          parseInt(service.userId),
          'MEMBER_ADD',
          'user',
          String(input.userId),
          null,
          { role: input.role }
        );

        return { success: true, orgId: input.orgId, userId: input.userId };
      },
    },

    // -------------------------------------------------------------------------
    // REMOVE USER FROM ORGANIZATION
    // -------------------------------------------------------------------------
    removeUser: {
      permission: 'admin:role_management',
      input: orgRemoveUserSchema,
      invalidates: ['organizations', 'users'],
      entityType: 'organization_member',
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgRemoveUserSchema>>) => {
        // Verify access to the organization
        if (input.orgId !== service.orgId && !actor.isSystemUser && !input.crossOrgAccess) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        // Log audit event
        await repo.logAudit(
          db,
          input.orgId,
          parseInt(service.userId),
          'MEMBER_REMOVE',
          'user',
          String(input.userId),
          null,
          null
        );

        return { success: true, orgId: input.orgId, userId: input.userId };
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE USER ROLE IN ORGANIZATION
    // -------------------------------------------------------------------------
    updateUserRole: {
      permission: 'admin:role_management',
      input: orgUpdateUserRoleSchema,
      invalidates: ['organizations', 'users'],
      entityType: 'organization_member',
      repository: Repository,
      handler: async ({ input, service, actor, repo, db }: OrgHandlerContext<z.infer<typeof orgUpdateUserRoleSchema>>) => {
        // Verify access to the organization
        if (input.orgId !== service.orgId && !actor.isSystemUser && !input.crossOrgAccess) {
          throw new OrgRouterError('FORBIDDEN', 'Access denied to this organization');
        }

        // Log audit event
        await repo.logAudit(
          db,
          input.orgId,
          parseInt(service.userId),
          'ROLE_CHANGE',
          'user',
          String(input.userId),
          null,
          { newRole: input.role }
        );

        return { success: true, orgId: input.orgId, userId: input.userId, role: input.role };
      },
    },
  };
}

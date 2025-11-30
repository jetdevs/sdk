/**
 * Organization Management Module
 *
 * Provides organization management infrastructure including:
 * - Type definitions for organizations, settings, and audit logs
 * - Zod validation schemas for API input
 * - Repository factory for database operations
 * - Service factory for business logic
 * - Router configuration factory for tRPC integration
 *
 * @module @yobolabs/core/organizations
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Organization records
  OrgRecord,
  OrgWithStats,
  OrgStats,
  OrgUserCount,

  // Settings types
  OrgSetting,
  OrgSettingUpdate,

  // Audit log types
  OrgAuditLogRecord,

  // Filter and options
  OrgFilters,
  OrgListOptions,
  AuditLogFilters,
  AuditLogOptions,

  // Input data
  OrgCreateData,
  OrgUpdateData,

  // Results
  OrgListResult,
  AuditLogListResult,
  OrgDeleteResult,

  // Analytics
  OrgAnalytics,

  // User types
  OrgUser,

  // UI types (for backward compatibility)
  OrganizationWithStats,
  OrganizationDetails,
  OrganizationUserManagement,
  OrganizationListResponse,
  OrganizationStatus,
  OrganizationRole,
} from './types';

// Constants
export {
  ORGANIZATION_STATUS,
  ORGANIZATION_ROLES,
} from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export {
  // List/filter schemas
  orgListSchema,
  orgGetByIdSchema,
  orgGetByUuidSchema,

  // CRUD schemas
  orgCreateSchema,
  orgUpdateSchema,
  orgUpdateCurrentSchema,
  orgDeleteSchema,
  orgCreateForUserSchema,

  // Analytics/stats schemas
  orgAnalyticsSchema,
  orgStatsSchema,
  orgGetAllWithStatsSchema,

  // Settings schemas
  orgGetSettingsSchema,
  orgUpdateSettingsSchema,

  // Audit log schemas
  orgAuditLogsSchema,

  // Copilot schemas
  orgCopilotStatusSchema,
  orgUpdateCopilotStatusSchema,

  // User management schemas
  orgAddUserSchema,
  orgRemoveUserSchema,
  orgUpdateUserRoleSchema,

  // Utility schemas
  orgEnsureDefaultSchema,
  orgGetCurrentSchema,
  orgCountSchema,
  orgGetAllSchema,
} from './schemas';

export type {
  OrgListInput,
  OrgGetByIdInput,
  OrgGetByUuidInput,
  OrgCreateInput,
  OrgUpdateInput,
  OrgUpdateCurrentInput,
  OrgDeleteInput,
  OrgCreateForUserInput,
  OrgAnalyticsInput,
  OrgStatsInput,
  OrgGetAllWithStatsInput,
  OrgGetSettingsInput,
  OrgUpdateSettingsInput,
  OrgAuditLogsInput,
  OrgCopilotStatusInput,
  OrgUpdateCopilotStatusInput,
  OrgAddUserInput,
  OrgRemoveUserInput,
  OrgUpdateUserRoleInput,
  OrgEnsureDefaultInput,
  OrgGetCurrentInput,
  OrgCountInput,
  OrgGetAllInput,
} from './schemas';

// =============================================================================
// REPOSITORY
// =============================================================================

export {
  createOrgRepositoryClass,
} from './repository';

export type {
  OrgRepositorySchema,
  IOrgRepository,
} from './repository';

// =============================================================================
// SERVICE
// =============================================================================

export {
  createOrgServiceClass,
  OrgServiceError,
  OrgAuditActions,
} from './service';

export type {
  OrgActor,
  OrgServiceContext,
  OrgServiceHooks,
  IOrgService,
  OrgListParams,
  OrgGetByIdParams,
  OrgGetAllWithStatsParams,
  OrgUpdateParams,
  OrgUpdateCurrentParams,
  OrgDeleteParams,
  OrgGetSettingsParams,
  OrgUpdateSettingsParams,
  OrgAnalyticsParams,
  OrgAuditLogsParams,
  OrgWithDetails,
} from './service';

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
  createOrgRouterConfig,
  OrgRouterError,
} from './router-config';

export type {
  OrgRouterDeps,
  OrgServiceContext as OrgRouterServiceContext,
  OrgHandlerContext,
} from './router-config';

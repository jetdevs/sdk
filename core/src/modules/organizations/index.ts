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
 * @module @jetdevs/core/organizations
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
    AuditLogFilters, AuditLogListResult, AuditLogOptions,
    // Analytics
    OrgAnalytics,
    // Audit log types
    OrgAuditLogRecord,
    // Input data
    OrgCreateData, OrgDeleteResult,
    // Filter and options
    OrgFilters,
    OrgListOptions,
    // Results
    OrgListResult,
    // Organization records
    OrgRecord,
    // Settings types
    OrgSetting,
    OrgSettingUpdate, OrgStats, OrgUpdateData,
    // User types
    OrgUser, OrgUserCount, OrgWithStats, OrganizationDetails, OrganizationListResponse, OrganizationRole, OrganizationStatus, OrganizationUserManagement,
    // UI types (for backward compatibility)
    OrganizationWithStats
} from './types';

// Constants
export {
    ORGANIZATION_ROLES, ORGANIZATION_STATUS
} from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export {

    // User management schemas
    orgAddUserSchema,
    // Analytics/stats schemas
    orgAnalyticsSchema,
    // Audit log schemas
    orgAuditLogsSchema,

    // Copilot schemas
    orgCopilotStatusSchema, orgCountSchema, orgCreateForUserSchema,
    // CRUD schemas
    orgCreateSchema, orgDeleteSchema,
    // Utility schemas
    orgEnsureDefaultSchema, orgGetAllSchema, orgGetAllWithStatsSchema, orgGetByIdSchema,
    orgGetByUuidSchema, orgGetCurrentSchema,
    // Settings schemas
    orgGetSettingsSchema,
    // List/filter schemas
    orgListSchema, orgRemoveUserSchema, orgStatsSchema, orgUpdateCopilotStatusSchema, orgUpdateCurrentSchema, orgUpdateSchema, orgUpdateSettingsSchema, orgUpdateUserRoleSchema
} from './schemas';

export type {
    OrgAddUserInput, OrgAnalyticsInput, OrgAuditLogsInput,
    OrgCopilotStatusInput, OrgCountInput, OrgCreateForUserInput, OrgCreateInput, OrgDeleteInput, OrgEnsureDefaultInput, OrgGetAllInput, OrgGetAllWithStatsInput, OrgGetByIdInput,
    OrgGetByUuidInput, OrgGetCurrentInput, OrgGetSettingsInput, OrgListInput, OrgRemoveUserInput, OrgStatsInput, OrgUpdateCopilotStatusInput, OrgUpdateCurrentInput, OrgUpdateInput, OrgUpdateSettingsInput, OrgUpdateUserRoleInput
} from './schemas';

// =============================================================================
// REPOSITORY
// =============================================================================

export {
    createOrgRepositoryClass
} from './repository';

export type {
    IOrgRepository, OrgRepositorySchema
} from './repository';

// =============================================================================
// SERVICE
// =============================================================================

export {
    OrgAuditActions, OrgServiceError, createOrgServiceClass
} from './service';

export type {
    IOrgService, OrgActor, OrgAnalyticsParams,
    OrgAuditLogsParams, OrgDeleteParams, OrgGetAllWithStatsParams, OrgGetByIdParams, OrgGetSettingsParams, OrgListParams, OrgServiceContext,
    OrgServiceHooks, OrgUpdateCurrentParams, OrgUpdateParams, OrgUpdateSettingsParams, OrgWithDetails
} from './service';

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
    OrgRouterError, createOrgRouterConfig
} from './router-config';

export type {
    OrgHandlerContext, OrgRouterDeps,
    OrgServiceContext as OrgRouterServiceContext
} from './router-config';


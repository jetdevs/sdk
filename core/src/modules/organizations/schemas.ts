/**
 * Organization Schemas
 *
 * Zod validation schemas for organization management operations.
 *
 * @module @yobolabs/core/organizations
 */

import { z } from 'zod';

// =============================================================================
// ORGANIZATION LISTING & FILTERING SCHEMAS
// =============================================================================

/**
 * Schema for listing organizations with pagination and filtering
 */
export const orgListSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'userCount']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  crossOrgAccess: z.boolean().default(false),
  includeStats: z.boolean().default(false),
  orgId: z.number().int().positive().optional(),
});

export type OrgListInput = z.infer<typeof orgListSchema>;

/**
 * Schema for getting organization by ID
 */
export const orgGetByIdSchema = z.object({
  id: z.union([z.string().uuid(), z.number().int().positive()]),
  includeStats: z.boolean().default(false),
  includeSettings: z.boolean().default(false),
  includeAuditLogs: z.boolean().default(false),
  auditStartDate: z.date().optional(),
  auditEndDate: z.date().optional(),
  crossOrgAccess: z.boolean().default(false),
  orgId: z.number().int().positive().optional(),
});

export type OrgGetByIdInput = z.infer<typeof orgGetByIdSchema>;

/**
 * Schema for getting organization by UUID
 */
export const orgGetByUuidSchema = z.object({
  uuid: z.string().uuid(),
  crossOrgAccess: z.boolean().default(true).optional(),
  includeUsers: z.boolean().default(true).optional(),
  includeStats: z.boolean().default(false).optional(),
});

export type OrgGetByUuidInput = z.infer<typeof orgGetByUuidSchema>;

// =============================================================================
// ORGANIZATION CRUD SCHEMAS
// =============================================================================

/**
 * Schema for creating new organizations
 */
export const orgCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  slug: z.string().min(1).max(255).optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  businessAddress: z.string().optional(),
  merchantId: z.string().max(255).optional(),
  businessCategory: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  currencySymbol: z.string().max(10).default('$'),
  currencyLocale: z.string().max(10).default('en-US'),
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;

/**
 * Schema for updating existing organizations
 */
export const orgUpdateSchema = z.object({
  id: z.union([z.string().uuid(), z.number().int().positive()]),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  slug: z.string().min(1).max(255).optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  businessAddress: z.string().optional(),
  merchantId: z.string().max(255).optional(),
  businessCategory: z.string().optional(),
  currency: z.string().length(3).optional(),
  currencySymbol: z.string().max(10).optional(),
  currencyLocale: z.string().max(10).optional(),
  isActive: z.boolean().optional(),
  copilotEnabled: z.boolean().optional(),
  crossOrgAccess: z.boolean().optional(),
});

export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;

/**
 * Schema for updating current user's organization
 */
export const orgUpdateCurrentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  businessAddress: z.string().optional(),
  currency: z.string().length(3).optional(),
  currencySymbol: z.string().max(10).optional(),
  currencyLocale: z.string().max(10).optional(),
});

export type OrgUpdateCurrentInput = z.infer<typeof orgUpdateCurrentSchema>;

/**
 * Schema for deleting organizations
 */
export const orgDeleteSchema = z.object({
  id: z.union([z.string().uuid(), z.number().int().positive()]),
  force: z.boolean().default(false),
});

export type OrgDeleteInput = z.infer<typeof orgDeleteSchema>;

/**
 * Schema for creating organization for regular user
 */
export const orgCreateForUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
});

export type OrgCreateForUserInput = z.infer<typeof orgCreateForUserSchema>;

// =============================================================================
// ORGANIZATION ANALYTICS SCHEMAS
// =============================================================================

/**
 * Schema for getting organization analytics
 */
export const orgAnalyticsSchema = z.object({
  orgId: z.number().int().positive(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  compareWithOrgs: z.array(z.number().int().positive()).optional(),
});

export type OrgAnalyticsInput = z.infer<typeof orgAnalyticsSchema>;

/**
 * Schema for getting organization stats
 */
export const orgStatsSchema = z.object({
  orgId: z.number(),
  crossOrgAccess: z.boolean().default(true).optional(),
});

export type OrgStatsInput = z.infer<typeof orgStatsSchema>;

/**
 * Schema for getting all organizations with statistics
 */
export const orgGetAllWithStatsSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

export type OrgGetAllWithStatsInput = z.infer<typeof orgGetAllWithStatsSchema>;

// =============================================================================
// ORGANIZATION SETTINGS SCHEMAS
// =============================================================================

/**
 * Schema for getting organization settings
 */
export const orgGetSettingsSchema = z.object({
  orgId: z.number().int().positive(),
  category: z.string().optional(),
});

export type OrgGetSettingsInput = z.infer<typeof orgGetSettingsSchema>;

/**
 * Schema for updating organization settings
 */
export const orgUpdateSettingsSchema = z.object({
  orgId: z.number().int().positive(),
  settings: z.array(z.object({
    key: z.string().min(1).max(100),
    value: z.unknown(), // Required value field - use unknown to allow any JSON value
    category: z.string().optional(),
    description: z.string().optional(),
  })),
});

export type OrgUpdateSettingsInput = z.infer<typeof orgUpdateSettingsSchema>;

// =============================================================================
// AUDIT LOG SCHEMAS
// =============================================================================

/**
 * Schema for getting audit logs
 */
export const orgAuditLogsSchema = z.object({
  orgId: z.number().int().positive().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.number().int().positive().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  crossOrgAccess: z.boolean().default(false),
});

export type OrgAuditLogsInput = z.infer<typeof orgAuditLogsSchema>;

// =============================================================================
// COPILOT STATUS SCHEMAS
// =============================================================================

/**
 * Schema for getting copilot status (empty, uses current org context)
 */
export const orgCopilotStatusSchema = z.object({}).optional();

export type OrgCopilotStatusInput = z.infer<typeof orgCopilotStatusSchema>;

/**
 * Schema for updating copilot status
 */
export const orgUpdateCopilotStatusSchema = z.object({
  orgId: z.number().int().positive(),
  copilotEnabled: z.boolean(),
});

export type OrgUpdateCopilotStatusInput = z.infer<typeof orgUpdateCopilotStatusSchema>;

// =============================================================================
// USER MANAGEMENT SCHEMAS
// =============================================================================

/**
 * Schema for adding user to organization
 */
export const orgAddUserSchema = z.object({
  orgId: z.number().int().positive(),
  userId: z.number().int().positive(),
  role: z.string().min(1, 'Role is required'),
  crossOrgAccess: z.boolean().default(false),
});

export type OrgAddUserInput = z.infer<typeof orgAddUserSchema>;

/**
 * Schema for removing user from organization
 */
export const orgRemoveUserSchema = z.object({
  orgId: z.number().int().positive(),
  userId: z.number().int().positive(),
  crossOrgAccess: z.boolean().default(false),
});

export type OrgRemoveUserInput = z.infer<typeof orgRemoveUserSchema>;

/**
 * Schema for updating user role in organization
 */
export const orgUpdateUserRoleSchema = z.object({
  orgId: z.number().int().positive(),
  userId: z.number().int().positive(),
  role: z.string().min(1, 'Role is required'),
  crossOrgAccess: z.boolean().default(false),
});

export type OrgUpdateUserRoleInput = z.infer<typeof orgUpdateUserRoleSchema>;

// =============================================================================
// UTILITY SCHEMAS
// =============================================================================

/**
 * Schema for ensuring default org exists
 */
export const orgEnsureDefaultSchema = z.object({}).optional();

export type OrgEnsureDefaultInput = z.infer<typeof orgEnsureDefaultSchema>;

/**
 * Schema for getting current organization
 */
export const orgGetCurrentSchema = z.object({}).optional();

export type OrgGetCurrentInput = z.infer<typeof orgGetCurrentSchema>;

/**
 * Schema for counting organizations
 */
export const orgCountSchema = z.object({}).optional();

export type OrgCountInput = z.infer<typeof orgCountSchema>;

/**
 * Schema for getting all active organizations
 */
export const orgGetAllSchema = z.object({}).optional();

export type OrgGetAllInput = z.infer<typeof orgGetAllSchema>;

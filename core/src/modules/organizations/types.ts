/**
 * Organization Types
 *
 * Type definitions for organization management operations.
 *
 * @module @yobolabs/core/organizations
 */

// =============================================================================
// ORGANIZATION RECORD TYPES
// =============================================================================

/**
 * Organization record as stored in database
 */
export interface OrgRecord {
  id: number;
  uuid: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  businessAddress?: string | null;
  merchantId?: string | null;
  businessCategory?: string | null;
  defaultCategoryTreeId?: number | null;
  currency: string;
  currencySymbol: string;
  currencyLocale: string;
  copilotEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organization with user statistics
 */
export interface OrgWithStats extends OrgRecord {
  userCount: number;
  activeUserCount: number;
  roleCount: number;
}

/**
 * Organization statistics breakdown
 */
export interface OrgStats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  roleDistribution: Array<{
    roleName: string;
    userCount: number;
  }>;
}

/**
 * Organization user count info
 */
export interface OrgUserCount {
  orgId: number;
  totalUsers: number;
  activeUsers: number;
}

// =============================================================================
// ORGANIZATION SETTINGS TYPES
// =============================================================================

/**
 * Organization setting record
 */
export interface OrgSetting {
  id: number;
  uuid: string;
  orgId: number;
  key: string;
  value: unknown;
  category?: string | null;
  dataType?: string | null;
  description?: string | null;
  validation?: unknown | null;
  defaultValue?: unknown | null;
  isRequired: boolean;
  isSystem: boolean;
  isSecret: boolean;
  requiresAdminRole: boolean;
  requiresSystemRole: boolean;
  lastModifiedBy?: number | null;
  lastModifiedAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Setting update input
 */
export interface OrgSettingUpdate {
  key: string;
  value: unknown;
  category?: string;
  description?: string;
}

// =============================================================================
// ORGANIZATION AUDIT TYPES
// =============================================================================

/**
 * Organization audit log record
 */
export interface OrgAuditLogRecord {
  id: number;
  uuid: string;
  orgId: number;
  userId?: number | null;
  userEmail?: string | null;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  changes?: unknown | null;
  metadata?: unknown | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  performedAt: Date;
  createdAt: Date;
}

// =============================================================================
// FILTER AND OPTIONS TYPES
// =============================================================================

/**
 * Organization filter options
 */
export interface OrgFilters {
  search?: string;
  isActive?: boolean;
  crossOrgAccess?: boolean;
}

/**
 * Organization list options with pagination
 */
export interface OrgListOptions {
  page: number;
  pageSize: number;
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'userCount';
  sortOrder: 'asc' | 'desc';
  filters: OrgFilters;
  includeStats?: boolean;
}

/**
 * Audit log filter options
 */
export interface AuditLogFilters {
  orgId?: number | null;
  action?: string;
  entityType?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Audit log list options
 */
export interface AuditLogOptions {
  page: number;
  pageSize: number;
  filters: AuditLogFilters;
}

// =============================================================================
// INPUT DATA TYPES
// =============================================================================

/**
 * Data for creating a new organization
 */
export interface OrgCreateData {
  name: string;
  description?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  businessAddress?: string | null;
  merchantId?: string | null;
  businessCategory?: string | null;
  currency?: string;
  currencySymbol?: string;
  currencyLocale?: string;
}

/**
 * Data for updating an organization
 */
export interface OrgUpdateData extends Partial<OrgCreateData> {
  isActive?: boolean;
  copilotEnabled?: boolean;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result from organization list operations
 */
export interface OrgListResult {
  organizations: OrgWithStats[] | OrgRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Result from audit log list operations
 */
export interface AuditLogListResult {
  auditLogs: OrgAuditLogRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Result from delete operations
 */
export interface OrgDeleteResult {
  deleted: boolean;
  deactivated?: boolean;
  organization?: OrgRecord | null;
  message: string;
}

// =============================================================================
// ORGANIZATION ANALYTICS TYPES
// =============================================================================

/**
 * Organization analytics data
 */
export interface OrgAnalytics {
  organization: {
    id: number;
    name: string;
    isActive: boolean;
  };
  period: {
    startDate?: Date;
    endDate?: Date;
  };
  userMetrics: {
    growth: Array<{
      date: string;
      newUsers: number;
      cumulativeUsers: number;
    }>;
  };
  activityMetrics: {
    totalActions: number;
    uniqueUsers: number;
    avgActionsPerUser: number;
    topActions: Array<{
      action: string;
      count: number;
    }>;
  };
  comparison?: Array<{
    orgId: number;
    orgName: string;
    userCount: number;
    roleCount: number;
    isActive: boolean;
    isTarget: boolean;
  }>;
}

// =============================================================================
// ORGANIZATION USER TYPES
// =============================================================================

/**
 * User within an organization
 */
export interface OrgUser {
  userId: number;
  userUuid?: string;
  userName?: string | null;
  userEmail?: string | null;
  userIsActive: boolean;
  relationshipIsActive: boolean;
  orgRole?: string | null;
  roleId: number;
  joinedAt?: Date;
}

// =============================================================================
// ORGANIZATION UI TYPES
// =============================================================================

/**
 * Organization with stats and _count property for UI compatibility
 * @deprecated Use OrgWithStats instead when possible
 */
export interface OrganizationWithStats extends OrgRecord {
  userCount: number;
  activeUserCount: number;
  _count: {
    users: number;
  };
}

/**
 * Organization details with user list
 */
export interface OrganizationDetails extends OrganizationWithStats {
  users: OrgUser[];
}

/**
 * Organization user management request
 */
export interface OrganizationUserManagement {
  orgId: number;
  userId: number;
  role: string;
}

/**
 * Legacy organization list response
 */
export interface OrganizationListResponse {
  orgs: OrganizationWithStats[];
  totalCount: number;
  hasMore: boolean;
}

// =============================================================================
// ORGANIZATION CONSTANTS
// =============================================================================

/**
 * Organization status options
 */
export const ORGANIZATION_STATUS = {
  ACTIVE: true,
  INACTIVE: false,
} as const;

export type OrganizationStatus = typeof ORGANIZATION_STATUS[keyof typeof ORGANIZATION_STATUS];

/**
 * Common organization role names
 */
export const ORGANIZATION_ROLES = [
  'Admin',
  'Manager',
  'Member',
  'Viewer',
] as const;

export type OrganizationRole = typeof ORGANIZATION_ROLES[number];

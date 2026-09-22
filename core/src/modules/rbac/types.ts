/**
 * RBAC Types
 *
 * Type definitions for Role-Based Access Control system.
 * These are framework-agnostic and can be used across any SaaS application.
 *
 * @module @jetdevs/core/rbac
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// =============================================================================
// ROLE CATEGORY
// =============================================================================

/**
 * Role Category Type
 *
 * Distinguishes between roles for human users and roles for programmatic access:
 * - 'user': Roles intended for human users (shown in user role assignment)
 * - 'service': Roles intended for API keys/integrations (shown in API key creation)
 */
export type RoleCategory = 'user' | 'service';

// =============================================================================
// ROLE TYPES
// =============================================================================

/**
 * Base role interface
 */
export interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isGlobalRole: boolean;
  isActive: boolean;
  orgId: number | null;
  /** Role category - 'user' for human users, 'service' for API keys */
  roleCategory?: RoleCategory;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Role with statistics (user count, permission count)
 * For backward compatibility, stats can be nested or flat
 */
export interface RoleWithStats extends Role {
  stats?: RoleStats;
  permissions?: RolePermission[];
  // Flat stats properties for backward compatibility
  userCount?: number;
  permissionCount?: number;
}

/**
 * Role statistics
 */
export interface RoleStats {
  userCount: number;
  permissionCount: number;
}

/**
 * Permission attached to a role
 */
export interface RolePermission {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
}

/**
 * Role filter options
 */
export interface RoleFilters {
  search?: string;
  isActive?: boolean;
  isSystemRole?: boolean;
  isGlobalRole?: boolean;
  orgId?: number;
}

/**
 * Role list options for pagination and filtering
 */
export interface RoleListOptions {
  limit: number;
  offset: number;
  filters: RoleFilters;
  includeStats?: boolean;
  includePermissions?: boolean;
  orgId?: number;
  includeSystemRoles?: boolean;
}

/**
 * Role creation data
 */
export interface RoleCreateData {
  name: string;
  description?: string;
  isSystemRole?: boolean;
  isGlobalRole?: boolean;
  isActive?: boolean;
  orgId?: number | null;
}

/**
 * Role update data
 */
export interface RoleUpdateData extends Partial<RoleCreateData> {
  id: number;
}

/**
 * Role permission assignment data
 */
export interface RolePermissionAssignment {
  roleId: number;
  permissionIds: number[];
  orgId: number | null;
}

/**
 * User role statistics
 */
export interface UserRoleStats {
  roleId: number;
  userCount: number;
}

/**
 * Role permission statistics
 */
export interface RolePermissionStats {
  roleId: number;
  permissionCount: number;
}

// =============================================================================
// PERMISSION TYPES
// =============================================================================

/**
 * Base permission interface
 */
export interface Permission {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Permission with role usage information
 */
export interface PermissionWithUsage extends Permission {
  roleCount: number;
  roles: Array<{
    roleId: number;
    roleName: string;
    isSystemRole: boolean;
  }>;
}

/**
 * Permission creation data
 */
export interface PermissionCreateData {
  slug: string;
  name: string;
  description?: string | null;
  category: string;
  isActive?: boolean;
}

/**
 * Permission update data
 */
export interface PermissionUpdateData {
  name?: string;
  description?: string | null;
  category?: string;
  isActive?: boolean;
}

/**
 * Category count for permission stats
 */
export interface CategoryCount {
  category: string | null;
  count: number;
}

/**
 * Permission statistics
 */
export interface PermissionStats {
  totalPermissions: number;
  categoryCounts: CategoryCount[];
  mostUsedPermissions: Array<{
    permissionId: number;
    slug: string;
    name: string;
    roleCount: number;
  }>;
}

// =============================================================================
// SERVICE CONTEXT TYPES
// =============================================================================

/**
 * Actor performing the operation
 *
 * This type aligns with the framework's Actor type from @jetdevs/framework/auth/actor
 */
export interface Actor {
  userId: number;
  email?: string;
  orgId: number | null;
  /** Role names (simplified from framework Actor) */
  roles: string[];
  isSystemUser?: boolean;
  isSuperUser?: boolean;
  permissions: string[];
  sessionExpiry?: string;
}

/**
 * Service context for RBAC operations
 */
export interface RbacServiceContext {
  db: PostgresJsDatabase<any>;
  actor: Actor;
  orgId: number | null;
  userId: number;
  isSystemUser: boolean;
  permissions: string[];
}

// =============================================================================
// LIST RESULT TYPES
// =============================================================================

/**
 * Role list result with pagination
 */
export interface RoleListResult {
  roles: RoleWithStats[];
  totalCount: number;
  hasMore: boolean;
}

// =============================================================================
// SERVICE PARAMS TYPES
// =============================================================================

/**
 * Parameters for listing roles
 */
export interface RoleListParams {
  limit?: number;
  offset?: number;
  search?: string;
  isActive?: boolean;
  isSystemRole?: boolean;
  includeStats?: boolean;
  includePermissions?: boolean;
}

/**
 * Parameters for getting role by ID
 */
export interface RoleGetByIdParams {
  id: number;
  includeStats?: boolean;
  includePermissions?: boolean;
}

/**
 * Parameters for creating a role
 */
export interface RoleCreateParams {
  name: string;
  description?: string;
  isSystemRole?: boolean;
  isActive?: boolean;
}

/**
 * Parameters for updating a role
 */
export interface RoleUpdateParams {
  id: number;
  name?: string;
  description?: string;
  isActive?: boolean;
}

/**
 * Parameters for deleting a role
 */
export interface RoleDeleteParams {
  id: number;
  force?: boolean;
}

/**
 * Parameters for assigning permissions to a role
 */
export interface RoleAssignPermissionsParams {
  roleId: number;
  permissionIds: number[];
}

/**
 * Parameters for removing permissions from a role
 */
export interface RoleRemovePermissionsParams {
  roleId: number;
  permissionIds: number[];
}

/**
 * Parameters for bulk role update
 */
export interface RoleBulkUpdateParams {
  roleIds: number[];
  action: "activate" | "deactivate";
}

/**
 * Parameters for bulk role delete
 */
export interface RoleBulkDeleteParams {
  roleIds: number[];
}

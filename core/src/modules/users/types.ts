/**
 * User Types
 *
 * Type definitions for user management operations.
 *
 * @module @jetdevs/core/users
 */

// =============================================================================
// USER RECORD TYPES
// =============================================================================

/**
 * User record as stored in database
 */
export interface UserRecord {
  id: number;
  uuid: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  username?: string | null;
  password?: string | null;
  isActive: boolean;
  avatar?: string | null;
  sessionTimeoutPreference?: number | null;
  themePreference?: string | null;
  currentOrgId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User with roles attached
 */
export interface UserWithRoles extends UserRecord {
  roles?: UserRole[];
}

/**
 * User with statistics
 */
export interface UserWithStats extends UserWithRoles {
  roleCount: number;
  orgCount: number;
  activeOrgCount: number;
  lastLoginAt: Date | null;
  _count: {
    orgs: number;
    activeOrgs: number;
    roles: number;
  };
}

// =============================================================================
// USER ROLE TYPES
// =============================================================================

/**
 * Role assignment for a user
 */
export interface UserRole {
  id: number | null;
  roleId: number;
  name: string;
  description?: string | null;
  orgId: number | null;
  orgName: string | null;
  isActive: boolean;
  joinedAt: Date;
}

/**
 * User role assignment data for creating/updating
 */
export interface UserRoleAssignment {
  userId: number;
  roleId: number;
  orgId: number;
  isActive?: boolean;
  assignedBy?: number;
  assignedAt?: Date;
}

// =============================================================================
// USER PERMISSION TYPES
// =============================================================================

/**
 * User permission record
 */
export interface UserPermission {
  slug: string;
  name: string;
  description?: string | null;
  module?: string | null;
  isActive: boolean;
}

/**
 * User permissions data (permissions + roles)
 */
export interface UserPermissionsData {
  permissions: string[];
  roles: Array<{
    id: number;
    uuid: string;
    name: string;
    description?: string | null;
    orgId?: number | null;
    isSystemRole: boolean;
    isGlobalRole: boolean;
  }>;
}

// =============================================================================
// FILTER AND OPTIONS TYPES
// =============================================================================

/**
 * User filter options
 */
export interface UserFilters {
  search?: string;
  isActive?: boolean;
  roleId?: number;
  orgId?: number;
  excludeUserId?: number;
}

/**
 * User list options with pagination
 */
export interface UserListOptions {
  limit: number;
  offset: number;
  filters: UserFilters;
  sortBy?: 'name' | 'email' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// INPUT DATA TYPES
// =============================================================================

/**
 * Data for creating a new user
 */
export interface UserCreateData {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  username?: string | null;
  password?: string | null;
  isActive?: boolean;
  avatar?: string | null;
  sessionTimeoutPreference?: number | null;
  currentOrgId?: number | null;
}

/**
 * Data for updating a user
 */
export interface UserUpdateData extends Partial<UserCreateData> {
  themePreference?: string | null;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result from user list operations
 */
export interface UserListResult {
  users: UserWithRoles[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Result from bulk operations
 */
export interface BulkOperationResult {
  updated?: number;
  deleted?: number;
}

// =============================================================================
// UI-SPECIFIC TYPES
// =============================================================================

/**
 * User interface for UI components (simplified from UserRecord)
 */
export interface User {
  id: number;
  uuid: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  password: string | null;
  avatar: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User table column configuration
 */
export interface UserTableColumn {
  key: keyof UserWithStats | 'actions';
  header: string;
  cell?: (info: { getValue: () => unknown; row: { original: UserWithStats } }) => unknown;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  width?: number;
}

/**
 * User form data for create/edit forms
 */
export interface UserFormData {
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  username?: string;
  isActive: boolean;
  password?: string;
}

/**
 * User bulk actions configuration
 */
export interface UserBulkActions {
  selectedIds: number[];
  action: 'activate' | 'deactivate' | 'delete' | 'assignRole' | 'removeRole';
}

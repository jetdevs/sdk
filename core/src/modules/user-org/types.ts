/**
 * User-Organization Types
 *
 * Type definitions for user-organization relationship management.
 * These types define the structure of user-org data and operations.
 */

/**
 * Represents user role data within an organization
 */
export interface UserRoleData {
  orgId: number | null;
  org: OrganizationInfo | null;
  role: RoleInfo;
}

/**
 * Basic organization information
 */
export interface OrganizationInfo {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  isActive?: boolean;
}

/**
 * Basic role information
 */
export interface RoleInfo {
  id: number;
  name: string;
  description?: string;
  isGlobalRole?: boolean;
  isSystemRole?: boolean;
}

/**
 * User's organization data summary
 */
export interface UserOrgData {
  id: number;
  name: string;
  roles: string[];
  roleCount: number;
}

/**
 * Role assignment data structure
 */
export interface RoleAssignmentData {
  userId: number;
  orgId: number | null;
  roleId: number;
  isActive: boolean;
}

/**
 * Current organization context for a user
 */
export interface UserOrgContext {
  orgId: number;
  orgName: string;
  roles: Array<{ id: number; name: string }>;
}

/**
 * User's organization membership details
 */
export interface UserOrgMembership {
  orgId: number;
  orgName: string;
  roleName: string;
  isActive: boolean;
}

/**
 * User permission in organization
 */
export interface UserOrgPermission {
  slug: string;
  name: string;
  description?: string;
  category?: string;
}

/**
 * User in organization listing
 */
export interface OrgUser {
  id: number;
  email: string;
  name?: string | null;
  isActive: boolean;
}

/**
 * Available role for assignment
 */
export interface AssignableRole {
  id: number;
  name: string;
  description?: string;
  isGlobalRole: boolean;
  isSystemRole: boolean;
  orgId: number | null;
}

/**
 * Assignable organization
 */
export interface AssignableOrganization {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  isActive: boolean;
}

/**
 * User role assignment details across organizations
 */
export interface UserRoleAllOrgs {
  id: number;
  userId: number;
  orgId: number | null;
  roleId: number;
  isActive: boolean;
  org: OrganizationInfo | null;
  role: RoleInfo;
}

/**
 * Result of role assignment operation
 */
export interface RoleAssignmentResult {
  success: boolean;
  reactivated?: boolean;
}

/**
 * Input for creating a role assignment
 */
export interface CreateRoleAssignmentInput {
  userId: number;
  orgId: number | null;
  roleId: number;
  assignedBy: number;
}

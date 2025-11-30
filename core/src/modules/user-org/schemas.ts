/**
 * User-Organization Zod Schemas
 *
 * Validation schemas for user-organization operations.
 * These are used for input validation in routers and APIs.
 */

import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

/**
 * Schema for getting current organization context
 * No input required - uses session context
 */
export const getCurrentOrgSchema = z.object({}).optional();

/**
 * Schema for switching organization
 */
export const switchOrgSchema = z.object({
  orgId: z.number().int().positive(),
});

/**
 * Schema for validating organization access
 */
export const validateOrgAccessSchema = z.object({
  orgId: z.number().int().positive(),
});

/**
 * Schema for assigning a role to a user
 */
export const assignRoleSchema = z.object({
  userId: z.number().int().positive(),
  orgId: z.number().int().positive(),
  roleId: z.number().int().positive(),
});

/**
 * Schema for removing a role from a user
 */
export const removeRoleSchema = z.object({
  userId: z.number().int().positive(),
  orgId: z.number().int().positive(),
  roleId: z.number().int().positive(),
});

/**
 * Schema for getting users by role
 */
export const getUsersByRoleSchema = z.object({
  roleId: z.number().int().positive(),
});

/**
 * Schema for getting available roles
 */
export const getAvailableRolesSchema = z.object({
  orgId: z.number().int().positive(),
});

/**
 * Schema for getting user roles across all organizations
 */
export const getUserRolesAllOrgsSchema = z.object({
  userId: z.number().int().positive(),
});

// =============================================================================
// OUTPUT SCHEMAS (for type inference and response validation)
// =============================================================================

/**
 * Schema for organization context response
 */
export const userOrgContextSchema = z.object({
  orgId: z.number(),
  orgName: z.string(),
  roles: z.array(z.object({
    id: z.number(),
    name: z.string(),
  })),
}).nullable();

/**
 * Schema for organization membership
 */
export const userOrgMembershipSchema = z.object({
  orgId: z.number(),
  orgName: z.string(),
  roleName: z.string(),
  isActive: z.boolean(),
});

/**
 * Schema for switch org result
 */
export const switchOrgResultSchema = z.object({
  success: z.boolean(),
});

/**
 * Schema for role assignment result
 */
export const roleAssignmentResultSchema = z.object({
  success: z.boolean(),
  reactivated: z.boolean().optional(),
});

/**
 * Schema for organization access validation result
 */
export const orgAccessResultSchema = z.object({
  hasAccess: z.boolean(),
});

/**
 * Schema for user permission
 */
export const userOrgPermissionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
});

/**
 * Schema for org user
 */
export const orgUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string().nullable().optional(),
  isActive: z.boolean(),
});

/**
 * Schema for assignable role
 */
export const assignableRoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isGlobalRole: z.boolean(),
  isSystemRole: z.boolean(),
  orgId: z.number().nullable(),
});

/**
 * Schema for assignable organization
 */
export const assignableOrganizationSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
});

// =============================================================================
// TYPE INFERENCE
// =============================================================================

export type GetCurrentOrgInput = z.infer<typeof getCurrentOrgSchema>;
export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;
export type ValidateOrgAccessInput = z.infer<typeof validateOrgAccessSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type RemoveRoleInput = z.infer<typeof removeRoleSchema>;
export type GetUsersByRoleInput = z.infer<typeof getUsersByRoleSchema>;
export type GetAvailableRolesInput = z.infer<typeof getAvailableRolesSchema>;
export type GetUserRolesAllOrgsInput = z.infer<typeof getUserRolesAllOrgsSchema>;
export type UserOrgContextOutput = z.infer<typeof userOrgContextSchema>;
export type UserOrgMembershipOutput = z.infer<typeof userOrgMembershipSchema>;
export type SwitchOrgResult = z.infer<typeof switchOrgResultSchema>;
export type RoleAssignmentResultOutput = z.infer<typeof roleAssignmentResultSchema>;
export type OrgAccessResult = z.infer<typeof orgAccessResultSchema>;

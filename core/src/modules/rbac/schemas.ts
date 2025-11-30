/**
 * RBAC Validation Schemas
 *
 * Zod schemas for role and permission operations.
 * These provide validation for RBAC operations.
 *
 * @module @yobolabs/core/rbac
 */

import { z } from "zod";

// =============================================================================
// ROLE SCHEMAS
// =============================================================================

/**
 * Schema for creating a new role
 */
export const createRoleSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional(),
  isSystemRole: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

/**
 * Schema for updating an existing role
 */
export const updateRoleSchema = createRoleSchema.partial().extend({
  id: z.number(),
});

/**
 * Schema for filtering roles list
 */
export const roleFiltersSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  isSystemRole: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

/**
 * Schema for getting role by ID
 */
export const getRoleByIdSchema = z.object({
  id: z.number(),
  crossOrgAccess: z.boolean().default(false),
  orgId: z.number().optional(),
});

/**
 * Schema for getting role with permissions
 */
export const getRoleWithPermissionsSchema = z.object({
  roleId: z.number(),
  crossOrgAccess: z.boolean().default(false),
  orgId: z.number().optional(),
});

/**
 * Schema for assigning permissions to a role
 */
export const assignPermissionsSchema = z.object({
  roleId: z.number(),
  permissionIds: z.array(z.number()),
  crossOrgAccess: z.boolean().default(false),
  orgId: z.number().optional(),
});

/**
 * Schema for removing permissions from a role
 */
export const removePermissionsSchema = z.object({
  roleId: z.number(),
  permissionIds: z.array(z.number()),
  crossOrgAccess: z.boolean().default(false),
  orgId: z.number().optional(),
});

/**
 * Schema for bulk update operations (activate/deactivate)
 */
export const bulkUpdateRolesSchema = z.object({
  roleIds: z.array(z.number()),
  action: z.enum(["activate", "deactivate"]),
});

/**
 * Schema for bulk delete operations
 */
export const bulkDeleteRolesSchema = z.object({
  roleIds: z.array(z.number()),
});

/**
 * Schema for deleting a single role
 */
export const deleteRoleSchema = z.number();

/**
 * Schema for copying a role to another organization
 */
export const copyRoleSchema = z.object({
  sourceRoleId: z.number(),
  targetOrgId: z.number(),
  newName: z.string().optional(),
});

// =============================================================================
// PERMISSION SCHEMAS
// =============================================================================

/**
 * Schema for creating a new permission
 */
export const createPermissionSchema = z.object({
  slug: z.string().min(1, "Slug is required").max(100),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(500).optional(),
  category: z.string().min(1, "Category is required").max(100),
  isActive: z.boolean().default(true),
});

/**
 * Schema for updating a permission
 */
export const updatePermissionSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Schema for filtering permissions list
 */
export const permissionFiltersSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Schema for getting permission by ID
 */
export const getPermissionByIdSchema = z.object({
  id: z.number(),
});

/**
 * Schema for getting permission by slug
 */
export const getPermissionBySlugSchema = z.object({
  slug: z.string(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type RoleFiltersInput = z.infer<typeof roleFiltersSchema>;
export type GetRoleByIdInput = z.infer<typeof getRoleByIdSchema>;
export type GetRoleWithPermissionsInput = z.infer<typeof getRoleWithPermissionsSchema>;
export type AssignPermissionsInput = z.infer<typeof assignPermissionsSchema>;
export type RemovePermissionsInput = z.infer<typeof removePermissionsSchema>;
export type BulkUpdateRolesInput = z.infer<typeof bulkUpdateRolesSchema>;
export type BulkDeleteRolesInput = z.infer<typeof bulkDeleteRolesSchema>;
export type CopyRoleInput = z.infer<typeof copyRoleSchema>;

export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
export type PermissionFiltersInput = z.infer<typeof permissionFiltersSchema>;
export type GetPermissionByIdInput = z.infer<typeof getPermissionByIdSchema>;
export type GetPermissionBySlugInput = z.infer<typeof getPermissionBySlugSchema>;

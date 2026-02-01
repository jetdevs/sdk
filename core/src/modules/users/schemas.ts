/**
 * User Schemas
 *
 * Zod validation schemas for user management operations.
 *
 * @module @jetdevs/core/users
 */

import { z } from 'zod';

// =============================================================================
// FILTER SCHEMAS
// =============================================================================

export const userFiltersSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  roleId: z.number().optional(),
  orgId: z.number().optional(),
});

export type UserFiltersInput = z.infer<typeof userFiltersSchema>;

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const userCreateSchema = z.object({
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  isActive: z.boolean().default(true),
  roleId: z.number().optional(),
  orgId: z.number().optional(),
}).transform((data) => {
  // If name is not provided but firstName/lastName are, derive name from them
  if (!data.name && (data.firstName || data.lastName)) {
    return {
      ...data,
      name: [data.firstName, data.lastName].filter(Boolean).join(' ').trim() || undefined,
    };
  }
  return data;
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
  avatar: z.string().optional().nullable(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// =============================================================================
// ROLE ASSIGNMENT SCHEMAS
// =============================================================================

export const assignRoleSchema = z.object({
  userId: z.number(),
  roleId: z.number(),
  orgId: z.number().optional(),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const removeRoleSchema = z.object({
  userId: z.number(),
  roleId: z.number(),
  orgId: z.number().optional(),
});

export type RemoveRoleInput = z.infer<typeof removeRoleSchema>;

export const removeFromOrgSchema = z.object({
  userId: z.number(),
  orgId: z.number().optional(),
});

export type RemoveFromOrgInput = z.infer<typeof removeFromOrgSchema>;

// =============================================================================
// USER SETTINGS SCHEMAS
// =============================================================================

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateSessionPreferenceSchema = z.object({
  sessionTimeoutMinutes: z.number().min(5).max(480),
});

export type UpdateSessionPreferenceInput = z.infer<typeof updateSessionPreferenceSchema>;

export const updateThemePreferenceSchema = z.object({
  theme: z.string().min(1),
});

export type UpdateThemePreferenceInput = z.infer<typeof updateThemePreferenceSchema>;

// =============================================================================
// UTILITY SCHEMAS
// =============================================================================

export const checkUsernameSchema = z.object({
  username: z.string().min(3),
  excludeUserId: z.number().optional(),
});

export type CheckUsernameInput = z.infer<typeof checkUsernameSchema>;

// =============================================================================
// BULK OPERATION SCHEMAS
// =============================================================================

export const userBulkUpdateSchema = z.object({
  userIds: z.array(z.number()),
  isActive: z.boolean().optional(),
});

export type UserBulkUpdateInput = z.infer<typeof userBulkUpdateSchema>;

export const userBulkDeleteSchema = z.object({
  userIds: z.array(z.number()),
});

export type UserBulkDeleteInput = z.infer<typeof userBulkDeleteSchema>;

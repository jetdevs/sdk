/**
 * Org Membership Schemas
 *
 * Zod validation schemas for org membership operations.
 *
 * @module @jetdevs/core/org-membership
 */

import { z } from 'zod';

// =============================================================================
// STATUS ENUM
// =============================================================================

export const orgMemberStatusSchema = z.enum(['invited', 'active', 'suspended', 'removed']);

// =============================================================================
// LIST / QUERY SCHEMAS
// =============================================================================

export const orgMemberListSchema = z.object({
  status: z.array(orgMemberStatusSchema).optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type OrgMemberListInput = z.infer<typeof orgMemberListSchema>;

// =============================================================================
// MUTATION SCHEMAS
// =============================================================================

export const inviteByEmailSchema = z.object({
  email: z.string().email(),
  roleId: z.number().optional(),
});

export type InviteByEmailInput = z.infer<typeof inviteByEmailSchema>;

export const inviteExistingUserSchema = z.object({
  userId: z.number(),
  roleId: z.number().optional(),
});

export type InviteExistingUserInput = z.infer<typeof inviteExistingUserSchema>;

export const acceptSchema = z.object({
  orgId: z.number(),
});

export type AcceptInput = z.infer<typeof acceptSchema>;

export const suspendSchema = z.object({
  userId: z.number(),
});

export type SuspendInput = z.infer<typeof suspendSchema>;

export const unsuspendSchema = z.object({
  userId: z.number(),
});

export type UnsuspendInput = z.infer<typeof unsuspendSchema>;

export const removeSchema = z.object({
  userId: z.number(),
});

export type RemoveInput = z.infer<typeof removeSchema>;

export const reinviteSchema = z.object({
  userId: z.number(),
  roleId: z.number().optional(),
});

export type ReinviteInput = z.infer<typeof reinviteSchema>;

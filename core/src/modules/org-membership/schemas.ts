/**
 * Org Membership Schemas
 *
 * Zod validation schemas for org membership operations.
 *
 * @module @jetdevs/core/org-membership
 */

import { z } from 'zod';

// =============================================================================
// FILTER SCHEMAS
// =============================================================================

export const listMembersSchema = z.object({
  status: z.array(z.enum(['invited', 'active', 'suspended', 'removed'])).optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type ListMembersInput = z.infer<typeof listMembersSchema>;

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

export const memberActionSchema = z.object({
  userId: z.number(),
});

export type MemberActionInput = z.infer<typeof memberActionSchema>;

export const reinviteSchema = z.object({
  userId: z.number(),
  roleId: z.number().optional(),
});

export type ReinviteInput = z.infer<typeof reinviteSchema>;

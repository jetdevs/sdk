/** Zod input schemas for the invites module (p131 INV-001). */
import { z } from 'zod';

export const createInviteInputSchema = z.object({
  sourceOrgRef: z.string().min(1).max(255),
  orgName: z.string().min(1).max(255),
  email: z.string().trim().email().max(320),
  roleRef: z.string().min(1).max(64),
  roleName: z.string().min(1).max(128),
  invitedBySub: z.string().min(1).max(255),
  invitedByName: z.string().max(255).nullish(),
  appUrl: z.string().url(),
});

export const cancelByEmailInputSchema = z.object({
  sourceOrgRef: z.string().min(1).max(255),
  email: z.string().trim().email().max(320),
});

export type CreateInviteInputParsed = z.infer<typeof createInviteInputSchema>;

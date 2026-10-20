/**
 * Access module — Zod inputs for the admin router (p107 ACC-001).
 *
 * @module @jetdevs/core/access
 */
import { z } from 'zod';

import { CODE_RE, normalizeCode } from './codes';
import { ACCESS_CODE_KINDS, ACCESS_CODE_STATUSES, ACCESS_MODES, WAITLIST_STATES } from './types';

const pageSchema = {
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
};

export const listCodesSchema = z.object({
  kind: z.enum(ACCESS_CODE_KINDS).optional(),
  status: z.enum(ACCESS_CODE_STATUSES).optional(),
  ...pageSchema,
});

export const createCodeSchema = z.object({
  /** Vanity code; generated when omitted. */
  code: z
    .string()
    .transform(normalizeCode)
    .refine((c) => CODE_RE.test(c), { message: 'Code must be 4-32 characters: A-Z, 0-9 or -' })
    .optional(),
  kind: z.enum(['campaign', 'single_use']).default('campaign'),
  maxUses: z.number().int().min(0).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  tag: z.string().max(128).nullable().optional(),
  grantsAccess: z.boolean().default(true),
  boundEmail: z.string().email().max(255).nullable().optional(),
});

export const codeIdSchema = z.object({ id: z.number().int().positive() });

export const setMaxUsesSchema = z.object({
  id: z.number().int().positive(),
  maxUses: z.number().int().min(0).nullable(),
});

export const listWaitlistSchema = z.object({
  state: z.enum(WAITLIST_STATES).optional(),
  ...pageSchema,
});

export const waitlistIdSchema = z.object({ id: z.number().int().positive() });

export const waitlistQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(500),
  type: z.enum(['text', 'select']),
  options: z.array(z.string().min(1).max(200)).optional(),
  required: z.boolean().default(false),
});

export const updateSettingsSchema = z.object({
  mode: z.enum(ACCESS_MODES).optional(),
  personalCodeDefaultCap: z.number().int().min(0).max(1_000_000).optional(),
  waitlistQuestions: z.array(waitlistQuestionSchema).max(20).optional(),
  copy: z.record(z.string(), z.string().max(5000)).optional(),
});

/**
 * API Keys Module - Validation Schemas
 *
 * Zod schemas for API key validation.
 *
 * @module @yobolabs/core/api-keys
 */

import { z } from 'zod';

/**
 * Schema for creating a new API key
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255, 'Name must be 255 characters or less'),
  permissions: z.array(z.string()).default([]),
  rateLimit: z.number().int().positive().default(1000).optional(),
  expiresAt: z.date().optional(),
  environment: z.enum(['live', 'test']).default('live'),
});

/**
 * Schema for listing API keys
 */
export const listApiKeysSchema = z.object({
  includeRevoked: z.boolean().default(false),
});

/**
 * Schema for getting an API key by ID
 */
export const getApiKeySchema = z.object({
  id: z.number().int().positive(),
});

/**
 * Schema for revoking an API key
 */
export const revokeApiKeySchema = z.object({
  id: z.number().int().positive(),
});

/**
 * Schema for updating an API key
 */
export const updateApiKeySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.string()).optional(),
  rateLimit: z.number().int().positive().optional(),
  expiresAt: z.date().nullable().optional(),
});

// Type exports for schema inference
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ListApiKeysInput = z.infer<typeof listApiKeysSchema>;
export type GetApiKeyInput = z.infer<typeof getApiKeySchema>;
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

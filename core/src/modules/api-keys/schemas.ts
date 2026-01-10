/**
 * API Keys Module - Validation Schemas
 *
 * Zod schemas for API key validation.
 *
 * @module @jetdevs/core/api-keys
 */

import { z } from 'zod';

/**
 * Schema for creating a new API key
 *
 * P2-SR-006: Updated for service roles separation with backwards compatibility
 *
 * Permission Resolution:
 * 1. serviceRoleId (preferred): Assigns a service role, permissions derived from role
 * 2. roleId (deprecated): Maps to serviceRoleId for backwards compatibility
 * 3. permissions (legacy): Direct permission assignment (legacy mode, not recommended)
 *
 * At least one of serviceRoleId, roleId, or non-empty permissions must be provided.
 * If neither role field is provided, Full API Access service role is used as default.
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255, 'Name must be 255 characters or less'),
  /**
   * Service role ID (preferred)
   * The service role from which to derive permissions
   */
  serviceRoleId: z.number().int().positive().optional(),
  /**
   * @deprecated Use serviceRoleId instead
   * Kept for backwards compatibility - will be mapped to serviceRoleId in handler
   */
  roleId: z.number().int().positive().optional(),
  /**
   * @deprecated Use serviceRoleId instead
   * Direct permission assignment (legacy mode)
   * Only used when no role is specified
   */
  permissions: z.array(z.string()).default([]),
  /**
   * Permission resolution mode
   * - 'cached': Permissions stored in api_keys table (faster, updated on sync)
   * - 'fresh': Permissions fetched from role at runtime (accurate, bypasses cache)
   */
  permissionMode: z.enum(['cached', 'fresh']).default('cached'),
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
  /** Service role ID (preferred) */
  serviceRoleId: z.number().int().positive().nullable().optional(),
  /** @deprecated Use serviceRoleId instead */
  roleId: z.number().int().positive().nullable().optional(),
  permissions: z.array(z.string()).optional(),
  /** Permission resolution mode */
  permissionMode: z.enum(['cached', 'fresh']).optional(),
  rateLimit: z.number().int().positive().optional(),
  expiresAt: z.date().nullable().optional(),
});

/**
 * Schema for syncing API key permissions from its role
 */
export const syncApiKeyPermissionsSchema = z.object({
  id: z.number().int().positive(),
});

// Type exports for schema inference
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ListApiKeysInput = z.infer<typeof listApiKeysSchema>;
export type GetApiKeyInput = z.infer<typeof getApiKeySchema>;
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type SyncApiKeyPermissionsInput = z.infer<typeof syncApiKeyPermissionsSchema>;

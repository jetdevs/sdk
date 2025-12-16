/**
 * System Config Module - Validation Schemas
 *
 * Zod schemas for system configuration validation.
 *
 * @module @jetdevs/core/system-config
 */

import { z } from 'zod';

/**
 * Schema for updating a system configuration
 */
export const updateConfigSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
});

/**
 * Schema for getting a configuration by key
 */
export const getByKeySchema = z.object({
  key: z.string().min(1),
});

/**
 * Schema for getting configurations by category
 */
export const getByCategorySchema = z.object({
  category: z.string().min(1),
});

/**
 * Schema for creating a new configuration
 */
export const createConfigSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string(),
  valueType: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
  category: z.string().max(50).optional(),
  description: z.string().optional(),
  isSystem: z.boolean().default(true),
});

/**
 * Schema for deleting a configuration
 */
export const deleteConfigSchema = z.object({
  key: z.string().min(1),
});

// Type exports for schema inference
export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
export type GetByKeyInput = z.infer<typeof getByKeySchema>;
export type GetByCategoryInput = z.infer<typeof getByCategorySchema>;
export type CreateConfigInput = z.infer<typeof createConfigSchema>;
export type DeleteConfigInput = z.infer<typeof deleteConfigSchema>;

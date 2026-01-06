/**
 * Theme Validation Schemas
 *
 * Zod schemas for validating theme-related inputs.
 *
 * @module @jetdevs/core/themes
 */

import { z } from "zod";

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

/**
 * Schema for creating a new theme
 */
export const createThemeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name is too long"),
  description: z.string().max(500, "Description is too long").optional(),
  cssFile: z
    .string()
    .min(1, "CSS file path is required")
    .max(255, "CSS file path is too long"),
  isActive: z.boolean().default(true),
});

/**
 * Schema for updating an existing theme
 */
export const updateThemeSchema = z.object({
  uuid: z.string().uuid("Invalid theme UUID"),
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  cssFile: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

/**
 * Schema for getting a theme by UUID
 */
export const getThemeByUuidSchema = z.string().uuid("Invalid theme UUID");

/**
 * Schema for getting a theme by ID
 */
export const getThemeByIdSchema = z.number().int().positive();

/**
 * Schema for listing themes
 */
export const themeListOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
    includeInactive: z.boolean().default(false),
  })
  .optional();

/**
 * Schema for theme filters
 */
export const themeFiltersSchema = z
  .object({
    isActive: z.boolean().optional(),
    search: z.string().optional(),
  })
  .optional();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;
export type ThemeListOptionsInput = z.infer<typeof themeListOptionsSchema>;
export type ThemeFiltersInput = z.infer<typeof themeFiltersSchema>;

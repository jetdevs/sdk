/**
 * Themes Module
 *
 * Theme management system for SaaS applications.
 * Provides repository, validation schemas, and type definitions.
 *
 * @module @yobolabs/core/themes
 *
 * @example
 * ```typescript
 * import {
 *   ThemeRepository,
 *   createThemeSchema,
 *   Theme,
 * } from '@yobolabs/core/themes';
 *
 * // Create repository with schema injection
 * const themeRepo = new ThemeRepository(db, { themes });
 *
 * // Validate input
 * const validatedData = createThemeSchema.parse(input);
 *
 * // Create theme
 * const theme = await themeRepo.create(validatedData);
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  Theme,
  ThemeWithStats,
  ThemeCreateData,
  ThemeUpdateData,
  ThemeFilters,
  ThemeListOptions,
  ThemeListResult,
} from "./types";

// =============================================================================
// REPOSITORY
// =============================================================================

export { ThemeRepository } from "./theme.repository";

// =============================================================================
// SCHEMAS
// =============================================================================

export {
  createThemeSchema,
  updateThemeSchema,
  getThemeByUuidSchema,
  getThemeByIdSchema,
  themeListOptionsSchema,
  themeFiltersSchema,
} from "./schemas";

export type {
  CreateThemeInput,
  UpdateThemeInput,
  ThemeListOptionsInput,
  ThemeFiltersInput,
} from "./schemas";

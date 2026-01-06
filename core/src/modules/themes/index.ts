/**
 * Themes Module
 *
 * Theme management system for SaaS applications.
 * Provides repository, validation schemas, and type definitions.
 *
 * @module @jetdevs/core/themes
 *
 * @example
 * ```typescript
 * import {
 *   ThemeRepository,
 *   createThemeSchema,
 *   Theme,
 * } from '@jetdevs/core/themes';
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
    Theme, ThemeCreateData, ThemeFilters,
    ThemeListOptions,
    ThemeListResult, ThemeUpdateData, ThemeWithStats
} from "./types";

// =============================================================================
// REPOSITORY
// =============================================================================

export { ThemeRepository } from "./theme.repository";

// =============================================================================
// SCHEMAS
// =============================================================================

export {
    createThemeSchema, getThemeByIdSchema, getThemeByUuidSchema, themeFiltersSchema, themeListOptionsSchema, updateThemeSchema
} from "./schemas";

export type {
    CreateThemeInput, ThemeFiltersInput, ThemeListOptionsInput, UpdateThemeInput
} from "./schemas";


/**
 * Theme Types
 *
 * Type definitions for theme management.
 *
 * @module @yobolabs/core/themes
 */

// =============================================================================
// THEME ENTITY TYPES
// =============================================================================

/**
 * Base theme record
 */
export interface Theme {
  id: number;
  uuid: string;
  name: string;
  displayName: string;
  description: string | null;
  cssFile: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Theme with usage statistics
 */
export interface ThemeWithStats extends Theme {
  userCount?: number;
}

// =============================================================================
// CREATE/UPDATE DATA TYPES
// =============================================================================

/**
 * Data for creating a new theme
 */
export interface ThemeCreateData {
  name: string;
  displayName: string;
  description?: string | null;
  cssFile: string;
  isActive?: boolean;
}

/**
 * Data for updating an existing theme
 */
export interface ThemeUpdateData {
  name?: string;
  displayName?: string;
  description?: string | null;
  cssFile?: string;
  isActive?: boolean;
}

// =============================================================================
// FILTER/LIST TYPES
// =============================================================================

/**
 * Filters for listing themes
 */
export interface ThemeFilters {
  isActive?: boolean;
  search?: string;
}

/**
 * Options for listing themes
 */
export interface ThemeListOptions {
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}

/**
 * Result of listing themes
 */
export interface ThemeListResult {
  items: Theme[];
  total: number;
  limit: number;
  offset: number;
}

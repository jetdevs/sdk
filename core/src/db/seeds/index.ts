/**
 * Database Seeds Module
 *
 * Generic seed functions for core SaaS data.
 * Apps use schema injection to pass their specific tables.
 *
 * @example
 * ```typescript
 * import { seedPermissions, seedRoles, seedThemes } from '@yobolabs/core/db/seeds';
 * import { permissions, roles, rolePermissions, themes } from '@/db/schema';
 * import { getAllPermissions } from '@/permissions/registry';
 *
 * // Seed permissions from registry
 * await seedPermissions(db, { permissions }, getAllPermissions());
 *
 * // Seed roles with permission mappings
 * await seedRoles(db, { roles, permissions, rolePermissions }, DEFAULT_ROLES, {
 *   defaultOrgId: 1,
 * });
 *
 * // Seed themes
 * await seedThemes(db, { themes }, DEFAULT_THEMES);
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  SeedDatabase,
  PermissionSeedData,
  PermissionSeedSchema,
  PermissionSeedOptions,
  RoleSeedData,
  RoleSeedSchema,
  RoleSeedOptions,
  ThemeSeedData,
  ThemeSeedSchema,
  ThemeSeedOptions,
  SeedResult,
} from './types';

export { createSeedResult, mergeSeedResults } from './types';

// =============================================================================
// PERMISSION SEEDS
// =============================================================================

export { seedPermissions, validatePermissions } from './seed-permissions';

// =============================================================================
// ROLE SEEDS
// =============================================================================

export { seedRoles, getRoleSummary } from './seed-roles';

// =============================================================================
// THEME SEEDS
// =============================================================================

export {
  seedThemes,
  ensureDefaultTheme,
  DEFAULT_THEMES,
  EXTENDED_THEMES,
} from './seed-themes';

/**
 * Database Seeds Module
 *
 * Generic seed functions for core SaaS data.
 * Apps use schema injection to pass their specific tables.
 *
 * @example
 * ```typescript
 * import { seedPermissions, seedRoles, seedThemes } from '@jetdevs/core/db/seeds';
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
    PermissionSeedData, PermissionSeedOptions, PermissionSeedSchema, RoleSeedData, RoleSeedOptions, RoleSeedSchema, SeedDatabase, SeedResult, ThemeSeedData, ThemeSeedOptions, ThemeSeedSchema
} from './types';

export { createSeedResult, mergeSeedResults } from './types';

// =============================================================================
// PERMISSION SEEDS
// =============================================================================

export { seedPermissions, validatePermissions } from './seed-permissions';

// =============================================================================
// ROLE SEEDS
// =============================================================================

export { getRoleSummary, seedRoles } from './seed-roles';

// =============================================================================
// THEME SEEDS
// =============================================================================

export {
    DEFAULT_THEMES,
    EXTENDED_THEMES, ensureDefaultTheme, seedThemes
} from './seed-themes';


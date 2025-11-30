/**
 * Database Seed Types
 *
 * Type definitions for the seed system.
 * Apps inject their specific schema tables when calling seed functions.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// =============================================================================
// DATABASE TYPES
// =============================================================================

export type SeedDatabase = PostgresJsDatabase<any>;

// =============================================================================
// PERMISSION SEED TYPES
// =============================================================================

export interface PermissionSeedData {
  slug: string;
  name: string;
  description: string;
  category: string;
  isActive?: boolean;
}

export interface PermissionSeedSchema {
  permissions: any; // Drizzle table
}

export interface PermissionSeedOptions {
  /** Update existing permissions if they differ from seed data */
  updateExisting?: boolean;
  /** Log detailed progress */
  verbose?: boolean;
}

// =============================================================================
// ROLE SEED TYPES
// =============================================================================

export interface RoleSeedData {
  name: string;
  description: string;
  permissions: string[]; // Permission slugs
  isSystemRole: boolean;
  isGlobalRole: boolean;
  orgId?: number | null;
}

export interface RoleSeedSchema {
  roles: any;
  permissions: any;
  rolePermissions: any;
}

export interface RoleSeedOptions {
  /** Organization ID for org-specific roles */
  defaultOrgId?: number;
  /** Update existing roles if they differ */
  updateExisting?: boolean;
  /** Log detailed progress */
  verbose?: boolean;
}

// =============================================================================
// THEME SEED TYPES
// =============================================================================

export interface ThemeSeedData {
  name: string;
  displayName: string;
  description: string;
  cssFile: string;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface ThemeSeedSchema {
  themes: any;
}

export interface ThemeSeedOptions {
  /** Update existing themes if they differ */
  updateExisting?: boolean;
  /** Log detailed progress */
  verbose?: boolean;
}

// =============================================================================
// SEED RESULT TYPES
// =============================================================================

export interface SeedResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export function createSeedResult(): SeedResult {
  return {
    success: true,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
}

export function mergeSeedResults(...results: SeedResult[]): SeedResult {
  return results.reduce(
    (acc, result) => ({
      success: acc.success && result.success,
      inserted: acc.inserted + result.inserted,
      updated: acc.updated + result.updated,
      skipped: acc.skipped + result.skipped,
      errors: [...acc.errors, ...result.errors],
    }),
    createSeedResult()
  );
}

/**
 * Core Permission Seeding
 *
 * Generic function for seeding permissions into the database.
 * Uses schema injection pattern - apps pass their schema tables.
 */

import { eq } from 'drizzle-orm';
import { seedLog } from '../../cli';
import type {
    PermissionSeedData,
    PermissionSeedOptions,
    PermissionSeedSchema,
    SeedDatabase,
    SeedResult,
} from './types';
import { createSeedResult } from './types';

/**
 * Seed permissions into the database.
 *
 * @param db - Drizzle database instance
 * @param schema - Object containing the permissions table
 * @param permissions - Array of permission data to seed
 * @param options - Seed options
 * @returns Seed result with counts
 *
 * @example
 * ```typescript
 * import { seedPermissions } from '@jetdevs/core/db/seeds';
 * import { permissions } from '@/db/schema';
 * import { getAllPermissions } from '@/permissions/registry';
 *
 * const result = await seedPermissions(db, { permissions }, getAllPermissions());
 * ```
 */
export async function seedPermissions(
  db: SeedDatabase,
  schema: PermissionSeedSchema,
  permissions: PermissionSeedData[],
  options: PermissionSeedOptions = {}
): Promise<SeedResult> {
  const { updateExisting = true, verbose = false } = options;
  const result = createSeedResult();

  try {
    if (verbose) {
      seedLog(`Seeding ${permissions.length} permissions...`, 'info');
    }

    // Get existing permissions
    const existingPermissions = await db.select().from(schema.permissions);
    const existingBySlug = new Map(
      existingPermissions.map((p: any) => [p.slug, p])
    );

    // Separate into new vs existing
    const toInsert: PermissionSeedData[] = [];
    const toUpdate: PermissionSeedData[] = [];

    for (const permission of permissions) {
      const existing = existingBySlug.get(permission.slug);

      if (!existing) {
        toInsert.push(permission);
      } else if (
        updateExisting &&
        (existing.name !== permission.name ||
          existing.description !== permission.description ||
          existing.category !== permission.category)
      ) {
        toUpdate.push(permission);
      } else {
        result.skipped++;
      }
    }

    // Insert new permissions
    if (toInsert.length > 0) {
      const insertData = toInsert.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        category: p.category,
        isActive: p.isActive ?? true,
      }));

      await db.insert(schema.permissions).values(insertData);
      result.inserted = toInsert.length;

      if (verbose) {
        seedLog(`Inserted ${toInsert.length} new permissions`, 'success');
      }
    }

    // Update existing permissions
    if (toUpdate.length > 0 && updateExisting) {
      for (const permission of toUpdate) {
        await db
          .update(schema.permissions)
          .set({
            name: permission.name,
            description: permission.description,
            category: permission.category,
          })
          .where(eq(schema.permissions.slug, permission.slug));
      }
      result.updated = toUpdate.length;

      if (verbose) {
        seedLog(`Updated ${toUpdate.length} existing permissions`, 'success');
      }
    }

    if (verbose) {
      seedLog(
        `Permission seeding complete: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`,
        'success'
      );
    }
  } catch (error) {
    result.success = false;
    result.errors.push(String(error));
    seedLog(`Permission seeding failed: ${error}`, 'error');
  }

  return result;
}

/**
 * Validate that all expected permissions exist in database.
 *
 * @param db - Drizzle database instance
 * @param schema - Object containing the permissions table
 * @param expectedSlugs - Array of permission slugs that should exist
 * @returns Object with missing and extra permissions
 */
export async function validatePermissions(
  db: SeedDatabase,
  schema: PermissionSeedSchema,
  expectedSlugs: string[]
): Promise<{
  valid: boolean;
  missing: string[];
  extra: string[];
}> {
  const existingPermissions = await db.select().from(schema.permissions);
  const existingSlugs = existingPermissions.map((p: any) => p.slug);

  const missing = expectedSlugs.filter((slug) => !existingSlugs.includes(slug));
  const extra = existingSlugs.filter(
    (slug: string) => !expectedSlugs.includes(slug)
  );

  return {
    valid: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

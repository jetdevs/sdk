/**
 * Core Theme Seeding
 *
 * Generic function for seeding themes into the database.
 * Uses schema injection pattern - apps pass their schema tables.
 */

import { eq } from 'drizzle-orm';
import { seedLog } from '../../cli';
import type {
    SeedDatabase,
    SeedResult,
    ThemeSeedData,
    ThemeSeedOptions,
    ThemeSeedSchema,
} from './types';
import { createSeedResult } from './types';

/**
 * Default themes that every SaaS app should have.
 * Apps can use these directly or customize them.
 */
export const DEFAULT_THEMES: ThemeSeedData[] = [
  {
    name: 'default',
    displayName: 'Default Theme',
    description: 'Clean, professional design with modern aesthetics',
    cssFile: '/themes/default.css',
    isActive: true,
    isDefault: true,
  },
  {
    name: 'ghibli',
    displayName: 'Ghibli Theme',
    description: 'Warm, natural colors inspired by Studio Ghibli films',
    cssFile: '/themes/ghibli.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'ocean',
    displayName: 'Ocean Theme',
    description: 'Cool blues and teals with ocean-inspired gradients',
    cssFile: '/themes/ocean.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'gold',
    displayName: 'Gold Theme',
    description: 'Warm gold and amber tones for a luxurious feel',
    cssFile: '/themes/gold.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'claude',
    displayName: 'Claude Theme',
    description: 'Elegant design inspired by Claude AI with sophisticated color palette',
    cssFile: '/themes/claude.css',
    isActive: true,
    isDefault: false,
  },
];

/**
 * Extended theme collection for apps that want more options.
 */
export const EXTENDED_THEMES: ThemeSeedData[] = [
  ...DEFAULT_THEMES,
  {
    name: 'cosmic-night',
    displayName: 'Cosmic Night',
    description: 'Deep space-inspired theme with dark cosmic colors and stellar accents',
    cssFile: '/themes/cosmic-night.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'graphite',
    displayName: 'Graphite Theme',
    description: 'Modern monochromatic design with sophisticated gray tones',
    cssFile: '/themes/graphite.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'neo-brutalism',
    displayName: 'Neo Brutalism',
    description: 'Bold, stark design with high contrast and geometric elements',
    cssFile: '/themes/neo-brutalism.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'retro-arcade',
    displayName: 'Retro Arcade',
    description: 'Nostalgic 80s arcade-inspired theme with neon colors and pixelated aesthetics',
    cssFile: '/themes/retro-arcade.css',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'soft-pop',
    displayName: 'Soft Pop',
    description: 'Gentle pastel colors with a modern, friendly aesthetic',
    cssFile: '/themes/soft-pop.css',
    isActive: true,
    isDefault: false,
  },
];

/**
 * Seed themes into the database.
 *
 * @param db - Drizzle database instance
 * @param schema - Object containing the themes table
 * @param themes - Array of theme data to seed (defaults to DEFAULT_THEMES)
 * @param options - Seed options
 * @returns Seed result with counts
 *
 * @example
 * ```typescript
 * import { seedThemes, DEFAULT_THEMES } from '@jetdevs/core/db/seeds';
 * import { themes } from '@/db/schema';
 *
 * // Use default themes
 * await seedThemes(db, { themes }, DEFAULT_THEMES);
 *
 * // Or with extended themes
 * import { EXTENDED_THEMES } from '@jetdevs/core/db/seeds';
 * await seedThemes(db, { themes }, EXTENDED_THEMES);
 * ```
 */
export async function seedThemes(
  db: SeedDatabase,
  schema: ThemeSeedSchema,
  themes: ThemeSeedData[] = DEFAULT_THEMES,
  options: ThemeSeedOptions = {}
): Promise<SeedResult> {
  const { updateExisting = true, verbose = false } = options;
  const result = createSeedResult();

  try {
    if (verbose) {
      seedLog(`Seeding ${themes.length} themes...`, 'info');
    }

    // Get existing themes
    const existingThemes = await db.select().from(schema.themes);
    const existingByName = new Map(
      existingThemes.map((t: any) => [t.name, t])
    );

    // Process each theme
    for (const theme of themes) {
      const existing = existingByName.get(theme.name);

      if (!existing) {
        // Insert new theme
        await db.insert(schema.themes).values({
          name: theme.name,
          displayName: theme.displayName,
          description: theme.description,
          cssFile: theme.cssFile,
          isActive: theme.isActive ?? true,
          isDefault: theme.isDefault ?? false,
        });
        result.inserted++;

        if (verbose) {
          seedLog(`Created theme: ${theme.displayName}`, 'success');
        }
      } else if (updateExisting) {
        // Update existing theme
        await db
          .update(schema.themes)
          .set({
            displayName: theme.displayName,
            description: theme.description,
            cssFile: theme.cssFile,
            isActive: theme.isActive ?? true,
            isDefault: theme.isDefault ?? false,
            updatedAt: new Date(),
          })
          .where(eq(schema.themes.name, theme.name));
        result.updated++;

        if (verbose) {
          seedLog(`Updated theme: ${theme.displayName}`, 'success');
        }
      } else {
        result.skipped++;
      }
    }

    if (verbose) {
      seedLog(
        `Theme seeding complete: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`,
        'success'
      );
    }
  } catch (error) {
    result.success = false;
    result.errors.push(String(error));
    seedLog(`Theme seeding failed: ${error}`, 'error');
  }

  return result;
}

/**
 * Ensure exactly one default theme exists.
 *
 * @param db - Drizzle database instance
 * @param schema - Object containing the themes table
 * @param defaultThemeName - Name of the theme to set as default
 */
export async function ensureDefaultTheme(
  db: SeedDatabase,
  schema: ThemeSeedSchema,
  defaultThemeName: string = 'default'
): Promise<void> {
  // First, unset all defaults
  await db
    .update(schema.themes)
    .set({ isDefault: false });

  // Then set the specified theme as default
  await db
    .update(schema.themes)
    .set({ isDefault: true })
    .where(eq(schema.themes.name, defaultThemeName));

  seedLog(`Set default theme to: ${defaultThemeName}`, 'success');
}

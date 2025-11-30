/**
 * Theme Repository
 *
 * Handles all database operations for theme-related data.
 * Provides a clean data access layer for theme management.
 *
 * @module @yobolabs/core/themes
 */

import { asc, count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type {
  Theme,
  ThemeCreateData,
  ThemeListOptions,
  ThemeListResult,
  ThemeUpdateData,
  ThemeWithStats,
} from "./types";

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

/**
 * Theme Repository - Data access layer for theme management
 *
 * Uses schema injection pattern to avoid tight coupling to specific database tables.
 *
 * @example
 * ```typescript
 * import { ThemeRepository } from '@yobolabs/core/themes';
 *
 * const repo = new ThemeRepository(db, { themes });
 * const themes = await repo.findAll();
 * ```
 */
export class ThemeRepository {
  private themes: any;

  constructor(
    private db: PostgresJsDatabase<any>,
    schema: {
      themes: any;
    }
  ) {
    this.themes = schema.themes;
  }

  /**
   * Get all available (active) themes
   */
  async findAllAvailable(): Promise<Theme[]> {
    return (await this.db
      .select()
      .from(this.themes)
      .where(eq(this.themes.isActive, true))
      .orderBy(asc(this.themes.displayName))) as Theme[];
  }

  /**
   * Get all themes (including inactive)
   */
  async findAll(): Promise<Theme[]> {
    return (await this.db
      .select()
      .from(this.themes)
      .orderBy(asc(this.themes.displayName))) as Theme[];
  }

  /**
   * Get themes with pagination
   */
  async list(options: ThemeListOptions = {}): Promise<ThemeListResult> {
    const { limit = 50, offset = 0, includeInactive = false } = options;

    // Build query conditions
    const conditions = includeInactive ? undefined : eq(this.themes.isActive, true);

    // Get total count
    const [countResult] = await this.db
      .select({ count: count() })
      .from(this.themes)
      .where(conditions);

    const total = countResult?.count || 0;

    // Get items
    const items = (await this.db
      .select()
      .from(this.themes)
      .where(conditions)
      .orderBy(asc(this.themes.displayName))
      .limit(limit)
      .offset(offset)) as Theme[];

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get theme by ID
   */
  async findById(id: number): Promise<Theme | null> {
    const [theme] = (await this.db
      .select()
      .from(this.themes)
      .where(eq(this.themes.id, id))
      .limit(1)) as Theme[];

    return theme || null;
  }

  /**
   * Get theme by UUID
   */
  async findByUuid(uuid: string): Promise<Theme | null> {
    const [theme] = (await this.db
      .select()
      .from(this.themes)
      .where(eq(this.themes.uuid, uuid))
      .limit(1)) as Theme[];

    return theme || null;
  }

  /**
   * Get theme by name
   */
  async findByName(name: string): Promise<Theme | null> {
    const [theme] = (await this.db
      .select()
      .from(this.themes)
      .where(eq(this.themes.name, name))
      .limit(1)) as Theme[];

    return theme || null;
  }

  /**
   * Get the default theme
   */
  async findDefault(): Promise<Theme | null> {
    const [theme] = (await this.db
      .select()
      .from(this.themes)
      .where(eq(this.themes.isDefault, true))
      .limit(1)) as Theme[];

    return theme || null;
  }

  /**
   * Create new theme
   */
  async create(data: ThemeCreateData): Promise<Theme> {
    const [theme] = (await this.db
      .insert(this.themes)
      .values({
        name: data.name,
        displayName: data.displayName,
        description: data.description || null,
        cssFile: data.cssFile,
        isActive: data.isActive ?? true,
        isDefault: false, // New themes are never default initially
      })
      .returning()) as Theme[];

    return theme;
  }

  /**
   * Update theme
   */
  async update(uuid: string, data: ThemeUpdateData): Promise<Theme | null> {
    const [theme] = (await this.db
      .update(this.themes)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(this.themes.uuid, uuid))
      .returning()) as Theme[];

    return theme || null;
  }

  /**
   * Delete theme
   */
  async delete(uuid: string): Promise<Theme | null> {
    const [theme] = (await this.db
      .delete(this.themes)
      .where(eq(this.themes.uuid, uuid))
      .returning()) as Theme[];

    return theme || null;
  }

  /**
   * Soft delete (deactivate) theme
   */
  async softDelete(uuid: string): Promise<Theme | null> {
    const [theme] = (await this.db
      .update(this.themes)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(this.themes.uuid, uuid))
      .returning()) as Theme[];

    return theme || null;
  }

  /**
   * Set theme as default
   */
  async setDefault(uuid: string): Promise<Theme | null> {
    // Remove default from all themes
    await this.db
      .update(this.themes)
      .set({ isDefault: false })
      .where(eq(this.themes.isDefault, true));

    // Set new default
    const [theme] = (await this.db
      .update(this.themes)
      .set({
        isDefault: true,
        updatedAt: new Date(),
      })
      .where(eq(this.themes.uuid, uuid))
      .returning()) as Theme[];

    return theme || null;
  }

  /**
   * Toggle theme active status
   */
  async toggleActive(uuid: string): Promise<Theme | null> {
    // Get current theme
    const current = await this.findByUuid(uuid);
    if (!current) return null;

    const [theme] = (await this.db
      .update(this.themes)
      .set({
        isActive: !current.isActive,
        updatedAt: new Date(),
      })
      .where(eq(this.themes.uuid, uuid))
      .returning()) as Theme[];

    return theme || null;
  }

  /**
   * Check if theme name exists
   */
  async nameExists(name: string, excludeUuid?: string): Promise<boolean> {
    let query = this.db
      .select({ id: this.themes.id })
      .from(this.themes)
      .where(eq(this.themes.name, name))
      .limit(1);

    const [existing] = await query;

    if (existing && excludeUuid) {
      const current = await this.findByUuid(excludeUuid);
      if (current && current.id === existing.id) {
        return false; // Same record, not a conflict
      }
    }

    return !!existing;
  }
}

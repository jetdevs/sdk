/**
 * Core System Schema
 *
 * System-wide configuration tables.
 * Note: Feature flags are in ./feature-flags.ts with full org support.
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";

// =============================================================================
// SYSTEM CONFIG TABLE
// =============================================================================

/**
 * System Configuration Table
 *
 * Stores system-wide configuration values.
 * - config_key: Unique configuration key (e.g., 'ai.default_model')
 * - config_value: The configuration value (stored as text)
 * - value_type: Type of the value ('string', 'number', 'boolean', 'json')
 * - category: Grouping category (e.g., 'ai', 'security', 'general')
 * - is_system: Whether this is a system-managed config (vs user-managed)
 */
export const systemConfig = pgTable(
  "system_config",
  {
    id: serial("id").notNull().primaryKey(),

    // Configuration key (unique identifier)
    configKey: varchar("config_key", { length: 100 }).notNull().unique(),

    // Configuration value (stored as text, parsed based on value_type)
    configValue: text("config_value"),

    // Type of the value for parsing
    valueType: varchar("value_type", { length: 50 }).default('string').notNull(),

    // Description for documentation/admin UI
    description: text("description"),

    // Category for grouping (derived from key prefix by default)
    category: varchar("category", { length: 50 }).default('general').notNull(),

    // Whether this is a system-managed configuration
    isSystem: boolean("is_system").default(true).notNull(),

    // Audit timestamps
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("system_config_id_idx").on(table.id),
    uniqueIndex("system_config_config_key_idx").on(table.configKey),
    index("system_config_category_idx").on(table.category),
  ],
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;

/**
 * Core Themes Schema
 *
 * Application theme configuration.
 */

import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";

// =============================================================================
// THEMES TABLE
// =============================================================================

export const themes = pgTable(
  "themes",
  {
    id: serial("id").notNull().primaryKey(),
    uuid: uuid("uuid").unique().notNull().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    description: text("description"),
    cssFile: varchar("css_file", { length: 255 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
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
    index("themes_id_idx").on(table.id),
    uniqueIndex("themes_uuid_idx").on(table.uuid),
    uniqueIndex("themes_name_idx").on(table.name),
    index("themes_is_active_idx").on(table.isActive),
  ],
);

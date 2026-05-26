/**
 * Core Organization Schema
 *
 * Foundation schema for multi-tenant SaaS applications.
 * Includes organizations and users tables.
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
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// =============================================================================
// ENUMS
// =============================================================================

export const businessCategoryEnum = pgEnum("business_category", [
  "food_beverage",  // F&B - Restaurants, Cafes, Food Delivery
  "clinic",         // Healthcare/Medical Clinics
  "beauty",         // Beauty Salons, Spas
  "retail",         // General Retail
  "services",       // General Services
  "other",          // Other business types
]);

// =============================================================================
// ORGANIZATIONS TABLE
// =============================================================================

export const orgs = pgTable(
  "orgs",
  {
    id: serial("id").notNull().primaryKey(),
    uuid: uuid("uuid").unique().notNull().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 255 }).unique(),
    /**
     * Canonical yobo-auth org id this RP-local org maps to. Set when an app
     * provisions/maps a Yobo Connect org. NULL for orgs created before
     * migration. The OIDC token carries the canonical id; the RP maps it here.
     */
    connectOrgId: integer("connect_org_id"),
    logoUrl: text("logo_url"),
    website: text("website"),
    businessAddress: text("business_address"),
    merchantId: varchar("merchant_id", { length: 255 }),
    // Business category for template assignment
    businessCategory: businessCategoryEnum("business_category").default("other"),
    // Default category tree (assigned from template)
    defaultCategoryTreeId: integer("default_category_tree_id"),
    // Financial settings
    currency: varchar("currency", { length: 3 }).default("USD").notNull(), // ISO 4217 currency code
    currencySymbol: varchar("currency_symbol", { length: 10 }).default("$").notNull(), // Display symbol
    currencyLocale: varchar("currency_locale", { length: 10 }).default("en-US").notNull(), // Locale for formatting
    // AI Copilot settings
    copilotEnabled: boolean("copilot_enabled").default(true).notNull(), // Enable/disable copilot panel per org
    isActive: boolean("is_active").default(true).notNull(),
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
    index("orgs_id_idx").on(table.id),
    uniqueIndex("orgs_uuid_idx").on(table.uuid),
    uniqueIndex("orgs_slug_idx").on(table.slug),
    index("orgs_business_category_idx").on(table.businessCategory),
    index("orgs_default_category_tree_id_idx").on(table.defaultCategoryTreeId),
  ],
);

// =============================================================================
// USERS TABLE
// =============================================================================

export const users = pgTable(
  "users",
  {
    id: serial("id").notNull().primaryKey(),
    uuid: uuid("uuid").unique().notNull().defaultRandom(),
    email: varchar("email", { length: 255 }),
    /**
     * Stable yobo-auth OIDC `sub` for this shadow user. Replaces email matching
     * for SSO provisioning. NULL until first Yobo Connect login / backfill.
     */
    connectSub: varchar("connect_sub", { length: 64 }),
    name: varchar("name", { length: 255 }),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    username: varchar("username", { length: 255 }),
    password: text("password"),
    avatar: text("avatar"),
    phone: varchar("phone", { length: 50 }), // Primary contact phone (not for auth)
    primaryAuthMethod: varchar("primary_auth_method", { length: 20 }).default("email"), // Primary auth provider type
    isActive: boolean("is_active").default(true).notNull(),
    // Session timeout preference in minutes
    // Options: 30 (30 minutes), 240 (4 hours), 1440 (1 day), 10080 (7 days)
    sessionTimeoutPreference: integer("session_timeout_preference").default(1440), // Default: 1 day
    // Theme preference for the user interface
    themePreference: varchar("theme_preference", { length: 50 }).default("default"),
    // Current active organization
    currentOrgId: integer("current_org_id").references(() => orgs.id, { onDelete: 'set null' }),
    // Wizard fields for guided onboarding
    hasCompletedWizard: boolean("has_completed_wizard").default(false),
    wizardData: jsonb("wizard_data"),
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
    index("users_v2_id_idx").on(table.id),
    uniqueIndex("users_v2_uuid_idx").on(table.uuid),
    uniqueIndex("users_v2_email_idx").on(table.email),
    // Index for current org lookups
    index("users_v2_current_org_id_idx").on(table.currentOrgId),
    // Authentication method index
    index("users_v2_primary_auth_method_idx").on(table.primaryAuthMethod),
  ],
);

// =============================================================================
// RELATIONS
// =============================================================================

export const orgsRelations = relations(orgs, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  currentOrg: one(orgs, {
    fields: [users.currentOrgId],
    references: [orgs.id],
  }),
}));

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

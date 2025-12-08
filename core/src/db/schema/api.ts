/**
 * API Keys and Usage Logs Schema
 *
 * Stores API keys for external integrations and tracks usage for audit/analytics.
 * Keys are hashed with SHA-256 for security - full keys never stored.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { orgs, users } from "./orgs";
import { roles } from "./rbac";

// =============================================================================
// API KEYS TABLE
// =============================================================================

/**
 * API Keys Table
 *
 * Stores API keys for programmatic access to the platform
 * - Org-scoped: Each key belongs to a specific organization
 * - Hashed storage: Only SHA-256 hash stored, never raw key
 * - Rate limited: Per-key rate limiting
 * - Role-based permissions: Keys derive permissions from assigned role
 * - Revocable: Soft deletion via revoked_at timestamp
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    // Primary key
    id: serial("id").notNull().primaryKey(),

    // Organization isolation (REQUIRED for RLS)
    orgId: integer("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),

    // Human-readable name for identification
    name: varchar("name", { length: 255 }).notNull(),

    // Key prefix for display (first 16 chars: "yobo_live_XXXXX")
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),

    // SHA-256 hash of full key (64 hex chars)
    keyHash: varchar("key_hash", { length: 64 }).notNull(),

    // Role-based permissions: API keys derive permissions from this role
    // When roleId is set, permissions are fetched from role_permissions at runtime
    // The permissions array is kept as a cache/override for backward compatibility
    roleId: integer("role_id").references(() => roles.id, { onDelete: 'set null' }),

    // Permissions as array of permission slugs (e.g., ["user:read", "role:create"])
    // When roleId is set, this serves as a cache of the role's permissions
    // When roleId is null, these are manually assigned permissions (legacy mode)
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),

    // Rate limiting (requests per hour)
    rateLimit: integer("rate_limit").notNull().default(1000),

    // Optional expiration date
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

    // Usage tracking
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),

    // Audit timestamps
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),

    // Creator tracking
    createdBy: integer("created_by").references(() => users.id),

    // Soft deletion (revoked keys)
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    // Unique constraint on key hash (prevents duplicate keys)
    keyHashIdx: uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),

    // Index on org_id for RLS performance
    orgIdIdx: index("api_keys_org_id_idx").on(table.orgId),

    // Index on key_prefix for quick lookups during display
    keyPrefixIdx: index("api_keys_key_prefix_idx").on(table.keyPrefix),

    // Index on expires_at for cleanup queries
    expiresAtIdx: index("api_keys_expires_at_idx").on(table.expiresAt),

    // Composite index for active key queries
    orgActiveIdx: index("api_keys_org_active_idx").on(table.orgId, table.revokedAt),

    // Index on role_id for permission lookups
    roleIdIdx: index("api_keys_role_id_idx").on(table.roleId),
  })
);

// =============================================================================
// API USAGE LOGS TABLE
// =============================================================================

/**
 * API Usage Logs Table
 *
 * Audit trail for all API requests
 * - Tracks which API key was used
 * - Records endpoint and HTTP method
 * - Captures status code and duration
 * - Timestamp for time-series analysis
 */
export const apiUsageLogs = pgTable(
  "api_usage_logs",
  {
    // Primary key
    id: serial("id").notNull().primaryKey(),

    // API key reference (cascades on delete)
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),

    // Request details
    endpoint: varchar("endpoint", { length: 255 }).notNull(),
    method: varchar("method", { length: 10 }).notNull(), // GET, POST, PUT, DELETE, etc.

    // Response details
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(), // Request duration in milliseconds

    // Timestamp (for time-series analysis)
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Index on api_key_id for fast lookups by key
    apiKeyIdIdx: index("api_usage_logs_api_key_id_idx").on(table.apiKeyId),

    // Index on timestamp for time-series queries
    timestampIdx: index("api_usage_logs_timestamp_idx").on(table.timestamp),

    // Composite index for API key + timestamp (common query pattern)
    apiKeyTimestampIdx: index("api_usage_logs_api_key_timestamp_idx").on(
      table.apiKeyId,
      table.timestamp
    ),

    // Index on endpoint for analytics by endpoint
    endpointIdx: index("api_usage_logs_endpoint_idx").on(table.endpoint),
  })
);

// =============================================================================
// RELATIONS
// =============================================================================

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  // An API key belongs to one organization
  org: one(orgs, {
    fields: [apiKeys.orgId],
    references: [orgs.id],
  }),
  // An API key was created by one user
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
  // An API key derives permissions from one role
  role: one(roles, {
    fields: [apiKeys.roleId],
    references: [roles.id],
  }),
  // An API key has many usage logs
  usageLogs: many(apiUsageLogs),
}));

export const apiUsageLogsRelations = relations(apiUsageLogs, ({ one }) => ({
  // A log entry belongs to one API key
  apiKey: one(apiKeys, {
    fields: [apiUsageLogs.apiKeyId],
    references: [apiKeys.id],
  }),
}));

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type NewApiUsageLog = typeof apiUsageLogs.$inferInsert;

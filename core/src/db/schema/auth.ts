/**
 * Authentication Schema
 *
 * Supports multiple auth providers per user including email, OAuth, and WhatsApp.
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, orgs } from "./orgs";

// =============================================================================
// AUTH PROVIDER TYPES
// =============================================================================

export const AuthProviderTypes = {
  EMAIL: "email",
  WHATSAPP: "whatsapp",
  GOOGLE: "google",
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  TWITTER: "twitter",
  TIKTOK: "tiktok",
  APPLE: "apple",
} as const;

export type AuthProviderType = (typeof AuthProviderTypes)[keyof typeof AuthProviderTypes];

// =============================================================================
// AUTH ACCOUNTS TABLE
// =============================================================================

/**
 * User authentication accounts - supports multiple auth providers per user
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: serial("id").notNull().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: integer("org_id")
      .references(() => orgs.id, { onDelete: "cascade" }),

    // Provider information
    provider: varchar("provider", { length: 50 }).notNull(), // email, whatsapp, google, etc.
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(), // unique ID from provider

    // Email provider fields
    email: varchar("email", { length: 255 }),
    emailVerified: boolean("email_verified").default(false),

    // Phone/WhatsApp provider fields
    phoneNumber: varchar("phone_number", { length: 50 }),
    countryCode: varchar("country_code", { length: 10 }),
    phoneVerified: boolean("phone_verified").default(false),

    // OAuth provider fields
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenType: varchar("token_type", { length: 50 }),
    scope: text("scope"),
    idToken: text("id_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

    // Provider profile data
    providerProfile: jsonb("provider_profile"), // Store provider-specific profile data
    displayName: varchar("display_name", { length: 255 }),
    avatarUrl: text("avatar_url"),

    // Account status
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),

    // Timestamps
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Ensure unique provider account per provider
    uniqueIndex("auth_accounts_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    // Indexes for lookups
    index("auth_accounts_user_id_idx").on(table.userId),
    index("auth_accounts_org_id_idx").on(table.orgId),
    index("auth_accounts_provider_idx").on(table.provider),
    index("auth_accounts_email_idx").on(table.email),
    index("auth_accounts_phone_number_idx").on(table.phoneNumber),
    index("auth_accounts_is_primary_idx").on(table.isPrimary),
    // Composite index for user's accounts
    index("auth_accounts_user_provider_idx").on(table.userId, table.provider),
  ],
);

// =============================================================================
// AUTH SESSIONS TABLE
// =============================================================================

/**
 * Authentication sessions (for temporary auth flows like WhatsApp verification)
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: serial("id").notNull().primaryKey(),
    sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),

    // Session type and data
    sessionType: varchar("session_type", { length: 50 }).notNull(), // whatsapp_auth, email_verify, oauth_link
    provider: varchar("provider", { length: 50 }).notNull(),

    // Verification data
    verificationCode: varchar("verification_code", { length: 10 }),
    verificationData: jsonb("verification_data"), // Additional data needed for verification

    // Contact info being verified
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 50 }),
    countryCode: varchar("country_code", { length: 10 }),

    // Device and context
    deviceType: varchar("device_type", { length: 20 }), // mobile, desktop
    deviceFingerprint: text("device_fingerprint"),
    ipAddress: varchar("ip_address", { length: 50 }),
    userAgent: text("user_agent"),

    // User and org association (may be null for new signups)
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    orgId: integer("org_id").references(() => orgs.id, { onDelete: "cascade" }),

    // Session status
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending, code_sent, verified, expired, failed

    // Onboarding context
    onboardingSessionId: varchar("onboarding_session_id", { length: 255 }),
    onboardingData: jsonb("onboarding_data"),

    // Security
    verificationAttempts: integer("verification_attempts").default(0),
    maxAttempts: integer("max_attempts").default(3),

    // Timestamps
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_sessions_session_token_idx").on(table.sessionToken),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_org_id_idx").on(table.orgId),
    index("auth_sessions_status_idx").on(table.status),
    index("auth_sessions_email_idx").on(table.email),
    index("auth_sessions_phone_number_idx").on(table.phoneNumber),
    index("auth_sessions_onboarding_session_id_idx").on(table.onboardingSessionId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

// =============================================================================
// AUTH LOGS TABLE
// =============================================================================

/**
 * Authentication logs for security and audit
 */
export const authLogs = pgTable(
  "auth_logs",
  {
    id: serial("id").notNull().primaryKey(),
    sessionId: integer("session_id").references(() => authSessions.id, {
      onDelete: "cascade",
    }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    orgId: integer("org_id").references(() => orgs.id, {
      onDelete: "cascade",
    }),
    accountId: integer("account_id").references(() => authAccounts.id, {
      onDelete: "set null",
    }),

    // Event details
    eventType: varchar("event_type", { length: 50 }).notNull(),
    // Events: session_created, code_sent, code_verified, login_success, login_failed,
    // account_linked, account_unlinked, password_reset, etc.

    provider: varchar("provider", { length: 50 }),
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 50 }),

    // Request context
    ipAddress: varchar("ip_address", { length: 50 }),
    userAgent: text("user_agent"),
    deviceFingerprint: text("device_fingerprint"),

    // Additional data
    metadata: jsonb("metadata"),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_logs_session_id_idx").on(table.sessionId),
    index("auth_logs_user_id_idx").on(table.userId),
    index("auth_logs_org_id_idx").on(table.orgId),
    index("auth_logs_account_id_idx").on(table.accountId),
    index("auth_logs_event_type_idx").on(table.eventType),
    index("auth_logs_provider_idx").on(table.provider),
    index("auth_logs_created_at_idx").on(table.createdAt),
  ],
);

// =============================================================================
// RELATIONS
// =============================================================================

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, {
    fields: [authAccounts.userId],
    references: [users.id],
  }),
  org: one(orgs, {
    fields: [authAccounts.orgId],
    references: [orgs.id],
  }),
}));

export const authSessionsRelations = relations(authSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
  org: one(orgs, {
    fields: [authSessions.orgId],
    references: [orgs.id],
  }),
  logs: many(authLogs),
}));

export const authLogsRelations = relations(authLogs, ({ one }) => ({
  session: one(authSessions, {
    fields: [authLogs.sessionId],
    references: [authSessions.id],
  }),
  user: one(users, {
    fields: [authLogs.userId],
    references: [users.id],
  }),
  org: one(orgs, {
    fields: [authLogs.orgId],
    references: [orgs.id],
  }),
  account: one(authAccounts, {
    fields: [authLogs.accountId],
    references: [authAccounts.id],
  }),
}));

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type AuthAccount = typeof authAccounts.$inferSelect;
export type NewAuthAccount = typeof authAccounts.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
export type AuthLog = typeof authLogs.$inferSelect;
export type NewAuthLog = typeof authLogs.$inferInsert;

// =============================================================================
// PASSWORD RESET TOKENS TABLE
// =============================================================================

/**
 * Single-use password reset tokens issued by the forgot-password flow.
 *
 * A token is valid while `used_at` is NULL and `expires_at` is in the future.
 * Requesting a new reset deletes the user's outstanding unused tokens, so at
 * most one live link exists per user at a time.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").notNull().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_token_idx").on(table.token),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

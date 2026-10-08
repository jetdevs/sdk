/**
 * Access module tables (p107 ACC-001, specs §4).
 *
 * Connect-level, app-scoped, no `org_id`. Kinds/states are varchar + CHECK
 * (no pgEnum — enums break idempotent hand SQL). The DDL source of truth is
 * `sql/access-ddl.ts`; this file is the drizzle query view and must match it.
 *
 * Deliberately NOT exported from `@jetdevs/core/db/schema` (would leak into
 * every consumer's drizzle set); import from `@jetdevs/core/access`.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../../db/schema/orgs';
import type { AccessCopy, WaitlistQuestion, WaitlistResendEvent } from './types';

export const accessCodes = pgTable(
  'access_codes',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 32 }).notNull(),
    kind: varchar('kind', { length: 16 }).notNull(),
    ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * External owner of a personal code when the owner has no Connect user
     * (YMS-474), e.g. `yobo:user:526`. Only on a personal code, and never
     * beside owner_user_id (access_codes_personal_owner_chk). An admin-made
     * personal code with neither owner stays legal (createCode allows it).
     */
    ownerRef: varchar('owner_ref', { length: 128 }),
    app: varchar('app', { length: 64 }).notNull(),
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    tag: varchar('tag', { length: 128 }),
    grantsAccess: boolean('grants_access').notNull().default(true),
    boundEmail: varchar('bound_email', { length: 255 }),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('access_codes_code_upper_idx').on(sql`upper(${t.code})`),
    uniqueIndex('access_codes_personal_owner_idx')
      .on(t.ownerUserId, t.app)
      .where(sql`kind = 'personal'`),
    uniqueIndex('access_codes_personal_owner_ref_idx')
      .on(t.app, t.ownerRef)
      .where(sql`kind = 'personal' AND owner_ref IS NOT NULL`),
    index('access_codes_app_idx').on(t.app),
    index('access_codes_bound_email_idx')
      .on(sql`lower(${t.boundEmail})`)
      .where(sql`bound_email IS NOT NULL`),
    check('access_codes_kind_chk', sql`kind IN ('personal','campaign','single_use')`),
    check('access_codes_status_chk', sql`status IN ('active','revoked')`),
    check('access_codes_uses_chk', sql`uses >= 0`),
    check('access_codes_max_uses_chk', sql`max_uses IS NULL OR max_uses >= 0`),
    check(
      'access_codes_personal_owner_chk',
      sql`owner_ref IS NULL OR (kind = 'personal' AND owner_user_id IS NULL)`,
    ),
  ],
);

export const accessRedemptions = pgTable(
  'access_redemptions',
  {
    id: serial('id').primaryKey(),
    codeId: integer('code_id')
      .notNull()
      .references(() => accessCodes.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    app: varchar('app', { length: 64 }).notNull(),
    source: varchar('source', { length: 8 }).notNull(),
    firstTouchAt: timestamp('first_touch_at', { withTimezone: true }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('access_redemptions_code_user_idx').on(t.codeId, t.userId),
    index('access_redemptions_user_idx').on(t.userId),
    check('access_redemptions_source_chk', sql`source IN ('link','typed')`),
  ],
);

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: serial('id').primaryKey(),
    app: varchar('app', { length: 64 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    state: varchar('state', { length: 16 }).notNull().default('pending'),
    sourceCodeId: integer('source_code_id').references(() => accessCodes.id, { onDelete: 'set null' }),
    /** sha256 hex of the raw access token. The raw token is never stored. */
    accessTokenHash: varchar('access_token_hash', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    resendHistory: jsonb('resend_history').$type<WaitlistResendEvent[]>().notNull().default([]),
    decidedBy: integer('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('waitlist_entries_pending_email_idx')
      .on(t.app, sql`lower(${t.email})`)
      .where(sql`state = 'pending'`),
    uniqueIndex('waitlist_entries_token_hash_idx')
      .on(t.accessTokenHash)
      .where(sql`access_token_hash IS NOT NULL`),
    index('waitlist_entries_app_state_idx').on(t.app, t.state),
    check('waitlist_entries_state_chk', sql`state IN ('pending','approved','rejected','signed_up')`),
  ],
);

export const appAccessSettings = pgTable(
  'app_access_settings',
  {
    app: varchar('app', { length: 64 }).primaryKey(),
    mode: varchar('mode', { length: 16 }).notNull().default('off'),
    personalCodeDefaultCap: integer('personal_code_default_cap').notNull().default(10),
    waitlistQuestions: jsonb('waitlist_questions').$type<WaitlistQuestion[]>().notNull().default([]),
    copy: jsonb('copy').$type<AccessCopy>().notNull().default({}),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check('app_access_settings_mode_chk', sql`mode IN ('off','optional','required')`),
    check('app_access_settings_cap_chk', sql`personal_code_default_cap >= 0`),
  ],
);

export const accessTables = {
  accessCodes,
  accessRedemptions,
  waitlistEntries,
  appAccessSettings,
};

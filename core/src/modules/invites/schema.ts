/**
 * `org_invites` drizzle view (p131 INV-001). DDL source of truth is
 * `sql/invites-ddl.ts`; this must match it. Not exported from
 * `@jetdevs/core/db/schema` — only IdPs (Connect) import it.
 */
import { sql } from 'drizzle-orm';
import { char, check, index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { orgs } from '../../db/schema/orgs';

export const orgInvites = pgTable(
  'org_invites',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    roleRef: varchar('role_ref', { length: 64 }).notNull(),
    roleName: varchar('role_name', { length: 128 }).notNull(),
    invitedBySub: varchar('invited_by_sub', { length: 255 }).notNull(),
    invitedByName: varchar('invited_by_name', { length: 255 }),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    sourceSystem: varchar('source_system', { length: 64 }).notNull(),
    appUrl: text('app_url').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique('org_invites_token_hash_key'),
    accessCodeId: integer('access_code_id'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedUserId: integer('accepted_user_id'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    provisionState: varchar('provision_state', { length: 16 }).notNull().default('none'),
    provisionAttempts: integer('provision_attempts').notNull().default(0),
  },
  (t) => [
    uniqueIndex('org_invites_one_open_per_email').on(t.orgId, t.email).where(sql`status = 'pending'`),
    index('org_invites_org_status_idx').on(t.orgId, t.status),
    check('org_invites_status_chk', sql`status IN ('pending','accepted','cancelled','expired')`),
  ],
);

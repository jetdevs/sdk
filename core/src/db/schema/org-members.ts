/**
 * Org Members Schema
 *
 * Dedicated membership table for user-organization relationships.
 * Separates membership (is user in org?) from authorization (what can user do?).
 *
 * Key design decisions:
 * - UNIQUE(user_id, org_id) prevents duplicate memberships
 * - Status enum tracks lifecycle: invited -> active -> suspended -> removed
 * - pending_role_id stores role selected at invite time; assigned on accept()
 * - Soft-delete via 'removed' status preserves audit trail
 */

import {
  pgTable,
  pgEnum,
  serial,
  uuid,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { orgs, users } from "./orgs";
import { roles } from "./rbac";

// =============================================================================
// ENUMS
// =============================================================================

export const orgMemberStatusEnum = pgEnum("org_member_status", [
  "invited",    // Invitation sent, not yet accepted
  "active",     // Full member
  "suspended",  // Temporarily blocked (roles intact)
  "removed",    // Removed from org (soft delete)
]);

// =============================================================================
// ORG MEMBERS TABLE
// =============================================================================

export const orgMembers = pgTable(
  "org_members",
  {
    id: serial("id").notNull().primaryKey(),
    uuid: uuid("uuid").unique().notNull().defaultRandom(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: integer("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    status: orgMemberStatusEnum("status").notNull().default("invited"),
    pendingRoleId: integer("pending_role_id")
      .references(() => roles.id, { onDelete: "set null" }),
    invitedBy: integer("invited_by")
      .references(() => users.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true, mode: "date" })
      .defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
    removedBy: integer("removed_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("org_members_user_org_idx").on(table.userId, table.orgId),
    index("org_members_org_id_idx").on(table.orgId),
    index("org_members_user_id_idx").on(table.userId),
    index("org_members_status_idx").on(table.orgId, table.status),
  ],
);

// =============================================================================
// RELATIONS
// =============================================================================

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
    relationName: "orgMemberUser",
  }),
  org: one(orgs, {
    fields: [orgMembers.orgId],
    references: [orgs.id],
  }),
  pendingRole: one(roles, {
    fields: [orgMembers.pendingRoleId],
    references: [roles.id],
  }),
  inviter: one(users, {
    fields: [orgMembers.invitedBy],
    references: [users.id],
    relationName: "orgMemberInviter",
  }),
  remover: one(users, {
    fields: [orgMembers.removedBy],
    references: [users.id],
    relationName: "orgMemberRemover",
  }),
}));

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

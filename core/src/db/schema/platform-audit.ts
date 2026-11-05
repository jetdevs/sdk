/**
 * Platform (org-less) audit log table definition. OPT-IN.
 *
 * Deliberately NOT re-exported from `./index`: apps that want it import
 * `platformAuditLogs` from `@jetdevs/core/db/schema/platform-audit` and add it
 * to their own drizzle schema + migration. No org_id (cross-org platform
 * events, e.g. a super-user exporting all orgs' audit data, would FK-violate
 * org_audit_logs.org_id NOT NULL). Not tenant data: no RLS policy; write and
 * read only through a privileged connection behind a permission guard.
 *
 * Row shape matches `PlatformAuditRow` in `@jetdevs/framework/audit`.
 */
import { index, jsonb, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const platformAuditLogs = pgTable(
  "platform_audit_logs",
  {
    id: serial("id").notNull().primaryKey(),
    uuid: uuid("uuid").unique().notNull().defaultRandom(),
    actorKind: varchar("actor_kind", { length: 20 }).notNull(), // user | api_key | system | agent
    actorId: varchar("actor_id", { length: 255 }),
    action: varchar("action", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("INFO"),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }),
    entityName: varchar("entity_name", { length: 255 }),
    changes: jsonb("changes"),
    metadata: jsonb("metadata"),
    requestId: varchar("request_id", { length: 100 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("platform_audit_logs_action_idx").on(table.action),
    index("platform_audit_logs_actor_idx").on(table.actorKind, table.actorId),
    index("platform_audit_logs_created_at_idx").on(table.createdAt),
  ],
);

import { createAuditPolicy, type AuditPolicy, type AuditPolicyOptions } from './pii';
import type { AuditEvent, AuditWriter, OrgAuditEvent, PlatformAuditEvent } from './types';

/** Minimal structural drizzle surface; avoids a drizzle import. */
export interface AuditInsertDb {
  insert(table: never): { values(row: never): PromiseLike<unknown> };
}

/** Row shape for core `orgAuditLogs`. */
export interface OrgAuditRow {
  orgId: number;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Row shape for core `auditLogs` (table `audit_logs`) with org_id NULL.
 * Actor kind/id, entity name, changes, severity, requestId live in `details`.
 */
export interface PlatformAuditRow {
  orgId: null;
  userId: number | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}

export type OrgAuditSink = (row: OrgAuditRow, event: OrgAuditEvent) => Promise<void>;
export type PlatformAuditSink = (row: PlatformAuditRow, event: PlatformAuditEvent) => Promise<void>;

export interface CreateAuditWriterOptions {
  /** Org events. Implement with the RLS-scoped db for `event.orgId` (dbWithRLS). Missing => org events fail. */
  orgSink?: OrgAuditSink;
  /** Platform events (org-less; written to core `audit_logs` with org_id NULL via a privileged writer, NOT the RLS db). Missing => platform events fail. */
  platformSink?: PlatformAuditSink;
  policy?: AuditPolicy | AuditPolicyOptions;
  /**
   * `swallow` (default; yobo/core-saas behaviour) logs sink failures via `onError`
   * and resolves. `throw` rethrows (fail-closed, engage behaviour).
   * AuditPiiError and missing-sink errors always throw.
   */
  failMode?: 'swallow' | 'throw';
  onError?: (error: unknown, event: AuditEvent) => void;
}

export function actorColumns(event: AuditEvent): { kind: string; id: string | null; userId: number | null; email: string | null; name: string | null } {
  const a = event.actor;
  switch (a.kind) {
    case 'user':
      return { kind: a.kind, id: a.userId == null ? null : String(a.userId), userId: a.userId, email: a.email ?? null, name: a.name ?? null };
    case 'api_key':
      return { kind: a.kind, id: String(a.apiKeyId), userId: null, email: null, name: a.label ?? null };
    case 'agent':
      return { kind: a.kind, id: a.agentId, userId: a.onBehalfOfUserId ?? null, email: null, name: null };
    case 'system':
      return { kind: a.kind, id: null, userId: null, email: null, name: a.name ?? null };
  }
}

const isPolicy = (p: AuditPolicy | AuditPolicyOptions): p is AuditPolicy =>
  typeof (p as AuditPolicy).enforce === 'function';

export function createAuditWriter(opts: CreateAuditWriterOptions): AuditWriter {
  const policy = !opts.policy ? createAuditPolicy() : isPolicy(opts.policy) ? opts.policy : createAuditPolicy(opts.policy);
  const failMode = opts.failMode ?? 'swallow';
  const onError = opts.onError ?? ((e: unknown) => console.error('[audit] write failed:', e));

  return {
    async write(event: AuditEvent): Promise<void> {
      // Policy first, outside the swallow: a PII event is a programmer error.
      const changes = policy.enforce(event.changes ?? null);
      const metadata = policy.enforce(event.metadata ?? null);
      const actor = actorColumns(event);
      const common = {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        entityName: event.entityName ?? null,
        changes,
        requestId: event.request?.requestId ?? null,
        ipAddress: event.request?.ipAddress ?? null,
        userAgent: event.request?.userAgent ?? null,
      };

      if (event.scope === 'org') {
        if (!opts.orgSink) throw new Error('AuditWriter: orgSink not configured');
        if (!Number.isInteger(event.orgId)) throw new Error('AuditWriter: org event requires orgId');
        const row: OrgAuditRow = {
          ...common,
          orgId: event.orgId,
          userId: actor.userId,
          userEmail: actor.email,
          userName: actor.name,
          // org_audit_logs has no actor-kind column: keep it in metadata.
          metadata: { ...(metadata ?? {}), actor: { kind: actor.kind, id: actor.id } },
        };
        await run(() => opts.orgSink!(row, event));
        return;
      }

      if (!opts.platformSink) throw new Error('AuditWriter: platformSink not configured');
      const row: PlatformAuditRow = {
        orgId: null,
        userId: actor.userId,
        action: event.action,
        resource: event.entityType,
        resourceId: event.entityId ?? null,
        details: {
          ...(metadata ?? {}),
          actor: { kind: actor.kind, id: actor.id },
          entityName: event.entityName ?? null,
          changes,
          severity: event.severity ?? 'INFO',
          requestId: event.request?.requestId ?? null,
        },
        ipAddress: event.request?.ipAddress ?? null,
        userAgent: event.request?.userAgent ?? null,
      };
      await run(() => opts.platformSink!(row, event));

      async function run(fn: () => Promise<void>): Promise<void> {
        try {
          await fn();
        } catch (error) {
          if (failMode === 'throw') throw error;
          onError(error, event);
        }
      }
    },
  };
}

export interface DrizzleAuditWriterOptions extends Omit<CreateAuditWriterOptions, 'orgSink' | 'platformSink'> {
  /** Run `fn` with a db whose RLS context is `orgId` (e.g. SDK dbWithRLS). */
  withOrgDb: (orgId: number, fn: (db: AuditInsertDb) => Promise<void>) => Promise<void>;
  /** core `orgAuditLogs` table. */
  orgTable: unknown;
  /** Privileged db (bypasses RLS; no org context exists) for org-less events. Omit to refuse platform events. */
  platformDb?: AuditInsertDb;
  /** core `auditLogs` table (org_id nullable). */
  platformTable?: unknown;
}

/** Convenience: wire the writer to drizzle tables via an injected RLS db. */
export function createDrizzleAuditWriter(opts: DrizzleAuditWriterOptions): AuditWriter {
  const { withOrgDb, orgTable, platformDb, platformTable, ...rest } = opts;
  return createAuditWriter({
    ...rest,
    orgSink: async (row) => {
      await withOrgDb(row.orgId, async (db) => {
        await db.insert(orgTable as never).values(row as never);
      });
    },
    platformSink:
      platformDb && platformTable
        ? async (row) => {
            await platformDb.insert(platformTable as never).values(row as never);
          }
        : undefined,
  });
}

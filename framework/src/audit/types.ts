/**
 * Audit event model + writer contract.
 *
 * Merged from the app copies (yobo `org-audit.ts`, crm `platform-audit.ts`,
 * core-saas/cadra-web `audit.ts`, engage `engage-audit.ts`). Storage-agnostic:
 * apps inject the sink (see `createDrizzleAuditWriter`).
 */

/** Who did it. `kind` is stored with every event so api-key / agent / system writes are distinguishable. */
export type AuditActor =
  | { kind: 'user'; userId: number | null; email?: string | null; name?: string | null }
  | { kind: 'api_key'; apiKeyId: number; label?: string | null }
  | { kind: 'system'; name?: string | null }
  | { kind: 'agent'; agentId: string; onBehalfOfUserId?: number | null };

export type AuditActorKind = AuditActor['kind'];

/** Request metadata. Build with `auditRequestMeta(headers)`. */
export interface AuditRequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  /** x-request-id / traceparent trace id; correlates related events. */
  requestId?: string | null;
}

export type AuditSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

interface AuditEventBase {
  /** Free-form action tag, e.g. 'CREATE', 'PERMISSION_DENIED'. */
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  /** before/after values. Scanned by the never-log-PII policy. */
  changes?: Record<string, unknown> | null;
  /** Extra context. Scanned by the never-log-PII policy. */
  metadata?: Record<string, unknown> | null;
  actor: AuditActor;
  request?: AuditRequestMeta;
  severity?: AuditSeverity;
  /** Defaults to now. */
  timestamp?: Date;
}

/** Event belonging to exactly one org. Written through the org-scoped (RLS) sink. */
export interface OrgAuditEvent extends AuditEventBase {
  scope: 'org';
  orgId: number;
}

/** Org-less platform event (cross-org export, login failure with no org...). Written to the platform sink. */
export interface PlatformAuditEvent extends AuditEventBase {
  scope: 'platform';
}

export type AuditEvent = OrgAuditEvent | PlatformAuditEvent;

/**
 * Contract other SDK modules (e.g. *WithAudit procedures) accept.
 * Implementations may swallow sink failures (default) but MUST throw
 * `AuditPiiError` when an event carries a never-log field.
 */
export interface AuditWriter {
  write(event: AuditEvent): Promise<void>;
}

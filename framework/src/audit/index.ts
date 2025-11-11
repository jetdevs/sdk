/**
 * Audit Logging System
 *
 * Provides centralized audit logging for all domain operations.
 * Automatically captures who, what, when, where for compliance and debugging.
 */

import { getRLSContext } from '../rls';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  orgId: number;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'publish'
  | 'unpublish'
  | 'approve'
  | 'reject'
  | 'login'
  | 'logout'
  | 'export'
  | 'import'
  | 'bulk_update'
  | 'bulk_delete'
  | 'permission_grant'
  | 'permission_revoke';

export interface AuditContext {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
}

/**
 * Log an audit entry
 *
 * @example
 * ```typescript
 * await auditLog({
 *   entityType: 'product',
 *   entityId: product.uuid,
 *   action: 'create',
 *   metadata: { sku: product.sku }
 * });
 * ```
 */
export async function auditLog(context: AuditContext): Promise<void> {
  const rlsContext = getRLSContext();

  if (!rlsContext) {
    console.warn('Audit log called without RLS context');
    return;
  }

  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    orgId: rlsContext.orgId,
    userId: rlsContext.userId || 'system',
    action: context.action,
    entityType: context.entityType,
    entityId: context.entityId,
    changes: context.changes,
    metadata: context.metadata,
    success: true,
  };

  // In production, this would write to database or event stream
  // For now, log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[AUDIT]', JSON.stringify(entry, null, 2));
  }

  // TODO: Implement actual persistence
  // await db.insert(auditLogs).values(entry);
}

/**
 * Get audit trail for an entity
 *
 * @example
 * ```typescript
 * const history = await getAuditTrail('product', product.uuid);
 * ```
 */
export async function getAuditTrail(
  entityType: string,
  entityId: string,
  options?: {
    limit?: number;
    offset?: number;
    actions?: AuditAction[];
    startDate?: Date;
    endDate?: Date;
  }
): Promise<AuditEntry[]> {
  const rlsContext = getRLSContext();

  if (!rlsContext) {
    throw new Error('Cannot get audit trail without RLS context');
  }

  // TODO: Implement actual query
  // const entries = await db.query.auditLogs.findMany({
  //   where: and(
  //     eq(auditLogs.orgId, rlsContext.orgId),
  //     eq(auditLogs.entityType, entityType),
  //     eq(auditLogs.entityId, entityId),
  //   ),
  //   orderBy: desc(auditLogs.timestamp),
  //   limit: options?.limit || 50,
  // });

  return [];
}

/**
 * Helper to calculate diff between old and new data
 */
export function calculateChanges<T extends Record<string, any>>(
  oldData: T,
  newData: T
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};

  for (const key in newData) {
    if (oldData[key] !== newData[key]) {
      changes[key] = {
        old: oldData[key],
        new: newData[key],
      };
    }
  }

  return changes;
}
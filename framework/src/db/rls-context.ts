/**
 * RLS Database Context Management
 *
 * Provides utilities for managing Row-Level Security context
 * in multi-tenant PostgreSQL databases.
 *
 * @module @yobolabs/framework/db/rls-context
 */

import type { Actor, DbAccessOptions } from '../auth/actor';
import { AuthError } from '../auth/actor';

/**
 * Database context result
 */
export interface DbContext<TDb = any> {
  dbFunction: (callback: (db: TDb) => Promise<any>) => Promise<any>;
  effectiveOrgId: number | null;
  isPrivileged: boolean;
}

/**
 * SQL template literal type for RLS context setting
 */
export interface SqlTemplate {
  (strings: TemplateStringsArray, ...values: any[]): any;
}

/**
 * Determines which database context to use based on actor and options
 *
 * @param ctx - The context with database and potentially privileged access
 * @param actor - The authenticated actor
 * @param options - Database access options
 * @returns Object with database connection function and metadata
 */
export function getDbContext<TDb = any>(
  ctx: {
    db: TDb;
    withPrivilegedDb?: (callback: (db: TDb) => Promise<any>) => Promise<any>;
    [key: string]: any;
  },
  actor: Actor,
  options: DbAccessOptions = {},
  sql?: SqlTemplate
): DbContext<TDb> {
  const {
    crossOrgAccess = false,
    bypassRLS = false,
    targetOrgId,
    allowNullOrgContext = false
  } = options;

  // Determine the effective org ID
  const effectiveOrgId = targetOrgId || actor.orgId;

  // System users requesting cross-org access or bypass RLS
  if (actor.isSystemUser && (crossOrgAccess || bypassRLS)) {
    if (!ctx.withPrivilegedDb) {
      throw new AuthError(
        'BAD_REQUEST',
        'Privileged database access not available in this context'
      );
    }
    return {
      dbFunction: ctx.withPrivilegedDb,
      effectiveOrgId,
      isPrivileged: true
    };
  }

  // System users without org context in backoffice
  if (actor.isSystemUser && !effectiveOrgId && allowNullOrgContext) {
    if (!ctx.withPrivilegedDb) {
      throw new AuthError(
        'BAD_REQUEST',
        'Privileged database access not available in this context'
      );
    }
    return {
      dbFunction: ctx.withPrivilegedDb,
      effectiveOrgId: null,
      isPrivileged: true
    };
  }

  // Regular org-scoped access with RLS
  if (!effectiveOrgId) {
    throw new AuthError(
      'BAD_REQUEST',
      'Organization context required for this operation'
    );
  }

  // If SQL template is provided, create RLS context setter
  if (sql && typeof (ctx.db as any).transaction === 'function') {
    // Return a function that sets RLS context and executes the callback
    const dbFunction = async (callback: (db: TDb) => Promise<any>) => {
      try {
        return await (ctx.db as any).transaction(async (tx: any) => {
          try {
            // Set RLS context using PostgreSQL set_config
            // Using 'rls.current_org_id' as that's what RLS policies expect
            // Using false (session-level) instead of true (transaction-level) because
            // Drizzle's transaction handling doesn't maintain context between execute() calls
            await tx.execute(sql`SELECT set_config('rls.current_org_id', ${effectiveOrgId.toString()}, false)`);
          } catch (err: any) {
            console.error('🔐 [getDbContext] Error setting RLS context:', err);
            // Continue even if there's an error - some operations might not need RLS
          }

          // Execute the callback
          return await callback(tx);
        });
      } catch (err: any) {
        // Handle case where driver detection failed and transaction isn't actually supported
        // This can happen on Vercel/serverless when env detection doesn't work at module load
        if (err?.message?.includes('No transactions support') ||
            (err?.message?.includes('transaction') && err?.message?.includes('neon-http'))) {
          console.warn('[getDbContext] Transaction failed, falling back to non-transactional execution');
          return await callback(ctx.db);
        }
        throw err;
      }
    };

    return {
      dbFunction,
      effectiveOrgId,
      isPrivileged: false
    };
  }

  // Fallback: return direct database access (application must handle RLS context)
  return {
    dbFunction: async (callback) => callback(ctx.db),
    effectiveOrgId,
    isPrivileged: false
  };
}

/**
 * Create a service context with appropriate database access
 *
 * @param ctx - The context with database
 * @param actor - The authenticated actor
 * @param options - Database access options
 * @returns Service context with configured database access
 */
export async function createServiceContextWithDb<TDb = any>(
  ctx: {
    db: TDb;
    withPrivilegedDb?: (callback: (db: TDb) => Promise<any>) => Promise<any>;
    [key: string]: any;
  },
  actor: Actor,
  options: DbAccessOptions = {},
  sql?: SqlTemplate
): Promise<{
  db: TDb;
  actor: Actor;
  orgId: number | null;
  isCrossOrg: boolean;
  withRLS: DbContext<TDb>;
}> {
  const dbExecutor = getDbContext(ctx, actor, options, sql);
  const effectiveOrgId = options.targetOrgId || actor.orgId;

  return {
    db: ctx.db,
    actor,
    orgId: effectiveOrgId,
    isCrossOrg: options.crossOrgAccess || false,
    withRLS: dbExecutor
  };
}
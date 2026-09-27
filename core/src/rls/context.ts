/**
 * RLS Context Management
 *
 * Functions for setting and clearing RLS context in database connections.
 */

import { is, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import type { DbClient } from '../db';

// =============================================================================
// CONSTANTS
// =============================================================================

export const RLS_ORG_VAR = 'rls.current_org_id';
export const RLS_USER_VAR = 'rls.current_user_id';

// =============================================================================
// CONTEXT FUNCTIONS
// =============================================================================

/**
 * Set RLS context variables on a database connection.
 *
 * The values are TRANSACTION-local (`set_config(..., true)`, same scope as
 * `SET LOCAL`). Called outside a transaction they die with the statement's
 * implicit transaction, before the next query runs — so pass a `tx`, or use
 * `withRlsContext`, which opens the transaction for you.
 *
 * @example
 * ```ts
 * await db.transaction(async (tx) => {
 *   await setRlsContext(tx, { orgId: 1, userId: 123 });
 *   return tx.query.customers.findMany();
 * });
 * ```
 */
export async function setRlsContext(
  db: DbClient,
  context: { orgId: number; userId?: number }
): Promise<void> {
  const { orgId, userId } = context;

  // Set org context (required for most RLS policies)
  await (db as any).execute(sql`SELECT set_config(${RLS_ORG_VAR}, ${String(orgId)}, true)`);

  // Set user context if provided
  if (userId !== undefined) {
    await (db as any).execute(sql`SELECT set_config(${RLS_USER_VAR}, ${String(userId)}, true)`);
  }
}

/**
 * Clear RLS context variables.
 *
 * Call this when done with RLS-filtered queries.
 */
export async function clearRlsContext(db: DbClient): Promise<void> {
  await (db as any).execute(`RESET ${RLS_ORG_VAR}`);
  await (db as any).execute(`RESET ${RLS_USER_VAR}`);
}

/**
 * Execute a function with RLS context set.
 *
 * Opens one transaction, sets the context inside it, and runs `fn` with the
 * transaction client, so every query in `fn` sees the context and it reverts
 * at COMMIT/ROLLBACK. When `db` is already a transaction it is reused (no
 * nested transaction); the context then lasts until that outer transaction
 * ends.
 *
 * @example
 * ```ts
 * const customers = await withRlsContext(db, { orgId: 1 }, async (tx) => {
 *   return tx.query.customers.findMany();
 * });
 * ```
 */
export async function withRlsContext<T>(
  db: DbClient,
  context: { orgId: number; userId?: number },
  fn: (db: DbClient) => Promise<T>
): Promise<T> {
  const run = async (tx: DbClient): Promise<T> => {
    await setRlsContext(tx, context);
    return fn(tx);
  };

  if (is(db, PgTransaction)) {
    return run(db);
  }
  return (db as any).transaction((tx: DbClient) => run(tx));
}

/**
 * Check if RLS context is currently set.
 */
export async function hasRlsContext(db: DbClient): Promise<boolean> {
  try {
    const result = await (db as any).execute(
      `SELECT current_setting('${RLS_ORG_VAR}', true) as org_id`
    );
    return result?.[0]?.org_id !== null;
  } catch {
    return false;
  }
}

/**
 * Get current RLS context values.
 */
export async function getRlsContext(db: DbClient): Promise<{
  orgId: number | null;
  userId: number | null;
}> {
  try {
    const result = await (db as any).execute(`
      SELECT
        current_setting('${RLS_ORG_VAR}', true)::integer as org_id,
        current_setting('${RLS_USER_VAR}', true)::integer as user_id
    `);
    return {
      orgId: result?.[0]?.org_id ?? null,
      userId: result?.[0]?.user_id ?? null,
    };
  } catch {
    return { orgId: null, userId: null };
  }
}

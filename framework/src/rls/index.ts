/**
 * RLS Context Management
 *
 * Utilities for managing Row-Level Security context.
 * Provides helpers for setting and getting RLS context in database operations.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RLSContext {
  orgId: number;
  userId: number;
  workspaceId?: number;
}

/**
 * AsyncLocalStorage for RLS context
 * This provides proper async context isolation, preventing race conditions
 * in concurrent request handling
 */
const rlsContextStorage = new AsyncLocalStorage<RLSContext>();

/**
 * Execute a function with RLS context
 * @param context The RLS context
 * @param fn The function to execute
 */
export async function withRLSContext<T>(
  context: RLSContext,
  fn: () => Promise<T>
): Promise<T> {
  return rlsContextStorage.run(context, async () => {
    return await fn();
  });
}

/**
 * Get current RLS context
 * @returns The current RLS context or null
 */
export function getRLSContext(): RLSContext | null {
  return rlsContextStorage.getStore() ?? null;
}

/**
 * Set RLS parameters on database connection
 * @param db Database connection
 * @param context RLS context
 */
export async function setRLSParameters(
  db: any,
  context: RLSContext
): Promise<void> {
  // This would typically execute SQL to set session parameters
  // await db.execute(`SET rls.current_org_id = ${context.orgId}`);
  // await db.execute(`SET rls.current_user_id = '${context.userId}'`);

  // For now, just log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[RLS] Setting context:', context);
  }
}

/**
 * Clear RLS parameters on database connection
 * @param db Database connection
 */
export async function clearRLSParameters(db: any): Promise<void> {
  // This would typically reset session parameters
  // await db.execute('RESET rls.current_org_id');
  // await db.execute('RESET rls.current_user_id');

  // For now, just log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[RLS] Clearing context');
  }
}
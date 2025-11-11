/**
 * Internal RLS context management
 * This file contains implementation details that are hidden from SDK users
 * @internal
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { RLSContext } from './types';
import type { SQL } from 'drizzle-orm';

/**
 * AsyncLocalStorage for RLS context
 * This provides proper async context isolation, preventing race conditions
 * in concurrent request handling
 * @internal
 */
const rlsContextStorage = new AsyncLocalStorage<RLSContext>();

/**
 * Set the current RLS context
 * This is called internally by the framework and should not be exposed to developers
 * @internal
 * @deprecated Use withRLSContext instead for proper async isolation
 */
export function setRLSContext(context: RLSContext): void {
  // This is kept for backward compatibility but logs a warning
  console.warn(
    '[Framework] setRLSContext is deprecated. Use withRLSContext for proper async context isolation.'
  );
  // We can't set context without AsyncLocalStorage.run, so this throws
  throw new Error(
    'setRLSContext cannot be used directly. Use withRLSContext to run code with RLS context.'
  );
}

/**
 * Get the current RLS context
 * Throws if no context is available
 * @internal
 */
export function getRLSContext(): RLSContext {
  const context = rlsContextStorage.getStore();

  if (!context) {
    throw new Error(
      'No RLS context available. This typically means the request context was not properly initialized. ' +
      'Ensure your tRPC procedure is using orgProtectedProcedure and operations are wrapped in withRLSContext.'
    );
  }

  return context;
}

/**
 * Clear the current RLS context
 * @internal
 * @deprecated Context is automatically cleaned up when withRLSContext completes
 */
export function clearRLSContext(): void {
  // With AsyncLocalStorage, context is automatically cleaned up
  // This is kept for backward compatibility but does nothing
  console.warn(
    '[Framework] clearRLSContext is deprecated. Context is automatically cleaned up with AsyncLocalStorage.'
  );
}

/**
 * Execute a callback with RLS context set
 * Uses AsyncLocalStorage for proper async context isolation
 * @internal
 */
export async function withRLSContext<T>(
  context: RLSContext,
  callback: () => Promise<T>
): Promise<T> {
  return rlsContextStorage.run(context, async () => {
    return await callback();
  });
}

/**
 * Execute a synchronous callback with RLS context set
 * Uses AsyncLocalStorage for proper async context isolation
 * @internal
 */
export function withRLSContextSync<T>(
  context: RLSContext,
  callback: () => T
): T {
  return rlsContextStorage.run(context, () => {
    return callback();
  });
}

/**
 * Check if RLS context is currently available
 * Useful for conditional logic that adapts based on context availability
 * @internal
 */
export function hasRLSContext(): boolean {
  return rlsContextStorage.getStore() !== undefined;
}

/**
 * Get RLS context if available, otherwise return null
 * Useful for optional RLS enforcement scenarios
 * @internal
 */
export function getRLSContextOptional(): RLSContext | null {
  return rlsContextStorage.getStore() ?? null;
}

/**
 * Generate SQL for setting PostgreSQL RLS context
 * @internal
 */
export function generateRLSContextSQL(context: RLSContext): SQL {
  // This would be implemented to generate proper SQL
  // For now, it's a placeholder that will be connected to the actual implementation
  throw new Error('generateRLSContextSQL not yet implemented - will be connected to merchant-portal DB layer');
}

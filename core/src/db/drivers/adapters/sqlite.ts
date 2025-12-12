/**
 * better-sqlite3 Driver Adapter
 *
 * Adapter for the better-sqlite3 driver.
 * This is the recommended driver for:
 * - Local development with SQLite
 * - Testing without external database
 * - Embedded applications
 *
 * @module @yobolabs/core/db/drivers/adapters/sqlite
 */

import type {
  DriverAdapter,
  SQLiteDriverConfig,
} from '../types';

/**
 * Create a better-sqlite3 driver adapter
 *
 * @param config - SQLite driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createSQLiteAdapter({
 *   filename: ':memory:', // or './dev.db'
 *   walMode: true,
 * });
 * ```
 */
export async function createSQLiteAdapter(
  _config: SQLiteDriverConfig
): Promise<DriverAdapter<any>> {
  // TODO: Implement SQLite adapter when needed
  throw new Error(
    'SQLite adapter is not yet implemented. ' +
    'Please use postgres driver for local development, ' +
    'or contribute an implementation.'
  );
}

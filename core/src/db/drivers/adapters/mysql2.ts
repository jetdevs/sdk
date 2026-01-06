/**
 * MySQL2 Driver Adapter
 *
 * Adapter for the mysql2 driver.
 * This is the recommended driver for:
 * - Traditional MySQL servers
 * - AWS RDS MySQL/Aurora MySQL
 *
 * @module @jetdevs/core/db/drivers/adapters/mysql2
 */

import type {
    DriverAdapter,
    MySQL2DriverConfig,
} from '../types';

/**
 * Create a MySQL2 driver adapter
 *
 * @param config - MySQL2 driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createMySQL2Adapter({
 *   url: process.env.DATABASE_URL!,
 *   pool: { max: 10 },
 * });
 * ```
 */
export async function createMySQL2Adapter(
  _config: MySQL2DriverConfig
): Promise<DriverAdapter<any>> {
  // TODO: Implement MySQL2 adapter when needed
  throw new Error(
    'MySQL2 adapter is not yet implemented. ' +
    'Please use PlanetScale driver for MySQL serverless, ' +
    'or contribute an implementation.'
  );
}

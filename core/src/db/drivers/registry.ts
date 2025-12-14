/**
 * Database Driver Registry
 *
 * Central registry for all database driver adapters. Drivers are lazily loaded
 * to avoid bundling unnecessary dependencies.
 *
 * @module @yobolabs/core/db/drivers
 */

import type {
  DatabaseDriver,
  DatabaseDialect,
  DriverCapabilities,
  DriverRegistryEntry,
  BaseDriverConfig,
  DriverAdapter,
} from './types';

// =============================================================================
// DRIVER CAPABILITIES DEFINITIONS
// =============================================================================

/**
 * Capabilities for postgres.js driver
 */
const POSTGRES_CAPABILITIES: DriverCapabilities = {
  transactions: true,
  nestedTransactions: true,
  preparedStatements: true,
  connectionPooling: true,
  serverless: false, // Can work but not optimal
  streaming: true,
  batchQueries: true,
  returning: true,
};

/**
 * Capabilities for Neon HTTP driver
 */
const NEON_HTTP_CAPABILITIES: DriverCapabilities = {
  transactions: false, // Single-query only via HTTP
  nestedTransactions: false,
  preparedStatements: false,
  connectionPooling: false, // Serverless, no persistent connections
  serverless: true,
  streaming: false,
  batchQueries: true, // Via batch API
  returning: true,
};

/**
 * Capabilities for Neon WebSocket driver
 */
const NEON_WS_CAPABILITIES: DriverCapabilities = {
  transactions: true,
  nestedTransactions: true,
  preparedStatements: true,
  connectionPooling: true,
  serverless: true,
  streaming: false,
  batchQueries: true,
  returning: true,
};

/**
 * Capabilities for node-postgres (pg) driver
 */
const PG_CAPABILITIES: DriverCapabilities = {
  transactions: true,
  nestedTransactions: true,
  preparedStatements: true,
  connectionPooling: true,
  serverless: false,
  streaming: true,
  batchQueries: true,
  returning: true,
};

/**
 * Capabilities for PlanetScale driver
 */
const PLANETSCALE_CAPABILITIES: DriverCapabilities = {
  transactions: false, // HTTP-based, no transaction support
  nestedTransactions: false,
  preparedStatements: false,
  connectionPooling: false,
  serverless: true,
  streaming: false,
  batchQueries: true,
  returning: false, // MySQL doesn't have RETURNING
  maxParameters: 65535,
};

/**
 * Capabilities for MySQL2 driver
 */
const MYSQL2_CAPABILITIES: DriverCapabilities = {
  transactions: true,
  nestedTransactions: true,
  preparedStatements: true,
  connectionPooling: true,
  serverless: false,
  streaming: true,
  batchQueries: true,
  returning: false,
  maxParameters: 65535,
};


// =============================================================================
// DRIVER REGISTRY
// =============================================================================

/**
 * Internal registry of all known drivers
 */
const driverRegistry = new Map<DatabaseDriver, DriverRegistryEntry>();

/**
 * Register a driver in the registry
 */
export function registerDriver<TConfig extends BaseDriverConfig>(
  entry: DriverRegistryEntry<TConfig>
): void {
  driverRegistry.set(entry.driver, entry as DriverRegistryEntry);
}

/**
 * Get a driver from the registry
 */
export function getDriver(driver: DatabaseDriver): DriverRegistryEntry | undefined {
  return driverRegistry.get(driver);
}

/**
 * Get all registered drivers
 */
export function getAllDrivers(): DriverRegistryEntry[] {
  return Array.from(driverRegistry.values());
}

/**
 * Check if a driver is registered
 */
export function hasDriver(driver: DatabaseDriver): boolean {
  return driverRegistry.has(driver);
}

/**
 * Get drivers by dialect
 */
export function getDriversByDialect(dialect: DatabaseDialect): DriverRegistryEntry[] {
  return getAllDrivers().filter((entry) => entry.dialect === dialect);
}

/**
 * Get drivers suitable for serverless
 */
export function getServerlessDrivers(): DriverRegistryEntry[] {
  return getAllDrivers().filter((entry) => entry.capabilities.serverless);
}

// =============================================================================
// BUILT-IN DRIVER REGISTRATIONS
// =============================================================================

// Register postgres.js driver
registerDriver({
  driver: 'postgres',
  dialect: 'postgresql',
  capabilities: POSTGRES_CAPABILITIES,
  packageName: 'postgres',
  optional: false,
  factory: async (config) => {
    const { createPostgresAdapter } = await import('./adapters/postgres');
    return createPostgresAdapter(config);
  },
});

// Register Neon HTTP driver
registerDriver({
  driver: 'neon-http',
  dialect: 'postgresql',
  capabilities: NEON_HTTP_CAPABILITIES,
  packageName: '@neondatabase/serverless',
  optional: true,
  factory: async (config) => {
    const { createNeonHttpAdapter } = await import('./adapters/neon');
    return createNeonHttpAdapter(config);
  },
});

// Register Neon WebSocket driver
registerDriver({
  driver: 'neon-ws',
  dialect: 'postgresql',
  capabilities: NEON_WS_CAPABILITIES,
  packageName: '@neondatabase/serverless',
  optional: true,
  factory: async (config) => {
    const { createNeonWsAdapter } = await import('./adapters/neon');
    return createNeonWsAdapter(config);
  },
});

// Register node-postgres driver
registerDriver({
  driver: 'pg',
  dialect: 'postgresql',
  capabilities: PG_CAPABILITIES,
  packageName: 'pg',
  optional: true,
  factory: async (config) => {
    const { createPgAdapter } = await import('./adapters/pg');
    return createPgAdapter(config);
  },
});

// Register node-postgres with pool driver
registerDriver({
  driver: 'pg-pool',
  dialect: 'postgresql',
  capabilities: PG_CAPABILITIES,
  packageName: 'pg',
  optional: true,
  factory: async (config) => {
    const { createPgPoolAdapter } = await import('./adapters/pg');
    return createPgPoolAdapter(config);
  },
});

// Register PlanetScale driver
registerDriver({
  driver: 'planetscale',
  dialect: 'mysql',
  capabilities: PLANETSCALE_CAPABILITIES,
  packageName: '@planetscale/database',
  optional: true,
  factory: async (config) => {
    const { createPlanetScaleAdapter } = await import('./adapters/planetscale');
    return createPlanetScaleAdapter(config);
  },
});

// Register MySQL2 driver
registerDriver({
  driver: 'mysql2',
  dialect: 'mysql',
  capabilities: MYSQL2_CAPABILITIES,
  packageName: 'mysql2',
  optional: true,
  factory: async (config) => {
    const { createMySQL2Adapter } = await import('./adapters/mysql2');
    return createMySQL2Adapter(config);
  },
});


// =============================================================================
// DRIVER AVAILABILITY CHECK
// =============================================================================

/**
 * Check if a driver package is available
 */
export async function isDriverAvailable(driver: DatabaseDriver): Promise<boolean> {
  const entry = getDriver(driver);
  if (!entry) return false;

  try {
    // Attempt to dynamically import the package
    await import(entry.packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available drivers (those with installed packages)
 */
export async function getAvailableDrivers(): Promise<DriverRegistryEntry[]> {
  const entries = getAllDrivers();
  const available: DriverRegistryEntry[] = [];

  for (const entry of entries) {
    if (await isDriverAvailable(entry.driver)) {
      available.push(entry);
    }
  }

  return available;
}

// =============================================================================
// DRIVER CREATION
// =============================================================================

/**
 * Create a driver adapter instance
 *
 * @param driver - The driver type to create
 * @param config - Driver-specific configuration
 * @returns Promise resolving to the driver adapter
 * @throws Error if driver is not registered or package is not available
 *
 * @example
 * ```typescript
 * const adapter = await createDriverAdapter('postgres', {
 *   url: process.env.DATABASE_URL!,
 *   pool: { max: 10 }
 * });
 *
 * const result = await adapter.execute('SELECT 1');
 * ```
 */
export async function createDriverAdapter<TClient = unknown>(
  driver: DatabaseDriver,
  config: BaseDriverConfig
): Promise<DriverAdapter<TClient>> {
  const entry = getDriver(driver);

  if (!entry) {
    const available = getAllDrivers().map((d) => d.driver).join(', ');
    throw new Error(
      `Unknown database driver: "${driver}". Available drivers: ${available}`
    );
  }

  // Check if package is available
  const available = await isDriverAvailable(driver);
  if (!available) {
    throw new Error(
      `Database driver "${driver}" requires package "${entry.packageName}" which is not installed. ` +
      `Install it with: npm install ${entry.packageName}`
    );
  }

  return entry.factory(config) as Promise<DriverAdapter<TClient>>;
}

/**
 * Get driver capabilities without creating an instance
 */
export function getDriverCapabilities(driver: DatabaseDriver): DriverCapabilities | undefined {
  return getDriver(driver)?.capabilities;
}

/**
 * Get driver dialect without creating an instance
 */
export function getDriverDialect(driver: DatabaseDriver): DatabaseDialect | undefined {
  return getDriver(driver)?.dialect;
}

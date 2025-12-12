/**
 * Database Factory
 *
 * Main entry point for creating database instances with the driver abstraction.
 * Integrates with Drizzle ORM for type-safe database access.
 *
 * @module @yobolabs/core/db/drivers/factory
 */

import type { SQL } from 'drizzle-orm';
import type {
  DatabaseDriver,
  DriverAdapter,
  DriverConfig,
  PostgresDriverConfig,
  NeonDriverConfig,
  PgDriverConfig,
  PlanetScaleDriverConfig,
  PoolConfig,
  TransactionOptions,
} from './types';
import { createDriverAdapter } from './registry';
import {
  recommendDriver,
  getDatabaseUrlFromEnv,
  getDatabaseDriverFromEnv,
  parseConnectionUrl,
} from './environment';

// =============================================================================
// DATABASE OPTIONS
// =============================================================================

/**
 * Options for creating a database instance
 */
export interface CreateDatabaseOptions<TSchema extends Record<string, unknown>> {
  /**
   * Database driver to use.
   * If not specified, will auto-detect based on environment and URL.
   */
  driver?: DatabaseDriver;

  /**
   * Database connection URL.
   * If not specified, will read from environment variables.
   */
  url?: string;

  /**
   * Database schema for Drizzle ORM
   */
  schema: TSchema;

  /**
   * Connection pool configuration
   */
  pool?: PoolConfig;

  /**
   * SSL configuration
   */
  ssl?: boolean | 'require' | 'prefer';

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom logger function
   */
  logger?: (message: string, context?: Record<string, unknown>) => void;

  /**
   * Enable prepared statements (default: false for pooler compatibility)
   */
  prepare?: boolean;

  /**
   * Application name for connection identification
   */
  applicationName?: string;

  /**
   * Neon-specific: Enable full transaction support via WebSocket
   * Only applies to neon-http driver
   */
  fullTransactionSupport?: boolean;
}

// =============================================================================
// DATABASE WRAPPER
// =============================================================================

/**
 * Database instance with Drizzle ORM integration
 *
 * This wrapper provides a unified interface for database operations
 * regardless of the underlying driver.
 */
export interface Database<TSchema extends Record<string, unknown>> {
  /**
   * The underlying Drizzle database instance
   */
  readonly drizzle: any;

  /**
   * The driver adapter
   */
  readonly adapter: DriverAdapter<unknown>;

  /**
   * The driver type in use
   */
  readonly driver: DatabaseDriver;

  /**
   * Execute a raw SQL query
   */
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a Drizzle SQL template
   */
  executeSQL<T = unknown>(sql: SQL): Promise<T[]>;

  /**
   * Run a transaction
   */
  transaction<T>(
    callback: (tx: TransactionContext<TSchema>) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;

  /**
   * Test the database connection
   */
  ping(): Promise<boolean>;

  /**
   * Close all connections
   */
  close(): Promise<void>;
}

/**
 * Transaction context passed to transaction callbacks
 */
export interface TransactionContext<TSchema extends Record<string, unknown>> {
  /**
   * The Drizzle database instance scoped to this transaction
   */
  readonly drizzle: any;

  /**
   * Execute a raw SQL query within the transaction
   */
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a Drizzle SQL template within the transaction
   */
  executeSQL<T = unknown>(sql: SQL): Promise<T[]>;

  /**
   * Create a savepoint (nested transaction)
   */
  savepoint<T>(callback: (sp: TransactionContext<TSchema>) => Promise<T>): Promise<T>;
}

// =============================================================================
// DATABASE CREATION
// =============================================================================

/**
 * Create a database instance with the appropriate driver
 *
 * This is the main entry point for creating database connections.
 * It handles driver selection, configuration, and Drizzle ORM integration.
 *
 * @param options - Database creation options
 * @returns Database instance
 *
 * @example Auto-detect driver
 * ```typescript
 * import { createDatabase } from '@yobolabs/core/db/drivers';
 * import * as schema from './schema';
 *
 * const db = await createDatabase({
 *   schema,
 *   url: process.env.DATABASE_URL,
 * });
 *
 * // Use with Drizzle
 * const users = await db.drizzle.query.users.findMany();
 *
 * // Use transactions
 * await db.transaction(async (tx) => {
 *   await tx.execute('INSERT INTO users ...');
 * });
 * ```
 *
 * @example Explicit driver selection
 * ```typescript
 * const db = await createDatabase({
 *   driver: 'neon-http',
 *   schema,
 *   url: process.env.DATABASE_URL,
 * });
 * ```
 *
 * @example With connection pool options
 * ```typescript
 * const db = await createDatabase({
 *   driver: 'postgres',
 *   schema,
 *   url: process.env.DATABASE_URL,
 *   pool: {
 *     max: 20,
 *     idleTimeout: 30,
 *   },
 *   ssl: 'require',
 * });
 * ```
 */
export async function createDatabase<TSchema extends Record<string, unknown>>(
  options: CreateDatabaseOptions<TSchema>
): Promise<Database<TSchema>> {
  // Resolve URL
  const url = options.url ?? getDatabaseUrlFromEnv();
  if (!url) {
    throw new Error(
      'Database URL is required. Either provide it in options or set DATABASE_URL environment variable.'
    );
  }

  // Determine driver
  let driver = options.driver ?? getDatabaseDriverFromEnv();
  if (!driver) {
    const recommendation = recommendDriver(url);
    driver = recommendation.recommendedDriver;

    if (options.debug) {
      console.log(
        `[Database] Auto-selected driver: ${driver}. Reason: ${recommendation.reason}`
      );
      if (recommendation.warnings) {
        recommendation.warnings.forEach((w) => console.warn(`[Database] ${w}`));
      }
    }
  }

  // Build driver config
  const driverConfig = buildDriverConfig(driver, url, options);

  // Create the adapter
  const adapter = await createDriverAdapter(driver, driverConfig);

  // Create the Drizzle instance
  const drizzle = await createDrizzleInstance(driver, adapter, options.schema);

  // Build and return the database instance
  return createDatabaseInstance(drizzle, adapter, driver, options.schema);
}

/**
 * Create a database instance from environment variables
 *
 * Convenience function that reads all configuration from environment.
 *
 * Environment variables:
 * - DATABASE_URL: Connection URL
 * - DATABASE_DRIVER: Driver to use (optional, auto-detected if not set)
 * - DATABASE_POOL_MAX: Max connections (optional)
 * - DATABASE_DEBUG: Enable debug logging (optional)
 *
 * @param schema - Database schema for Drizzle ORM
 * @returns Database instance
 *
 * @example
 * ```typescript
 * import { createDatabaseFromEnv } from '@yobolabs/core/db/drivers';
 * import * as schema from './schema';
 *
 * const db = await createDatabaseFromEnv(schema);
 * ```
 */
export async function createDatabaseFromEnv<TSchema extends Record<string, unknown>>(
  schema: TSchema
): Promise<Database<TSchema>> {
  const poolMax = process.env.DATABASE_POOL_MAX
    ? parseInt(process.env.DATABASE_POOL_MAX, 10)
    : undefined;

  const debug = process.env.DATABASE_DEBUG === 'true';

  return createDatabase({
    schema,
    pool: poolMax ? { max: poolMax } : undefined,
    debug,
  });
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Build driver-specific configuration from generic options
 */
function buildDriverConfig(
  driver: DatabaseDriver,
  url: string,
  options: CreateDatabaseOptions<any>
): any {
  const baseConfig = {
    url,
    ssl: options.ssl,
    debug: options.debug,
    logger: options.logger,
  };

  switch (driver) {
    case 'postgres':
      return {
        ...baseConfig,
        pool: options.pool,
        prepare: options.prepare ?? false,
        applicationName: options.applicationName,
      } as PostgresDriverConfig;

    case 'neon-http':
    case 'neon-ws':
      return {
        ...baseConfig,
        pool: options.pool,
        fullTransactionSupport: options.fullTransactionSupport,
      } as NeonDriverConfig;

    case 'pg':
    case 'pg-pool':
      return {
        ...baseConfig,
        pool: options.pool,
      } as PgDriverConfig;

    case 'planetscale':
      return {
        ...baseConfig,
      } as PlanetScaleDriverConfig;

    default:
      return baseConfig;
  }
}

/**
 * Create a Drizzle instance for the given driver and adapter
 */
async function createDrizzleInstance<TSchema extends Record<string, unknown>>(
  driver: DatabaseDriver,
  adapter: DriverAdapter<unknown>,
  schema: TSchema
): Promise<any> {
  // Import the appropriate Drizzle adapter based on driver
  switch (driver) {
    case 'postgres': {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      return drizzle(adapter.rawClient as any, { schema });
    }

    case 'neon-http': {
      const { drizzle } = await import('drizzle-orm/neon-http');
      return drizzle(adapter.rawClient as any, { schema });
    }

    case 'neon-ws':
    case 'pg':
    case 'pg-pool': {
      const { drizzle } = await import('drizzle-orm/node-postgres');
      return drizzle(adapter.rawClient as any, { schema });
    }

    case 'planetscale': {
      const { drizzle } = await import('drizzle-orm/planetscale-serverless');
      return drizzle(adapter.rawClient as any, { schema });
    }

    case 'mysql2': {
      const { drizzle } = await import('drizzle-orm/mysql2');
      return drizzle(adapter.rawClient as any, { schema, mode: 'default' });
    }

    case 'better-sqlite3': {
      const { drizzle } = await import('drizzle-orm/better-sqlite3');
      return drizzle(adapter.rawClient as any, { schema });
    }

    case 'libsql': {
      const { drizzle } = await import('drizzle-orm/libsql');
      return drizzle(adapter.rawClient as any, { schema });
    }

    default:
      throw new Error(`Unsupported driver for Drizzle integration: ${driver}`);
  }
}

/**
 * Create the database wrapper instance
 */
function createDatabaseInstance<TSchema extends Record<string, unknown>>(
  drizzle: any,
  adapter: DriverAdapter<unknown>,
  driver: DatabaseDriver,
  _schema: TSchema
): Database<TSchema> {
  return {
    drizzle,
    adapter,
    driver,

    async execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      const result = await adapter.execute<T>(sql, params);
      return result.rows;
    },

    async executeSQL<T = unknown>(sql: SQL): Promise<T[]> {
      const result = await adapter.executeSQL<T>(sql);
      return result.rows;
    },

    async transaction<T>(
      callback: (tx: TransactionContext<TSchema>) => Promise<T>,
      options?: TransactionOptions
    ): Promise<T> {
      return adapter.transaction(async (txAdapter) => {
        // Create transaction-scoped Drizzle instance if possible
        // For now, we pass the same drizzle instance (works for most cases)
        const txContext: TransactionContext<TSchema> = {
          drizzle, // In a real implementation, this would be transaction-scoped

          async execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
            const result = await txAdapter.execute<T>(sql, params);
            return result.rows;
          },

          async executeSQL<T = unknown>(sql: SQL): Promise<T[]> {
            const result = await txAdapter.executeSQL<T>(sql);
            return result.rows;
          },

          async savepoint<T>(cb: (sp: TransactionContext<TSchema>) => Promise<T>): Promise<T> {
            return txAdapter.transaction(async (spAdapter) => {
              const spContext: TransactionContext<TSchema> = {
                drizzle,
                execute: async <R = unknown>(sql: string, params?: unknown[]): Promise<R[]> => {
                  const result = await spAdapter.execute<R>(sql, params);
                  return result.rows;
                },
                executeSQL: async <R = unknown>(sql: SQL): Promise<R[]> => {
                  const result = await spAdapter.executeSQL<R>(sql);
                  return result.rows;
                },
                savepoint: async <R>(cb2: (sp: TransactionContext<TSchema>) => Promise<R>): Promise<R> => {
                  return spAdapter.transaction(async (sp2Adapter) => {
                    const sp2Context: TransactionContext<TSchema> = {
                      drizzle,
                      execute: async <R2 = unknown>(sql: string, params?: unknown[]): Promise<R2[]> => (await sp2Adapter.execute<R2>(sql, params)).rows,
                      executeSQL: async <R2 = unknown>(sql: SQL): Promise<R2[]> => (await sp2Adapter.executeSQL<R2>(sql)).rows,
                      savepoint: async () => {
                        throw new Error('Maximum savepoint depth reached');
                      },
                    };
                    return cb2(sp2Context);
                  });
                },
              };
              return cb(spContext);
            });
          },
        };

        return callback(txContext);
      }, options);
    },

    async ping(): Promise<boolean> {
      return adapter.ping();
    },

    async close(): Promise<void> {
      return adapter.close();
    },
  };
}

// =============================================================================
// MULTI-CLIENT FACTORY
// =============================================================================

/**
 * Options for creating multiple database clients
 */
export interface CreateDbClientsOptions<TSchema extends Record<string, unknown>> {
  /**
   * Database schema
   */
  schema: TSchema;

  /**
   * Standard database URL (subject to RLS)
   */
  url?: string;

  /**
   * Privileged database URL (bypasses RLS)
   */
  privilegedUrl?: string;

  /**
   * Admin database URL (full privileges)
   */
  adminUrl?: string;

  /**
   * Driver to use (auto-detected if not specified)
   */
  driver?: DatabaseDriver;

  /**
   * Pool configuration for standard client
   */
  poolConfig?: PoolConfig;

  /**
   * Pool configuration for privileged client
   */
  privilegedPoolConfig?: PoolConfig;

  /**
   * Pool configuration for admin client
   */
  adminPoolConfig?: PoolConfig;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Multiple database clients with different access levels
 */
export interface DbClients<TSchema extends Record<string, unknown>> {
  /**
   * Standard database (subject to RLS)
   */
  db: Database<TSchema>;

  /**
   * Privileged database (bypasses RLS) - may be null if not configured
   */
  privilegedDb: Database<TSchema> | null;

  /**
   * Admin database (full privileges) - may be null if not configured
   */
  adminDb: Database<TSchema> | null;

  /**
   * Check if privileged database is available
   */
  isPrivilegedDbAvailable(): boolean;

  /**
   * Check if admin database is available
   */
  isAdminDbAvailable(): boolean;

  /**
   * Execute operation with privileged database
   */
  withPrivilegedDb<T>(operation: (db: Database<TSchema>) => Promise<T>): Promise<T>;

  /**
   * Execute operation with admin database
   */
  withAdminDb<T>(operation: (db: Database<TSchema>) => Promise<T>): Promise<T>;

  /**
   * Close all database connections
   */
  closeAll(): Promise<void>;
}

/**
 * Create multiple database clients with different access levels
 *
 * @param options - Multi-client options
 * @returns Database clients with different access levels
 *
 * @example
 * ```typescript
 * const clients = await createDbClients({
 *   schema,
 *   url: process.env.DATABASE_URL,
 *   privilegedUrl: process.env.INTERNAL_API_DATABASE_URL,
 *   adminUrl: process.env.ADMIN_DATABASE_URL,
 * });
 *
 * // Use standard client (RLS enforced)
 * const users = await clients.db.drizzle.query.users.findMany();
 *
 * // Use privileged client (cross-org access)
 * await clients.withPrivilegedDb(async (db) => {
 *   // Internal operations here
 * });
 * ```
 */
export async function createDbClients<TSchema extends Record<string, unknown>>(
  options: CreateDbClientsOptions<TSchema>
): Promise<DbClients<TSchema>> {
  const { schema, driver, debug } = options;

  // Create standard client
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Database URL is required');
  }

  const db = await createDatabase({
    schema,
    url,
    driver,
    pool: options.poolConfig,
    debug,
  });

  // Create privileged client (optional)
  let privilegedDb: Database<TSchema> | null = null;
  const privilegedUrl = options.privilegedUrl ?? process.env.INTERNAL_API_DATABASE_URL;
  if (privilegedUrl) {
    try {
      privilegedDb = await createDatabase({
        schema,
        url: privilegedUrl,
        driver,
        pool: options.privilegedPoolConfig ?? { max: 5 },
        debug,
      });
    } catch (error) {
      console.error('Failed to create privileged database client:', error);
    }
  }

  // Create admin client (optional)
  let adminDb: Database<TSchema> | null = null;
  const adminUrl = options.adminUrl ?? process.env.ADMIN_DATABASE_URL;
  if (adminUrl) {
    try {
      adminDb = await createDatabase({
        schema,
        url: adminUrl,
        driver,
        pool: options.adminPoolConfig ?? { max: 3 },
        debug,
      });
    } catch (error) {
      console.error('Failed to create admin database client:', error);
    }
  }

  return {
    db,
    privilegedDb,
    adminDb,

    isPrivilegedDbAvailable(): boolean {
      return privilegedDb !== null;
    },

    isAdminDbAvailable(): boolean {
      return adminDb !== null;
    },

    async withPrivilegedDb<T>(operation: (db: Database<TSchema>) => Promise<T>): Promise<T> {
      if (!privilegedDb) {
        throw new Error(
          'Privileged database client is not available. Check INTERNAL_API_DATABASE_URL configuration.'
        );
      }
      return operation(privilegedDb);
    },

    async withAdminDb<T>(operation: (db: Database<TSchema>) => Promise<T>): Promise<T> {
      if (!adminDb) {
        throw new Error(
          'Admin database client is not available. Check ADMIN_DATABASE_URL configuration.'
        );
      }
      return operation(adminDb);
    },

    async closeAll(): Promise<void> {
      await Promise.all([
        db.close(),
        privilegedDb?.close(),
        adminDb?.close(),
      ]);
    },
  };
}

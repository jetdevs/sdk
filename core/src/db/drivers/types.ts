/**
 * Database Driver Abstraction Types
 *
 * This module defines the core types and interfaces for the driver-agnostic
 * database abstraction layer. It supports multiple database drivers while
 * maintaining type safety with Drizzle ORM.
 *
 * @module @jetdevs/core/db/drivers
 */

import type { SQL } from 'drizzle-orm';

// =============================================================================
// DRIVER IDENTIFIERS
// =============================================================================

/**
 * Supported database driver types.
 *
 * - `postgres`: postgres.js driver - Best for traditional servers, local dev
 * - `neon-http`: @neondatabase/serverless - Best for Vercel + Neon serverless
 * - `neon-ws`: @neondatabase/serverless with WebSocket - For transactions in serverless
 * - `pg`: node-postgres (pg) - Best for AWS RDS, traditional PostgreSQL with pooling
 * - `planetscale`: @planetscale/database - For PlanetScale MySQL (serverless)
 * - `mysql2`: mysql2 driver - For traditional MySQL servers
 */
export type DatabaseDriver =
  | 'postgres'      // postgres.js
  | 'neon-http'     // @neondatabase/serverless (HTTP)
  | 'neon-ws'       // @neondatabase/serverless (WebSocket)
  | 'pg'            // node-postgres
  | 'pg-pool'       // node-postgres with pg-pool
  | 'planetscale'   // PlanetScale MySQL
  | 'mysql2'        // MySQL2
  | 'custom';       // Custom driver implementation

/**
 * Database dialect - the underlying SQL dialect
 */
export type DatabaseDialect = 'postgresql' | 'mysql';

// =============================================================================
// CONNECTION CONFIGURATION
// =============================================================================

/**
 * Base configuration shared by all drivers
 */
export interface BaseDriverConfig {
  /**
   * Database connection URL
   * Format depends on driver:
   * - PostgreSQL: postgresql://user:pass@host:port/db
   * - MySQL: mysql://user:pass@host:port/db
   */
  url: string;

  /**
   * SSL/TLS configuration
   * - `true`: Enable SSL with default settings
   * - `false`: Disable SSL
   * - `'require'`: Require SSL (PostgreSQL)
   * - `'prefer'`: Prefer SSL but allow non-SSL (PostgreSQL)
   * - Object: Custom SSL configuration
   */
  ssl?: boolean | 'require' | 'prefer' | SSLConfig;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Custom logger function
   */
  logger?: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * SSL configuration options
 */
export interface SSLConfig {
  /**
   * Reject unauthorized certificates
   * @default true in production
   */
  rejectUnauthorized?: boolean;

  /**
   * CA certificate(s)
   */
  ca?: string | Buffer | Array<string | Buffer>;

  /**
   * Client certificate
   */
  cert?: string | Buffer;

  /**
   * Client private key
   */
  key?: string | Buffer;
}

/**
 * Connection pool configuration for pooled drivers
 */
export interface PoolConfig {
  /**
   * Maximum number of connections in the pool
   * @default 10
   */
  max?: number;

  /**
   * Minimum number of connections to maintain
   * @default 0
   */
  min?: number;

  /**
   * Close idle connections after this many seconds
   * @default 20
   */
  idleTimeout?: number;

  /**
   * Maximum lifetime of a connection in seconds
   * @default 1800 (30 minutes)
   */
  maxLifetime?: number;

  /**
   * Connection timeout in seconds
   * @default 30
   */
  connectTimeout?: number;

  /**
   * Acquire timeout in milliseconds
   * @default 30000
   */
  acquireTimeout?: number;
}

/**
 * PostgreSQL-specific driver configuration
 */
export interface PostgresDriverConfig extends BaseDriverConfig {
  /**
   * Connection pool settings
   */
  pool?: PoolConfig;

  /**
   * Enable prepared statements
   * @default false for better compatibility with connection poolers
   */
  prepare?: boolean;

  /**
   * Transform options for data conversion
   */
  transform?: {
    /**
     * Transform undefined values to null
     * @default true
     */
    undefined?: null;
  };

  /**
   * Statement timeout in milliseconds
   * @default undefined (no timeout)
   */
  statementTimeout?: number;

  /**
   * Query timeout in milliseconds
   * @default undefined (no timeout)
   */
  queryTimeout?: number;

  /**
   * Application name for PostgreSQL connections
   * Useful for identifying connections in pg_stat_activity
   */
  applicationName?: string;
}

/**
 * Neon serverless-specific configuration
 */
export interface NeonDriverConfig extends BaseDriverConfig {
  /**
   * Connection pool settings (for WebSocket mode)
   */
  pool?: PoolConfig;

  /**
   * Fetch function override for custom HTTP handling
   * Useful for edge runtimes
   */
  fetchFunction?: typeof fetch;

  /**
   * WebSocket constructor override
   * Required for some edge runtimes
   */
  webSocketConstructor?: typeof WebSocket;

  /**
   * Enable connection caching
   * @default true
   */
  connectionCache?: boolean;

  /**
   * Full transaction support via WebSocket pooling
   * Required for multi-statement transactions
   * @default false (uses HTTP for simple queries)
   */
  fullTransactionSupport?: boolean;
}

/**
 * node-postgres (pg) specific configuration
 */
export interface PgDriverConfig extends BaseDriverConfig {
  /**
   * Connection pool settings
   */
  pool?: PoolConfig;

  /**
   * Statement timeout in milliseconds
   */
  statementTimeout?: number;

  /**
   * Query timeout in milliseconds
   */
  queryTimeout?: number;

  /**
   * Enable connection keepalive
   * @default false
   */
  keepAlive?: boolean;

  /**
   * Keepalive initial delay in milliseconds
   * @default 0
   */
  keepAliveInitialDelayMillis?: number;
}

/**
 * PlanetScale-specific configuration
 */
export interface PlanetScaleDriverConfig extends BaseDriverConfig {
  /**
   * Fetch function override for custom HTTP handling
   */
  fetchFunction?: typeof fetch;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;
}

/**
 * MySQL2-specific configuration
 */
export interface MySQL2DriverConfig extends BaseDriverConfig {
  /**
   * Connection pool settings
   */
  pool?: PoolConfig;

  /**
   * Enable multiple statements per query
   * @default false (security consideration)
   */
  multipleStatements?: boolean;

  /**
   * Charset for the connection
   * @default 'utf8mb4'
   */
  charset?: string;
}


/**
 * Union type of all driver-specific configurations
 */
export type DriverConfig =
  | ({ driver: 'postgres' } & PostgresDriverConfig)
  | ({ driver: 'neon-http' } & NeonDriverConfig)
  | ({ driver: 'neon-ws' } & NeonDriverConfig)
  | ({ driver: 'pg' } & PgDriverConfig)
  | ({ driver: 'pg-pool' } & PgDriverConfig)
  | ({ driver: 'planetscale' } & PlanetScaleDriverConfig)
  | ({ driver: 'mysql2' } & MySQL2DriverConfig);

// =============================================================================
// DRIVER CAPABILITIES
// =============================================================================

/**
 * Capabilities that a driver may or may not support
 */
export interface DriverCapabilities {
  /**
   * Whether the driver supports transactions
   */
  transactions: boolean;

  /**
   * Whether the driver supports nested/savepoint transactions
   */
  nestedTransactions: boolean;

  /**
   * Whether the driver supports prepared statements
   */
  preparedStatements: boolean;

  /**
   * Whether the driver supports connection pooling
   */
  connectionPooling: boolean;

  /**
   * Whether the driver is suitable for serverless environments
   */
  serverless: boolean;

  /**
   * Whether the driver supports streaming results
   */
  streaming: boolean;

  /**
   * Whether the driver supports batch queries
   */
  batchQueries: boolean;

  /**
   * Whether the driver supports returning clause (INSERT ... RETURNING)
   */
  returning: boolean;

  /**
   * Maximum query parameters supported
   * @default undefined (no limit)
   */
  maxParameters?: number;
}

// =============================================================================
// DRIVER ADAPTER INTERFACE
// =============================================================================

/**
 * Raw query result from the underlying driver
 */
export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  fields?: Array<{
    name: string;
    type: number | string;
  }>;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  /**
   * Isolation level for the transaction
   */
  isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';

  /**
   * Access mode for the transaction
   */
  accessMode?: 'read only' | 'read write';

  /**
   * Whether to defer constraint checks
   */
  deferrable?: boolean;
}

/**
 * The core driver adapter interface that all driver implementations must fulfill.
 * This is the abstraction layer between the application and the underlying database driver.
 */
export interface DriverAdapter<TClient = unknown> {
  /**
   * The driver type identifier
   */
  readonly driver: DatabaseDriver;

  /**
   * The SQL dialect this driver uses
   */
  readonly dialect: DatabaseDialect;

  /**
   * The capabilities of this driver
   */
  readonly capabilities: DriverCapabilities;

  /**
   * The underlying raw client instance
   * Use with caution - for advanced use cases only
   */
  readonly rawClient: TClient;

  /**
   * Execute a raw SQL query
   */
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;

  /**
   * Execute a Drizzle SQL template
   */
  executeSQL<T = unknown>(sql: SQL): Promise<QueryResult<T>>;

  /**
   * Begin a transaction
   * Returns a new adapter instance scoped to the transaction
   */
  transaction<T>(
    callback: (tx: DriverAdapter<TClient>) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;

  /**
   * Test the connection
   */
  ping(): Promise<boolean>;

  /**
   * Close the connection/pool
   */
  close(): Promise<void>;

  /**
   * Get connection statistics (if available)
   */
  getStats?(): ConnectionStats;
}

/**
 * Connection pool statistics
 */
export interface ConnectionStats {
  /**
   * Total number of connections in the pool
   */
  total: number;

  /**
   * Number of idle connections
   */
  idle: number;

  /**
   * Number of active/in-use connections
   */
  active: number;

  /**
   * Number of waiting requests
   */
  waiting: number;
}

// =============================================================================
// DRIZZLE INTEGRATION TYPES
// =============================================================================

/**
 * Generic Drizzle database instance type
 * This is the type returned by drizzle() for any driver
 */
export type DrizzleDatabase<TSchema extends Record<string, unknown> = Record<string, unknown>> = {
  query: {
    [K in keyof TSchema]: unknown;
  };
  select: (...args: unknown[]) => unknown;
  insert: (table: unknown) => unknown;
  update: (table: unknown) => unknown;
  delete: (table: unknown) => unknown;
  execute: (query: SQL) => Promise<unknown>;
  transaction: <T>(
    callback: (tx: unknown) => Promise<T>,
    options?: TransactionOptions
  ) => Promise<T>;
  $with: (alias: string) => unknown;
};

/**
 * Configuration for creating a Drizzle database instance
 */
export interface DrizzleConfig<TSchema extends Record<string, unknown>> {
  /**
   * Database schema containing all tables
   */
  schema: TSchema;

  /**
   * Enable Drizzle logger
   * @default false
   */
  logger?: boolean;
}

// =============================================================================
// FACTORY TYPES
// =============================================================================

/**
 * Factory function type for creating driver adapters
 */
export type DriverFactory<TConfig extends BaseDriverConfig, TClient = unknown> = (
  config: TConfig
) => Promise<DriverAdapter<TClient>>;

/**
 * Registry entry for a driver
 */
export interface DriverRegistryEntry<TConfig extends BaseDriverConfig = BaseDriverConfig> {
  /**
   * Driver identifier
   */
  driver: DatabaseDriver;

  /**
   * SQL dialect
   */
  dialect: DatabaseDialect;

  /**
   * Driver capabilities
   */
  capabilities: DriverCapabilities;

  /**
   * Factory function to create the driver adapter
   */
  factory: DriverFactory<TConfig>;

  /**
   * Package name for dynamic import
   */
  packageName: string;

  /**
   * Whether the driver package is optional
   */
  optional: boolean;
}

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Runtime environment information
 */
export interface RuntimeEnvironment {
  /**
   * Whether running in a serverless environment
   */
  isServerless: boolean;

  /**
   * Whether running on Vercel
   */
  isVercel: boolean;

  /**
   * Whether running on AWS Lambda
   */
  isAWSLambda: boolean;

  /**
   * Whether running in an edge runtime
   */
  isEdge: boolean;

  /**
   * Whether running in Node.js
   */
  isNode: boolean;

  /**
   * Whether running in development mode
   */
  isDevelopment: boolean;

  /**
   * Whether running in production mode
   */
  isProduction: boolean;
}

/**
 * Auto-detection result for driver selection
 */
export interface DriverDetectionResult {
  /**
   * Recommended driver based on environment
   */
  recommendedDriver: DatabaseDriver;

  /**
   * Reason for the recommendation
   */
  reason: string;

  /**
   * Alternative drivers that would also work
   */
  alternatives: DatabaseDriver[];

  /**
   * Warnings or considerations
   */
  warnings?: string[];
}

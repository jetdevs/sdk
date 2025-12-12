/**
 * Database Driver Abstraction Layer
 *
 * This module provides a driver-agnostic database abstraction that allows
 * easy switching between different database providers and drivers.
 *
 * Supported Drivers:
 * - `postgres`: postgres.js - Traditional servers, local dev
 * - `neon-http`: Neon serverless HTTP - Vercel + Neon (no transactions)
 * - `neon-ws`: Neon serverless WebSocket - Vercel + Neon (with transactions)
 * - `pg`: node-postgres - AWS RDS, traditional PostgreSQL
 * - `pg-pool`: node-postgres with pooling - Production PostgreSQL
 * - `planetscale`: PlanetScale MySQL - Serverless MySQL
 * - `mysql2`: MySQL2 - Traditional MySQL (not yet implemented)
 * - `better-sqlite3`: SQLite - Local dev/testing (not yet implemented)
 * - `libsql`: LibSQL/Turso - Edge SQLite (not yet implemented)
 *
 * @module @yobolabs/core/db/drivers
 *
 * @example Basic Usage
 * ```typescript
 * import { createDatabase } from '@yobolabs/core/db/drivers';
 * import * as schema from './schema';
 *
 * // Auto-detect driver based on environment
 * const db = await createDatabase({
 *   schema,
 *   url: process.env.DATABASE_URL!,
 * });
 *
 * // Or specify driver explicitly
 * const db = await createDatabase({
 *   driver: 'neon-http',
 *   schema,
 *   url: process.env.DATABASE_URL!,
 * });
 * ```
 *
 * @example With Driver-Specific Options
 * ```typescript
 * const db = await createDatabase({
 *   driver: 'postgres',
 *   schema,
 *   url: process.env.DATABASE_URL!,
 *   pool: {
 *     max: 20,
 *     idleTimeout: 30,
 *   },
 *   ssl: 'require',
 * });
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Driver identifiers
  DatabaseDriver,
  DatabaseDialect,

  // Base configuration
  BaseDriverConfig,
  SSLConfig,
  PoolConfig,

  // Driver-specific configurations
  PostgresDriverConfig,
  NeonDriverConfig,
  PgDriverConfig,
  PlanetScaleDriverConfig,
  MySQL2DriverConfig,
  SQLiteDriverConfig,
  LibSQLDriverConfig,
  DriverConfig,

  // Capabilities
  DriverCapabilities,

  // Adapter interface
  DriverAdapter,
  QueryResult,
  TransactionOptions,
  ConnectionStats,

  // Drizzle integration
  DrizzleDatabase,
  DrizzleConfig,

  // Factory types
  DriverFactory,
  DriverRegistryEntry,

  // Environment detection
  RuntimeEnvironment,
  DriverDetectionResult,
} from './types';

// =============================================================================
// REGISTRY EXPORTS
// =============================================================================

export {
  // Registry management
  registerDriver,
  getDriver,
  getAllDrivers,
  hasDriver,
  getDriversByDialect,
  getServerlessDrivers,

  // Driver availability
  isDriverAvailable,
  getAvailableDrivers,

  // Driver creation
  createDriverAdapter,
  getDriverCapabilities,
  getDriverDialect,
} from './registry';

// =============================================================================
// ADAPTER FACTORY EXPORTS
// =============================================================================

export { createPostgresAdapter } from './adapters/postgres';
export { createNeonHttpAdapter, createNeonWsAdapter, createNeonAdapter } from './adapters/neon';
export { createPgAdapter, createPgPoolAdapter } from './adapters/pg';
export { createPlanetScaleAdapter } from './adapters/planetscale';

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

export { detectEnvironment, recommendDriver, parseConnectionUrl } from './environment';

// =============================================================================
// DATABASE FACTORY
// =============================================================================

export { createDatabase, createDatabaseFromEnv, type CreateDatabaseOptions } from './factory';

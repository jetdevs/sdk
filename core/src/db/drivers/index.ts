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
 *
 * @module @jetdevs/core/db/drivers
 *
 * @example Basic Usage
 * ```typescript
 * import { createDatabase } from '@jetdevs/core/db/drivers';
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

    // Base configuration
    BaseDriverConfig, ConnectionStats, DatabaseDialect,
    // Driver identifiers
    DatabaseDriver,
    // Adapter interface
    DriverAdapter,
    // Capabilities
    DriverCapabilities, DriverConfig, DriverDetectionResult,
    // Factory types
    DriverFactory,
    DriverRegistryEntry, DrizzleConfig,
    // Drizzle integration
    DrizzleDatabase, MySQL2DriverConfig, NeonDriverConfig,
    PgDriverConfig,
    PlanetScaleDriverConfig, PoolConfig,

    // Driver-specific configurations
    PostgresDriverConfig, QueryResult,
    // Environment detection
    RuntimeEnvironment, SSLConfig, TransactionOptions
} from './types';

// =============================================================================
// REGISTRY EXPORTS
// =============================================================================

export {

    // Driver creation
    createDriverAdapter, getAllDrivers, getAvailableDrivers, getDriver, getDriverCapabilities,
    getDriverDialect, getDriversByDialect,
    getServerlessDrivers, hasDriver,
    // Driver availability
    isDriverAvailable,
    // Registry management
    registerDriver
} from './registry';

// =============================================================================
// ADAPTER FACTORY EXPORTS
// =============================================================================

export { createNeonAdapter, createNeonHttpAdapter, createNeonWsAdapter } from './adapters/neon';
export { createPgAdapter, createPgPoolAdapter } from './adapters/pg';
export { createPlanetScaleAdapter } from './adapters/planetscale';
export { createPostgresAdapter } from './adapters/postgres';

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

export { detectEnvironment, parseConnectionUrl, recommendDriver } from './environment';

// =============================================================================
// DATABASE FACTORY
// =============================================================================

export { createDatabase, createDatabaseFromEnv, type CreateDatabaseOptions } from './factory';

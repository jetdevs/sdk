/**
 * Database Client Factory
 *
 * Factory for creating database clients with multiple access levels:
 * - Standard client: Subject to RLS policies
 * - Privileged client: Bypasses RLS for internal operations
 * - Admin client: Full database privileges for administration
 *
 * @example
 * ```ts
 * import { createDbClients } from '@yobolabs/core/db/client-factory';
 * import * as schema from '@/db/schema';
 *
 * const clients = createDbClients({
 *   schema,
 *   connectionString: process.env.DATABASE_URL,
 *   privilegedConnectionString: process.env.INTERNAL_API_DATABASE_URL,
 *   adminConnectionString: process.env.ADMIN_DATABASE_URL,
 * });
 *
 * // Standard queries (RLS enforced)
 * const users = await clients.db.query.users.findMany();
 *
 * // Privileged operations
 * await clients.withPrivilegedDb(async (db) => {
 *   // Cross-org operations here
 * });
 * ```
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Pool configuration options
 */
export interface PoolConfig {
  /**
   * Maximum number of connections in the pool
   * @default 10 for standard, 5 for privileged, 3 for admin
   */
  max?: number;

  /**
   * Idle timeout in seconds - close idle connections after this time
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
   * SSL mode ('require' | 'prefer' | false)
   * @default 'require' in production, false otherwise
   */
  ssl?: boolean | 'require' | 'prefer';

  /**
   * Enable prepared statements
   * @default false for better compatibility
   */
  prepare?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Configuration for creating database clients
 */
export interface DbClientFactoryConfig<TSchema extends Record<string, unknown>> {
  /**
   * Database schema containing all tables
   */
  schema: TSchema;

  /**
   * Standard database connection string (DATABASE_URL)
   * Subject to RLS policies
   */
  connectionString?: string;

  /**
   * Privileged database connection string (INTERNAL_API_DATABASE_URL)
   * Bypasses RLS for internal operations
   */
  privilegedConnectionString?: string;

  /**
   * Admin database connection string (ADMIN_DATABASE_URL)
   * Full database privileges for administration
   */
  adminConnectionString?: string;

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
}

/**
 * Collection of database clients with different access levels
 */
export interface DbClients<TSchema extends Record<string, unknown>> {
  /**
   * Standard database client for user-facing operations.
   * Subject to Row Level Security (RLS) policies.
   */
  db: PostgresJsDatabase<TSchema>;

  /**
   * Privileged database client for internal system operations.
   * Bypasses RLS policies - only use for trusted internal operations.
   * May be null if INTERNAL_API_DATABASE_URL is not configured.
   */
  privilegedDb: PostgresJsDatabase<TSchema> | null;

  /**
   * Admin database client for database administration.
   * Has full database privileges - only use for admin operations.
   * May be null if ADMIN_DATABASE_URL is not configured.
   */
  adminDb: PostgresJsDatabase<TSchema> | null;

  /**
   * Check if privileged database client is available
   */
  isPrivilegedDbAvailable: () => boolean;

  /**
   * Check if admin database client is available
   */
  isAdminDbAvailable: () => boolean;

  /**
   * Execute operation with privileged database access.
   * Throws if privileged client is not available.
   */
  withPrivilegedDb: <T>(
    operation: (db: PostgresJsDatabase<TSchema>) => Promise<T>
  ) => Promise<T>;

  /**
   * Execute operation with admin database access.
   * Throws if admin client is not available.
   */
  withAdminDb: <T>(
    operation: (db: PostgresJsDatabase<TSchema>) => Promise<T>
  ) => Promise<T>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Default pool configurations for different client types
 */
const DEFAULT_POOL_CONFIGS = {
  standard: {
    max: 10,
    idleTimeout: 20,
    maxLifetime: 30 * 60, // 30 minutes
    connectTimeout: 30,
    prepare: false,
    debug: false,
  },
  privileged: {
    max: 5,
    idleTimeout: 20,
    maxLifetime: 30 * 60,
    connectTimeout: 30,
    prepare: false,
    debug: false,
  },
  admin: {
    max: 3,
    idleTimeout: 30,
    maxLifetime: 60 * 60, // 1 hour
    connectTimeout: 30,
    prepare: false,
    debug: false,
  },
};

/**
 * Creates a postgres connection with the given configuration
 */
function createPostgresConnection(
  connectionString: string,
  poolConfig: PoolConfig,
  defaults: typeof DEFAULT_POOL_CONFIGS.standard
): ReturnType<typeof postgres> {
  const isProduction = process.env.NODE_ENV === 'production';

  return postgres(connectionString, {
    max: poolConfig.max ?? defaults.max,
    idle_timeout: poolConfig.idleTimeout ?? defaults.idleTimeout,
    max_lifetime: poolConfig.maxLifetime ?? defaults.maxLifetime,
    connect_timeout: poolConfig.connectTimeout ?? defaults.connectTimeout,
    prepare: poolConfig.prepare ?? defaults.prepare,
    ssl: poolConfig.ssl ?? (isProduction ? 'require' : false),
    transform: {
      undefined: null, // Transform undefined to null for PostgreSQL
    },
    debug: poolConfig.debug ?? defaults.debug,
  });
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a set of database clients with different access levels.
 *
 * @param config - Configuration for database clients
 * @returns Object containing all database clients and helper functions
 *
 * @example
 * ```ts
 * const clients = createDbClients({
 *   schema,
 *   connectionString: process.env.DATABASE_URL,
 *   privilegedConnectionString: process.env.INTERNAL_API_DATABASE_URL,
 *   adminConnectionString: process.env.ADMIN_DATABASE_URL,
 * });
 *
 * // Standard operations (RLS enforced)
 * const users = await clients.db.query.users.findMany();
 *
 * // Privileged operations (cross-org access)
 * const allUsers = await clients.withPrivilegedDb(async (db) => {
 *   return db.query.users.findMany();
 * });
 *
 * // Admin operations (database administration)
 * await clients.withAdminDb(async (db) => {
 *   // RLS policy updates, etc.
 * });
 * ```
 */
export function createDbClients<TSchema extends Record<string, unknown>>(
  config: DbClientFactoryConfig<TSchema>
): DbClients<TSchema> {
  const {
    schema,
    connectionString,
    privilegedConnectionString,
    adminConnectionString,
    poolConfig = {},
    privilegedPoolConfig = {},
    adminPoolConfig = {},
  } = config;

  // Validate required connection string
  if (!connectionString) {
    throw new Error(
      'Database connection string is required. Set connectionString or DATABASE_URL environment variable.'
    );
  }

  // ==========================================================================
  // Create Standard Client
  // ==========================================================================
  const standardClient = createPostgresConnection(
    connectionString,
    poolConfig,
    DEFAULT_POOL_CONFIGS.standard
  );
  const db = drizzle(standardClient, { schema }) as PostgresJsDatabase<TSchema>;

  // ==========================================================================
  // Create Privileged Client (optional)
  // ==========================================================================
  let privilegedDb: PostgresJsDatabase<TSchema> | null = null;

  if (privilegedConnectionString) {
    try {
      const privilegedClient = createPostgresConnection(
        privilegedConnectionString,
        privilegedPoolConfig,
        DEFAULT_POOL_CONFIGS.privileged
      );
      privilegedDb = drizzle(privilegedClient, { schema }) as PostgresJsDatabase<TSchema>;
    } catch (error) {
      console.error('Failed to initialize privileged database client:', error);
    }
  } else {
    console.warn(
      'Privileged database connection string not set - privileged operations will be disabled'
    );
  }

  // ==========================================================================
  // Create Admin Client (optional)
  // ==========================================================================
  let adminDb: PostgresJsDatabase<TSchema> | null = null;

  if (adminConnectionString) {
    try {
      const adminClient = createPostgresConnection(
        adminConnectionString,
        adminPoolConfig,
        DEFAULT_POOL_CONFIGS.admin
      );
      adminDb = drizzle(adminClient, { schema }) as PostgresJsDatabase<TSchema>;
    } catch (error) {
      console.error('Failed to initialize admin database client:', error);
    }
  } else {
    console.warn(
      'Admin database connection string not set - admin operations will be disabled'
    );
  }

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  const isPrivilegedDbAvailable = (): boolean => privilegedDb !== null;
  const isAdminDbAvailable = (): boolean => adminDb !== null;

  async function withPrivilegedDb<T>(
    operation: (db: PostgresJsDatabase<TSchema>) => Promise<T>
  ): Promise<T> {
    if (!isPrivilegedDbAvailable()) {
      throw new Error(
        'Privileged database client is not available. ' +
        'Check INTERNAL_API_DATABASE_URL configuration.'
      );
    }
    return operation(privilegedDb!);
  }

  async function withAdminDb<T>(
    operation: (db: PostgresJsDatabase<TSchema>) => Promise<T>
  ): Promise<T> {
    if (!isAdminDbAvailable()) {
      throw new Error(
        'Admin database client is not available. ' +
        'Check ADMIN_DATABASE_URL configuration.'
      );
    }
    return operation(adminDb!);
  }

  return {
    db,
    privilegedDb,
    adminDb,
    isPrivilegedDbAvailable,
    isAdminDbAvailable,
    withPrivilegedDb,
    withAdminDb,
  };
}

/**
 * Creates database clients from environment variables.
 *
 * Uses standard environment variable names:
 * - DATABASE_URL: Standard client
 * - INTERNAL_API_DATABASE_URL: Privileged client
 * - ADMIN_DATABASE_URL: Admin client
 *
 * @param schema - Database schema
 * @param poolConfigs - Optional pool configurations
 */
export function createDbClientsFromEnv<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  poolConfigs?: {
    standard?: PoolConfig;
    privileged?: PoolConfig;
    admin?: PoolConfig;
  }
): DbClients<TSchema> {
  return createDbClients({
    schema,
    connectionString: process.env.DATABASE_URL,
    privilegedConnectionString: process.env.INTERNAL_API_DATABASE_URL,
    adminConnectionString: process.env.ADMIN_DATABASE_URL,
    poolConfig: poolConfigs?.standard,
    privilegedPoolConfig: poolConfigs?.privileged,
    adminPoolConfig: poolConfigs?.admin,
  });
}

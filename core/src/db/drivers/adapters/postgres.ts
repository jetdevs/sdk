/**
 * postgres.js Driver Adapter
 *
 * Adapter for the postgres.js (porsager/postgres) driver.
 * This is the recommended driver for:
 * - Traditional Node.js servers
 * - Local development
 * - Long-running processes
 *
 * @module @yobolabs/core/db/drivers/adapters/postgres
 */

import type { SQL } from 'drizzle-orm';
import type {
  DriverAdapter,
  DatabaseDriver,
  DatabaseDialect,
  DriverCapabilities,
  PostgresDriverConfig,
  QueryResult,
  TransactionOptions,
  ConnectionStats,
} from '../types';

// Type for postgres.js client - using any to avoid import type complexities
type PostgresClient = any;

/**
 * Capabilities for postgres.js driver
 */
const POSTGRES_CAPABILITIES: DriverCapabilities = {
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
 * postgres.js driver adapter implementation
 */
class PostgresAdapter implements DriverAdapter<PostgresClient> {
  readonly driver: DatabaseDriver = 'postgres';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = POSTGRES_CAPABILITIES;
  readonly rawClient: PostgresClient;

  private readonly config: PostgresDriverConfig;
  private closed = false;

  constructor(client: PostgresClient, config: PostgresDriverConfig) {
    this.rawClient = client;
    this.config = config;
  }

  /**
   * Execute a raw SQL query
   */
  async execute<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    this.ensureNotClosed();

    try {
      // postgres.js uses tagged template literals, but we can use unsafe for raw SQL
      const result = params && params.length > 0
        ? await this.rawClient.unsafe(sql, params as any[])
        : await this.rawClient.unsafe(sql);

      return {
        rows: result as T[],
        rowCount: result.count ?? result.length,
      };
    } catch (error) {
      this.logError('execute', error);
      throw error;
    }
  }

  /**
   * Execute a Drizzle SQL template
   */
  async executeSQL<T = unknown>(sql: SQL): Promise<QueryResult<T>> {
    this.ensureNotClosed();

    // Convert Drizzle SQL to query string and params
    const { queryString, params } = this.sqlToQuery(sql);
    return this.execute<T>(queryString, params);
  }

  /**
   * Begin a transaction
   */
  async transaction<T>(
    callback: (tx: DriverAdapter<PostgresClient>) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    this.ensureNotClosed();

    return this.rawClient.begin(
      this.getTransactionMode(options),
      async (txClient: any) => {
        // Create a transaction-scoped adapter
        const txAdapter = new PostgresTransactionAdapter(
          txClient,
          this.config
        );
        return callback(txAdapter);
      }
    );
  }

  /**
   * Test the connection
   */
  async ping(): Promise<boolean> {
    try {
      await this.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    if (this.closed) return;

    try {
      await this.rawClient.end();
      this.closed = true;
      this.log('Connection pool closed');
    } catch (error) {
      this.logError('close', error);
      throw error;
    }
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionStats {
    // postgres.js doesn't expose pool stats directly
    // We return what we can infer
    return {
      total: this.config.pool?.max ?? 10,
      idle: 0, // Not available
      active: 0, // Not available
      waiting: 0, // Not available
    };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private ensureNotClosed(): void {
    if (this.closed) {
      throw new Error('Database connection has been closed');
    }
  }

  private getTransactionMode(options?: TransactionOptions): string {
    const parts: string[] = [];

    if (options?.isolationLevel) {
      parts.push(`isolation level ${options.isolationLevel}`);
    }

    if (options?.accessMode) {
      parts.push(options.accessMode);
    }

    if (options?.deferrable) {
      parts.push('deferrable');
    }

    return parts.join(' ') || 'read write';
  }

  private sqlToQuery(sql: SQL): { queryString: string; params: unknown[] } {
    // Drizzle SQL objects have getSQL() method
    const built = sql.toQuery({
      casing: undefined as any,
      escapeName: (name: string) => `"${name}"`,
      escapeParam: (num: number, _value: unknown) => `$${num + 1}`,
      escapeString: (str: string) => `'${str.replace(/'/g, "''")}'`,
    });
    return {
      queryString: built.sql,
      params: built.params,
    };
  }

  private log(message: string): void {
    if (this.config.debug && this.config.logger) {
      this.config.logger(message);
    } else if (this.config.debug) {
      console.log(`[postgres] ${message}`);
    }
  }

  private logError(operation: string, error: unknown): void {
    if (this.config.logger) {
      this.config.logger(`Error in ${operation}`, { error });
    } else if (this.config.debug) {
      console.error(`[postgres] Error in ${operation}:`, error);
    }
  }
}

/**
 * Transaction-scoped adapter for postgres.js
 * Uses the transaction client but doesn't support nested begin/commit
 */
class PostgresTransactionAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'postgres';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = {
    ...POSTGRES_CAPABILITIES,
    // In a transaction context, we can use savepoints for nested transactions
  };
  readonly rawClient: any;

  private readonly config: PostgresDriverConfig;
  private savepointCounter = 0;

  constructor(txClient: any, config: PostgresDriverConfig) {
    this.rawClient = txClient;
    this.config = config;
  }

  async execute<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = params && params.length > 0
      ? await this.rawClient.unsafe(sql, params as any[])
      : await this.rawClient.unsafe(sql);

    return {
      rows: result as T[],
      rowCount: result.count ?? result.length,
    };
  }

  async executeSQL<T = unknown>(sql: SQL): Promise<QueryResult<T>> {
    const { queryString, params } = this.sqlToQuery(sql);
    return this.execute<T>(queryString, params);
  }

  /**
   * Nested transactions use savepoints
   */
  async transaction<T>(
    callback: (tx: DriverAdapter<any>) => Promise<T>,
    _options?: TransactionOptions
  ): Promise<T> {
    const savepointName = `sp_${++this.savepointCounter}`;

    try {
      await this.execute(`SAVEPOINT ${savepointName}`);
      const result = await callback(this);
      await this.execute(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      await this.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Transaction clients shouldn't be closed directly
    // The transaction will be committed/rolled back by the parent
  }

  private sqlToQuery(sql: SQL): { queryString: string; params: unknown[] } {
    const built = sql.toQuery({
      casing: undefined as any,
      escapeName: (name: string) => `"${name}"`,
      escapeParam: (num: number, _value: unknown) => `$${num + 1}`,
      escapeString: (str: string) => `'${str.replace(/'/g, "''")}'`,
    });
    return {
      queryString: built.sql,
      params: built.params,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a postgres.js driver adapter
 *
 * @param config - PostgreSQL driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createPostgresAdapter({
 *   url: process.env.DATABASE_URL!,
 *   pool: {
 *     max: 10,
 *     idleTimeout: 20,
 *   },
 *   ssl: 'require',
 * });
 * ```
 */
export async function createPostgresAdapter(
  config: PostgresDriverConfig
): Promise<DriverAdapter<PostgresClient>> {
  // Dynamically import postgres
  const postgres = (await import('postgres')).default;

  const isProduction = process.env.NODE_ENV === 'production';

  // Build connection options
  const connectionOptions: Record<string, unknown> = {
    // Connection pool settings
    max: config.pool?.max ?? 10,
    idle_timeout: config.pool?.idleTimeout ?? 20,
    max_lifetime: config.pool?.maxLifetime ?? 30 * 60,
    connect_timeout: config.pool?.connectTimeout ?? 30,

    // Prepared statements (disabled by default for pooler compatibility)
    prepare: config.prepare ?? false,

    // SSL configuration
    ssl: resolveSSL(config.ssl, isProduction),

    // Transform undefined to null
    transform: config.transform ?? {
      undefined: null,
    },

    // Debug mode
    debug: config.debug ?? false,
  };

  // Add statement timeout if specified
  if (config.statementTimeout) {
    connectionOptions.statement_timeout = config.statementTimeout;
  }

  // Add query timeout if specified
  if (config.queryTimeout) {
    connectionOptions.query_timeout = config.queryTimeout;
  }

  // Add application name if specified
  if (config.applicationName) {
    connectionOptions.application_name = config.applicationName;
  }

  // Create the postgres client
  const client = postgres(config.url, connectionOptions);

  // Return the adapter
  return new PostgresAdapter(client, config);
}

/**
 * Resolve SSL configuration
 */
function resolveSSL(
  ssl: PostgresDriverConfig['ssl'],
  isProduction: boolean
): boolean | 'require' | 'prefer' | Record<string, unknown> {
  if (ssl === undefined) {
    // Default: require in production, disable in development
    return isProduction ? 'require' : false;
  }

  if (typeof ssl === 'boolean' || ssl === 'require' || ssl === 'prefer') {
    return ssl;
  }

  // Custom SSL config object
  return {
    rejectUnauthorized: ssl.rejectUnauthorized ?? isProduction,
    ca: ssl.ca,
    cert: ssl.cert,
    key: ssl.key,
  };
}

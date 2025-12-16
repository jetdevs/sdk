/**
 * node-postgres (pg) Driver Adapters
 *
 * Adapters for the node-postgres (pg) driver.
 * Provides two modes:
 * - Single client mode: For simple use cases
 * - Pool mode: For production with connection pooling
 *
 * This is the recommended driver for:
 * - AWS RDS PostgreSQL
 * - Traditional PostgreSQL servers with connection pooling
 * - Enterprise deployments
 *
 * @module @jetdevs/core/db/drivers/adapters/pg
 */

import type { SQL } from 'drizzle-orm';
import type {
    ConnectionStats,
    DatabaseDialect,
    DatabaseDriver,
    DriverAdapter,
    DriverCapabilities,
    PgDriverConfig,
    QueryResult,
    TransactionOptions,
} from '../types';

// =============================================================================
// PG ADAPTER (SINGLE CLIENT)
// =============================================================================

/**
 * Capabilities for node-postgres driver
 */
const PG_CAPABILITIES: DriverCapabilities = {
  transactions: true,
  nestedTransactions: true,
  preparedStatements: true,
  connectionPooling: false, // Single client mode
  serverless: false,
  streaming: true,
  batchQueries: true,
  returning: true,
};

/**
 * node-postgres single client adapter implementation
 */
class PgAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'pg';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = PG_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: PgDriverConfig;
  private connected = false;
  private closed = false;

  constructor(client: any, config: PgDriverConfig) {
    this.rawClient = client;
    this.config = config;
  }

  /**
   * Execute a raw SQL query
   */
  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    await this.ensureConnected();
    this.ensureNotClosed();

    try {
      const result = await this.rawClient.query(sqlString, params);

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
        fields: result.fields?.map((f: any) => ({
          name: f.name,
          type: f.dataTypeID,
        })),
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
    const { queryString, params } = this.sqlToQuery(sql);
    return this.execute<T>(queryString, params);
  }

  /**
   * Begin a transaction
   */
  async transaction<T>(
    callback: (tx: DriverAdapter<any>) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    await this.ensureConnected();
    this.ensureNotClosed();

    try {
      // Start the transaction
      await this.rawClient.query(this.buildBeginStatement(options));

      // Create a transaction-scoped adapter
      const txAdapter = new PgTransactionAdapter(this.rawClient, this.config);

      // Execute the callback
      const result = await callback(txAdapter);

      // Commit
      await this.rawClient.query('COMMIT');

      return result;
    } catch (error) {
      // Rollback on error
      try {
        await this.rawClient.query('ROLLBACK');
      } catch (rollbackError) {
        this.logError('rollback', rollbackError);
      }
      throw error;
    }
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
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.closed) return;

    try {
      await this.rawClient.end();
      this.closed = true;
      this.connected = false;
      this.log('Connection closed');
    } catch (error) {
      this.logError('close', error);
      throw error;
    }
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async ensureConnected(): Promise<void> {
    if (!this.connected && !this.closed) {
      await this.rawClient.connect();
      this.connected = true;
    }
  }

  private ensureNotClosed(): void {
    if (this.closed) {
      throw new Error('Database connection has been closed');
    }
  }

  private buildBeginStatement(options?: TransactionOptions): string {
    const parts = ['BEGIN'];

    if (options?.isolationLevel) {
      parts.push(`ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`);
    }

    if (options?.accessMode) {
      parts.push(options.accessMode.toUpperCase());
    }

    if (options?.deferrable) {
      parts.push('DEFERRABLE');
    }

    return parts.join(' ');
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

  private log(message: string): void {
    if (this.config.debug && this.config.logger) {
      this.config.logger(message);
    } else if (this.config.debug) {
      console.log(`[pg] ${message}`);
    }
  }

  private logError(operation: string, error: unknown): void {
    if (this.config.logger) {
      this.config.logger(`Error in ${operation}`, { error });
    } else if (this.config.debug) {
      console.error(`[pg] Error in ${operation}:`, error);
    }
  }
}

// =============================================================================
// PG POOL ADAPTER
// =============================================================================

/**
 * Capabilities for node-postgres pool
 */
const PG_POOL_CAPABILITIES: DriverCapabilities = {
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
 * node-postgres pool adapter implementation
 */
class PgPoolAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'pg-pool';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = PG_POOL_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: PgDriverConfig;
  private closed = false;

  constructor(pool: any, config: PgDriverConfig) {
    this.rawClient = pool;
    this.config = config;
  }

  /**
   * Execute a raw SQL query
   */
  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    this.ensureNotClosed();

    try {
      const result = await this.rawClient.query(sqlString, params);

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
        fields: result.fields?.map((f: any) => ({
          name: f.name,
          type: f.dataTypeID,
        })),
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
    const { queryString, params } = this.sqlToQuery(sql);
    return this.execute<T>(queryString, params);
  }

  /**
   * Begin a transaction
   */
  async transaction<T>(
    callback: (tx: DriverAdapter<any>) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    this.ensureNotClosed();

    // Get a client from the pool
    const client = await this.rawClient.connect();

    try {
      // Start the transaction
      await client.query(this.buildBeginStatement(options));

      // Create a transaction-scoped adapter
      const txAdapter = new PgTransactionAdapter(client, this.config);

      // Execute the callback
      const result = await callback(txAdapter);

      // Commit
      await client.query('COMMIT');

      return result;
    } catch (error) {
      // Rollback on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.logError('rollback', rollbackError);
      }
      throw error;
    } finally {
      // Release the client back to the pool
      client.release();
    }
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
    return {
      total: this.rawClient.totalCount ?? 0,
      idle: this.rawClient.idleCount ?? 0,
      active: (this.rawClient.totalCount ?? 0) - (this.rawClient.idleCount ?? 0),
      waiting: this.rawClient.waitingCount ?? 0,
    };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private ensureNotClosed(): void {
    if (this.closed) {
      throw new Error('Database connection pool has been closed');
    }
  }

  private buildBeginStatement(options?: TransactionOptions): string {
    const parts = ['BEGIN'];

    if (options?.isolationLevel) {
      parts.push(`ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`);
    }

    if (options?.accessMode) {
      parts.push(options.accessMode.toUpperCase());
    }

    if (options?.deferrable) {
      parts.push('DEFERRABLE');
    }

    return parts.join(' ');
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

  private log(message: string): void {
    if (this.config.debug && this.config.logger) {
      this.config.logger(message);
    } else if (this.config.debug) {
      console.log(`[pg-pool] ${message}`);
    }
  }

  private logError(operation: string, error: unknown): void {
    if (this.config.logger) {
      this.config.logger(`Error in ${operation}`, { error });
    } else if (this.config.debug) {
      console.error(`[pg-pool] Error in ${operation}:`, error);
    }
  }
}

/**
 * Transaction-scoped adapter for node-postgres
 */
class PgTransactionAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'pg';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = PG_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: PgDriverConfig;
  private savepointCounter = 0;

  constructor(client: any, config: PgDriverConfig) {
    this.rawClient = client;
    this.config = config;
  }

  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.rawClient.query(sqlString, params);

    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields?.map((f: any) => ({
        name: f.name,
        type: f.dataTypeID,
      })),
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
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a node-postgres single client adapter
 *
 * Use this for simple use cases or when you need a single persistent connection.
 *
 * @param config - PostgreSQL driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createPgAdapter({
 *   url: process.env.DATABASE_URL!,
 * });
 * ```
 */
export async function createPgAdapter(
  config: PgDriverConfig
): Promise<DriverAdapter<any>> {
  // Dynamically import pg
  const pg = await import('pg');

  // Parse connection URL
  const clientConfig = buildPgConfig(config);

  // Create the client
  const client = new pg.Client(clientConfig);

  return new PgAdapter(client, config);
}

/**
 * Create a node-postgres pool adapter
 *
 * Use this for production with connection pooling.
 *
 * @param config - PostgreSQL driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createPgPoolAdapter({
 *   url: process.env.DATABASE_URL!,
 *   pool: {
 *     max: 20,
 *     idleTimeout: 30,
 *   },
 * });
 * ```
 */
export async function createPgPoolAdapter(
  config: PgDriverConfig
): Promise<DriverAdapter<any>> {
  // Dynamically import pg
  const pg = await import('pg');

  // Parse connection URL
  const poolConfig = {
    ...buildPgConfig(config),
    max: config.pool?.max ?? 10,
    min: config.pool?.min ?? 0,
    idleTimeoutMillis: (config.pool?.idleTimeout ?? 20) * 1000,
    connectionTimeoutMillis: (config.pool?.connectTimeout ?? 30) * 1000,
    maxLifetimeSeconds: config.pool?.maxLifetime ?? 1800,
  };

  // Create the pool
  const pool = new pg.Pool(poolConfig);

  // Handle pool errors
  pool.on('error', (err: Error) => {
    if (config.logger) {
      config.logger('Unexpected pool error', { error: err });
    } else if (config.debug) {
      console.error('[pg-pool] Unexpected error:', err);
    }
  });

  return new PgPoolAdapter(pool, config);
}

/**
 * Build pg configuration from our config format
 */
function buildPgConfig(config: PgDriverConfig): Record<string, unknown> {
  const isProduction = process.env.NODE_ENV === 'production';

  const pgConfig: Record<string, unknown> = {
    connectionString: config.url,
  };

  // SSL configuration
  if (config.ssl !== undefined) {
    if (typeof config.ssl === 'boolean') {
      pgConfig.ssl = config.ssl;
    } else if (config.ssl === 'require') {
      pgConfig.ssl = { rejectUnauthorized: true };
    } else if (config.ssl === 'prefer') {
      pgConfig.ssl = { rejectUnauthorized: false };
    } else {
      pgConfig.ssl = {
        rejectUnauthorized: config.ssl.rejectUnauthorized ?? isProduction,
        ca: config.ssl.ca,
        cert: config.ssl.cert,
        key: config.ssl.key,
      };
    }
  } else {
    // Default SSL based on environment
    pgConfig.ssl = isProduction ? { rejectUnauthorized: false } : false;
  }

  // Statement timeout
  if (config.statementTimeout) {
    pgConfig.statement_timeout = config.statementTimeout;
  }

  // Query timeout
  if (config.queryTimeout) {
    pgConfig.query_timeout = config.queryTimeout;
  }

  // Keep alive
  if (config.keepAlive !== undefined) {
    pgConfig.keepAlive = config.keepAlive;
    if (config.keepAliveInitialDelayMillis) {
      pgConfig.keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis;
    }
  }

  return pgConfig;
}

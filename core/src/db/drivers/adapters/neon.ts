/**
 * Neon Serverless Driver Adapters
 *
 * Adapters for the @neondatabase/serverless driver.
 * Provides two modes:
 * - HTTP mode: For simple queries in serverless (no transactions)
 * - WebSocket mode: For full transaction support in serverless
 *
 * This is the recommended driver for:
 * - Vercel + Neon deployments
 * - Edge runtimes
 * - Serverless functions
 *
 * @module @yobolabs/core/db/drivers/adapters/neon
 */

import type { SQL } from 'drizzle-orm';
import type {
  DriverAdapter,
  DatabaseDriver,
  DatabaseDialect,
  DriverCapabilities,
  NeonDriverConfig,
  QueryResult,
  TransactionOptions,
  ConnectionStats,
} from '../types';

// =============================================================================
// NEON HTTP ADAPTER
// =============================================================================

/**
 * Capabilities for Neon HTTP mode
 */
const NEON_HTTP_CAPABILITIES: DriverCapabilities = {
  transactions: false, // HTTP mode doesn't support transactions
  nestedTransactions: false,
  preparedStatements: false,
  connectionPooling: false,
  serverless: true,
  streaming: false,
  batchQueries: true,
  returning: true,
};

/**
 * Neon HTTP driver adapter implementation
 * Uses HTTP requests for stateless queries - ideal for serverless
 */
class NeonHttpAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'neon-http';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = NEON_HTTP_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: NeonDriverConfig;
  private readonly neonConfig: any;

  constructor(sql: any, config: NeonDriverConfig, neonConfig: any) {
    this.rawClient = sql;
    this.config = config;
    this.neonConfig = neonConfig;
  }

  /**
   * Execute a raw SQL query via HTTP
   */
  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    try {
      // Neon HTTP uses tagged template style, but we can pass raw SQL
      const result = params && params.length > 0
        ? await this.rawClient(sqlString, params)
        : await this.rawClient(sqlString);

      return {
        rows: result.rows ?? result,
        rowCount: result.rowCount ?? result.length,
        fields: result.fields,
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
   * Transactions are not supported in HTTP mode
   */
  async transaction<T>(
    _callback: (tx: DriverAdapter<any>) => Promise<T>,
    _options?: TransactionOptions
  ): Promise<T> {
    throw new Error(
      'Transactions are not supported in Neon HTTP mode. ' +
      'Use "neon-ws" driver for transaction support, or restructure your code ' +
      'to avoid transactions in serverless environments.'
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
   * Close the connection (no-op for HTTP)
   */
  async close(): Promise<void> {
    // HTTP mode doesn't maintain persistent connections
    this.log('Neon HTTP adapter closed (no-op for stateless HTTP)');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

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
      console.log(`[neon-http] ${message}`);
    }
  }

  private logError(operation: string, error: unknown): void {
    if (this.config.logger) {
      this.config.logger(`Error in ${operation}`, { error });
    } else if (this.config.debug) {
      console.error(`[neon-http] Error in ${operation}:`, error);
    }
  }
}

// =============================================================================
// NEON WEBSOCKET ADAPTER
// =============================================================================

/**
 * Capabilities for Neon WebSocket mode
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
 * Neon WebSocket driver adapter implementation
 * Uses WebSocket connections for full PostgreSQL compatibility including transactions
 */
class NeonWsAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'neon-ws';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = NEON_WS_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: NeonDriverConfig;
  private readonly pool: any;
  private closed = false;

  constructor(pool: any, config: NeonDriverConfig) {
    this.rawClient = pool;
    this.pool = pool;
    this.config = config;
  }

  /**
   * Execute a raw SQL query
   */
  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    this.ensureNotClosed();

    try {
      const result = params && params.length > 0
        ? await this.pool.query(sqlString, params)
        : await this.pool.query(sqlString);

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
        fields: result.fields,
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
    const client = await this.pool.connect();

    try {
      // Start the transaction
      await client.query(this.buildBeginStatement(options));

      // Create a transaction-scoped adapter
      const txAdapter = new NeonWsTransactionAdapter(client, this.config);

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
      await this.pool.end();
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
      total: this.pool.totalCount ?? 0,
      idle: this.pool.idleCount ?? 0,
      active: this.pool.totalCount - this.pool.idleCount ?? 0,
      waiting: this.pool.waitingCount ?? 0,
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
      console.log(`[neon-ws] ${message}`);
    }
  }

  private logError(operation: string, error: unknown): void {
    if (this.config.logger) {
      this.config.logger(`Error in ${operation}`, { error });
    } else if (this.config.debug) {
      console.error(`[neon-ws] Error in ${operation}:`, error);
    }
  }
}

/**
 * Transaction-scoped adapter for Neon WebSocket
 */
class NeonWsTransactionAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'neon-ws';
  readonly dialect: DatabaseDialect = 'postgresql';
  readonly capabilities: DriverCapabilities = NEON_WS_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: NeonDriverConfig;
  private savepointCounter = 0;

  constructor(client: any, config: NeonDriverConfig) {
    this.rawClient = client;
    this.config = config;
  }

  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = params && params.length > 0
      ? await this.rawClient.query(sqlString, params)
      : await this.rawClient.query(sqlString);

    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields,
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
 * Create a Neon HTTP driver adapter
 *
 * Use this for simple queries in serverless environments.
 * Does NOT support transactions.
 *
 * @param config - Neon driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createNeonHttpAdapter({
 *   url: process.env.DATABASE_URL!,
 * });
 *
 * // Simple queries work great
 * const result = await adapter.execute('SELECT * FROM users');
 *
 * // This will throw - use neon-ws for transactions
 * await adapter.transaction(async (tx) => { ... });
 * ```
 */
export async function createNeonHttpAdapter(
  config: NeonDriverConfig
): Promise<DriverAdapter<any>> {
  // Dynamically import @neondatabase/serverless
  const neon = await import('@neondatabase/serverless');

  // Configure neon
  const neonConfig: Record<string, unknown> = {};

  if (config.fetchFunction) {
    neonConfig.fetchFunction = config.fetchFunction;
  }

  // Create the SQL function
  const sql = neon.neon(config.url, {
    fullResults: true,
    ...neonConfig,
  });

  return new NeonHttpAdapter(sql, config, neonConfig);
}

/**
 * Create a Neon WebSocket driver adapter
 *
 * Use this when you need transaction support in serverless environments.
 * Maintains WebSocket connections for full PostgreSQL compatibility.
 *
 * @param config - Neon driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createNeonWsAdapter({
 *   url: process.env.DATABASE_URL!,
 *   pool: {
 *     max: 5,
 *   },
 * });
 *
 * // Transactions are fully supported
 * await adapter.transaction(async (tx) => {
 *   await tx.execute('INSERT INTO users ...');
 *   await tx.execute('INSERT INTO profiles ...');
 * });
 * ```
 */
export async function createNeonWsAdapter(
  config: NeonDriverConfig
): Promise<DriverAdapter<any>> {
  // Dynamically import @neondatabase/serverless
  const neon = await import('@neondatabase/serverless');

  // Configure WebSocket
  if (config.webSocketConstructor) {
    neon.neonConfig.webSocketConstructor = config.webSocketConstructor;
  }

  // Parse connection URL for pool configuration
  const poolConfig: Record<string, unknown> = {
    connectionString: config.url,
    max: config.pool?.max ?? 10,
    idleTimeoutMillis: (config.pool?.idleTimeout ?? 20) * 1000,
    connectionTimeoutMillis: (config.pool?.connectTimeout ?? 30) * 1000,
  };

  // SSL configuration
  if (config.ssl !== undefined) {
    if (typeof config.ssl === 'boolean') {
      poolConfig.ssl = config.ssl;
    } else if (config.ssl === 'require') {
      poolConfig.ssl = { rejectUnauthorized: true };
    } else if (config.ssl === 'prefer') {
      poolConfig.ssl = { rejectUnauthorized: false };
    } else {
      poolConfig.ssl = config.ssl;
    }
  }

  // Create the Pool using Neon's Pool class
  const pool = new neon.Pool(poolConfig);

  return new NeonWsAdapter(pool, config);
}

/**
 * Create the appropriate Neon adapter based on configuration
 *
 * Automatically selects HTTP or WebSocket mode based on transaction requirements.
 *
 * @param config - Neon driver configuration
 * @returns Promise resolving to the driver adapter
 */
export async function createNeonAdapter(
  config: NeonDriverConfig & { fullTransactionSupport?: boolean }
): Promise<DriverAdapter<any>> {
  if (config.fullTransactionSupport) {
    return createNeonWsAdapter(config);
  }
  return createNeonHttpAdapter(config);
}

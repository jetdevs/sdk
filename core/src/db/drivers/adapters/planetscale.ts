/**
 * PlanetScale Driver Adapter
 *
 * Adapter for the @planetscale/database serverless driver.
 * This is the recommended driver for:
 * - PlanetScale MySQL deployments
 * - Serverless MySQL (Vercel Edge, Cloudflare Workers)
 *
 * Note: PlanetScale is MySQL-based, so some PostgreSQL-specific features
 * (like RETURNING) are not available.
 *
 * @module @jetdevs/core/db/drivers/adapters/planetscale
 */

import type { SQL } from 'drizzle-orm';
import type {
    DatabaseDialect,
    DatabaseDriver,
    DriverAdapter,
    DriverCapabilities,
    PlanetScaleDriverConfig,
    QueryResult,
    TransactionOptions,
} from '../types';

// =============================================================================
// PLANETSCALE ADAPTER
// =============================================================================

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
 * PlanetScale driver adapter implementation
 */
class PlanetScaleAdapter implements DriverAdapter<any> {
  readonly driver: DatabaseDriver = 'planetscale';
  readonly dialect: DatabaseDialect = 'mysql';
  readonly capabilities: DriverCapabilities = PLANETSCALE_CAPABILITIES;
  readonly rawClient: any;

  private readonly config: PlanetScaleDriverConfig;

  constructor(connection: any, config: PlanetScaleDriverConfig) {
    this.rawClient = connection;
    this.config = config;
  }

  /**
   * Execute a raw SQL query
   */
  async execute<T = unknown>(sqlString: string, params?: unknown[]): Promise<QueryResult<T>> {
    try {
      const result = await this.rawClient.execute(sqlString, params);

      return {
        rows: result.rows as T[],
        rowCount: result.rowsAffected ?? result.rows.length,
        fields: result.fields?.map((f: any) => ({
          name: f.name,
          type: f.type,
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
   * Transactions are not supported in PlanetScale HTTP mode
   */
  async transaction<T>(
    _callback: (tx: DriverAdapter<any>) => Promise<T>,
    _options?: TransactionOptions
  ): Promise<T> {
    throw new Error(
      'Transactions are not supported in PlanetScale serverless driver. ' +
      'Use interactive transactions via mysql2 driver for transaction support, ' +
      'or restructure your code to avoid transactions.'
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
   * Close the connection (no-op for PlanetScale HTTP)
   */
  async close(): Promise<void> {
    // HTTP mode doesn't maintain persistent connections
    this.log('PlanetScale adapter closed (no-op for stateless HTTP)');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private sqlToQuery(sql: SQL): { queryString: string; params: unknown[] } {
    // MySQL uses ? for parameters
    const built = sql.toQuery({
      casing: undefined as any,
      escapeName: (name: string) => `\`${name}\``,
      escapeParam: (_num: number, _value: unknown) => '?',
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
      console.log(`[planetscale] ${message}`);
    }
  }

  private logError(operation: string, error: unknown): void {
    if (this.config.logger) {
      this.config.logger(`Error in ${operation}`, { error });
    } else if (this.config.debug) {
      console.error(`[planetscale] Error in ${operation}:`, error);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a PlanetScale driver adapter
 *
 * @param config - PlanetScale driver configuration
 * @returns Promise resolving to the driver adapter
 *
 * @example
 * ```typescript
 * const adapter = await createPlanetScaleAdapter({
 *   url: process.env.DATABASE_URL!, // mysql://user:pass@host/db?...
 * });
 *
 * // Simple queries work great
 * const result = await adapter.execute('SELECT * FROM users');
 *
 * // Note: Transactions are not supported via HTTP
 * ```
 */
export async function createPlanetScaleAdapter(
  config: PlanetScaleDriverConfig
): Promise<DriverAdapter<any>> {
  // Dynamically import @planetscale/database
  const { connect } = await import('@planetscale/database');

  // Parse the URL to extract connection config
  const url = new URL(config.url);

  // Build connection config
  const connectionConfig: Record<string, unknown> = {
    host: url.hostname,
    username: url.username,
    password: url.password,
  };

  // Add fetch function if provided
  if (config.fetchFunction) {
    connectionConfig.fetch = config.fetchFunction;
  }

  // Create the connection
  const connection = connect(connectionConfig);

  return new PlanetScaleAdapter(connection, config);
}

/**
 * Database context configuration
 *
 * Allows applications to configure how database connections
 * and RLS contexts are managed.
 */

/**
 * Database instance provider
 */
export type DatabaseProvider = () => any;

/**
 * Organization context extractor
 */
export type OrgContextExtractor = (ctx: any) => {
  orgId?: number | null;
  workspaceId?: number | null;
  userId?: number | null;
};

/**
 * RLS context setter
 */
export type RLSContextSetter = (context: {
  orgId?: number | null;
  workspaceId?: number | null;
  userId?: number | null;
}) => Promise<any> | any;

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  /**
   * Function to get the database instance
   */
  getDatabase: DatabaseProvider;

  /**
   * Function to extract organization context from request context
   */
  getOrgContext: OrgContextExtractor;

  /**
   * Function to set RLS context for database queries
   * Optional - the framework will use AsyncLocalStorage if not provided
   */
  setRLSContext?: RLSContextSetter;
}

/**
 * Global database configuration
 * @internal
 */
let databaseConfig: DatabaseConfig | null = null;

/**
 * Configure the database context
 *
 * This allows applications to integrate their existing database
 * and RLS system with the framework.
 *
 * @param config - Database configuration
 *
 * @example
 * ```typescript
 * import { configureDatabaseContext } from '@jetdevs/framework/db';
 * import { db } from './database';
 *
 * configureDatabaseContext({
 *   getDatabase: () => db,
 *   getOrgContext: (ctx) => ({
 *     orgId: ctx.session?.user?.currentOrgId,
 *     workspaceId: ctx.activeWorkspaceId,
 *     userId: ctx.session?.user?.id,
 *   }),
 * });
 * ```
 */
export function configureDatabaseContext(config: DatabaseConfig): void {
  if (databaseConfig) {
    console.warn('[Framework] Database context already configured. Overwriting existing configuration.');
  }
  databaseConfig = config;
}

/**
 * Get the current database configuration
 * @internal
 */
export function getDatabaseConfig(): DatabaseConfig | null {
  return databaseConfig;
}

/**
 * Check if database is configured
 * @internal
 */
export function isDatabaseConfigured(): boolean {
  return databaseConfig !== null;
}

/**
 * Get the database instance using configuration
 * @internal
 */
export function getConfiguredDatabase(): any {
  if (!databaseConfig?.getDatabase) {
    throw new Error(
      'Database not configured. Call configureDatabaseContext() during app initialization.\n' +
      'Example:\n' +
      '  import { configureDatabaseContext } from \'@jetdevs/framework/db\';\n' +
      '  import { db } from \'./database\';\n' +
      '  configureDatabaseContext({\n' +
      '    getDatabase: () => db,\n' +
      '    getOrgContext: (ctx) => ({ orgId: ctx.session?.user?.currentOrgId }),\n' +
      '  });'
    );
  }
  return databaseConfig.getDatabase();
}

/**
 * Extract organization context using configuration
 * @internal
 */
export function extractOrgContext(ctx: any): {
  orgId?: number | null;
  workspaceId?: number | null;
  userId?: number | null;
} {
  if (!databaseConfig?.getOrgContext) {
    // Fallback to common patterns
    return {
      orgId: ctx.session?.user?.currentOrgId || ctx.activeOrgId || ctx.orgId,
      workspaceId: ctx.activeWorkspaceId || ctx.workspaceId,
      userId: ctx.session?.user?.id || ctx.userId,
    };
  }
  return databaseConfig.getOrgContext(ctx);
}
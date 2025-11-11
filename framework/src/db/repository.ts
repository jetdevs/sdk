/**
 * Database Repository Factory
 *
 * Creates type-safe repositories with automatic RLS enforcement
 * Hides implementation details from developers while ensuring security
 *
 * IMPORTANT: This SDK supports the callback-wrapped database pattern
 * used by merchant-portal for proper RLS enforcement.
 */

import type { Repository, RepositoryOptions, BaseFilters, RLSContext } from './types';
import { getRLSContext, getRLSContextOptional } from './context';
import type { SQL } from 'drizzle-orm';

/**
 * Database client type (compatible with Drizzle)
 * @internal
 */
interface DatabaseClient {
  execute(query: SQL): Promise<unknown>;
  query: Record<string, {
    findMany(config?: { where?: unknown }): Promise<unknown[]>;
    findFirst(config?: { where?: unknown }): Promise<unknown | undefined>;
  }>;
  insert(table: unknown): {
    values(data: unknown): {
      returning(): Promise<unknown[]>;
    };
  };
  update(table: unknown): {
    set(data: unknown): {
      where(condition: unknown): {
        returning(): Promise<unknown[]>;
      };
    };
  };
  delete(table: unknown): {
    where(condition: unknown): Promise<void>;
  };
}

/**
 * Callback-wrapped database function type
 * This matches the merchant-portal's dbWithRLS pattern
 */
type DatabaseCallback<T> = (db: DatabaseClient) => Promise<T>;
type DbWithRLS = <T>(callback: DatabaseCallback<T>) => Promise<T>;

/**
 * Context type that can provide either direct DB or callback-wrapped DB
 */
interface RepositoryContext {
  db?: DatabaseClient;
  dbWithRLS?: DbWithRLS;
  orgId?: number;
  workspaceId?: number;
  userId?: number;
}

/**
 * Internal implementation of repository
 * This class is not exported - only the factory function is public
 * @internal
 */
class RepositoryImpl<T> implements Repository<T> {
  constructor(
    private tableName: string,
    private options: RepositoryOptions,
    private context: RepositoryContext
  ) {}

  /**
   * Get current RLS context and validate org access
   * @internal
   */
  private getContext(): RLSContext {
    // If context provides orgId directly, use it
    if (this.context.orgId !== undefined) {
      return {
        orgId: this.context.orgId,
        workspaceId: this.context.workspaceId,
        userId: this.context.userId
      };
    }

    // For non-org-scoped tables, we don't need RLS context
    if (!this.options.orgScoped) {
      const context = getRLSContextOptional();
      return context ?? { orgId: 0 }; // Return dummy context for non-scoped tables
    }

    const context = getRLSContext();

    if (!context.orgId) {
      throw new Error(
        `No org context available for org-scoped table "${this.tableName}". ` +
        'Ensure the request is made within an authenticated org context.'
      );
    }

    return context;
  }

  /**
   * Execute a database operation using the appropriate method
   * @internal
   */
  private async executeDbOperation<R>(
    operation: (db: DatabaseClient) => Promise<R>
  ): Promise<R> {
    // If we have dbWithRLS (callback-wrapped pattern), use it
    if (this.context.dbWithRLS) {
      return this.context.dbWithRLS(operation);
    }

    // If we have direct db access, use it
    if (this.context.db) {
      return operation(this.context.db);
    }

    throw new Error(
      'No database access method available. Context must provide either db or dbWithRLS.'
    );
  }

  /**
   * Apply org filter to queries if org-scoped
   * @internal
   */
  private applyOrgFilter(filters: BaseFilters = {}): BaseFilters {
    if (!this.options.orgScoped) {
      return filters;
    }

    const context = this.getContext();
    return {
      ...filters,
      org_id: context.orgId,
    };
  }

  async findMany(filters: BaseFilters = {}): Promise<T[]> {
    const context = this.getContext();
    const finalFilters = this.applyOrgFilter(filters);

    // Execute query using callback pattern if available
    return this.executeDbOperation(async (db) => {
      const results = await db.query[this.tableName].findMany({
        where: finalFilters,
      }) as T[];
      return results;
    });
  }

  async findOne(id: number | string): Promise<T | undefined> {
    const context = this.getContext();
    const filters = this.applyOrgFilter({ id });

    return this.executeDbOperation(async (db) => {
      const result = await db.query[this.tableName].findFirst({
        where: filters,
      }) as T | undefined;
      return result;
    });
  }

  async create(data: Partial<T>): Promise<T> {
    const context = this.getContext();

    // Automatically inject org_id for org-scoped tables
    const finalData = this.options.orgScoped
      ? { ...data, org_id: context.orgId }
      : data;

    // Inject workspace_id if workspace-scoped
    const dataWithWorkspace = this.options.workspaceScoped && context.workspaceId
      ? { ...finalData, workspace_id: context.workspaceId }
      : finalData;

    return this.executeDbOperation(async (db) => {
      const [result] = await db
        .insert(this.tableName as any)
        .values(dataWithWorkspace)
        .returning() as T[];

      if (!result) {
        throw new Error(`Failed to create record in ${this.tableName}`);
      }

      return result;
    });
  }

  async update(id: number | string, data: Partial<T>): Promise<T> {
    const context = this.getContext();
    const filters = this.applyOrgFilter({ id });

    // Prevent changing org_id
    const sanitizedData = { ...data };
    delete (sanitizedData as any).org_id;

    return this.executeDbOperation(async (db) => {
      const [result] = await db
        .update(this.tableName as any)
        .set(sanitizedData)
        .where(filters as any)
        .returning() as T[];

      if (!result) {
        throw new Error(
          `Failed to update record ${id} in ${this.tableName}. ` +
          'Record may not exist or you may not have access to it.'
        );
      }

      return result;
    });
  }

  async delete(id: number | string): Promise<void> {
    const context = this.getContext();
    const filters = this.applyOrgFilter({ id });

    return this.executeDbOperation(async (db) => {
      await db
        .delete(this.tableName as any)
        .where(filters as any);
    });
  }

  async count(filters: BaseFilters = {}): Promise<number> {
    const context = this.getContext();
    const finalFilters = this.applyOrgFilter(filters);

    return this.executeDbOperation(async (db) => {
      const results = await db.query[this.tableName].findMany({
        where: finalFilters,
      });

      return results.length;
    });
  }
}

/**
 * Create a type-safe repository for a database table
 *
 * This factory function creates a repository that automatically handles:
 * - RLS context enforcement
 * - Org-level data isolation
 * - Automatic org_id injection on create
 * - Type-safe CRUD operations
 * - Callback-wrapped database pattern (dbWithRLS)
 *
 * @example
 * ```typescript
 * // Create repository with callback-wrapped DB (merchant-portal pattern)
 * const campaignRepo = createRepository<Campaign>('campaigns', {
 *   orgScoped: true,
 *   workspaceScoped: false
 * }, ctx);  // Pass the entire context with dbWithRLS
 *
 * // Or with direct DB access (future support)
 * const campaignRepo = createRepository<Campaign>('campaigns', {
 *   orgScoped: true,
 *   workspaceScoped: false
 * }, { db: ctx.db, orgId: ctx.session.user.currentOrgId });
 *
 * // Use repository - RLS is automatically enforced
 * const campaigns = await campaignRepo.findMany({ status: 'active' });
 * const campaign = await campaignRepo.create({
 *   name: 'Summer Sale',
 *   status: 'draft'
 *   // org_id is automatically injected
 * });
 * ```
 *
 * @param tableName - Name of the database table
 * @param options - Repository configuration
 * @param context - Repository context (can be tRPC ctx with dbWithRLS, or custom context)
 * @returns Repository instance with CRUD operations
 */
export function createRepository<T = unknown>(
  tableName: string,
  options: RepositoryOptions,
  context: RepositoryContext | any
): Repository<T> {
  // Support passing the tRPC context directly
  // Check if it looks like a tRPC context with dbWithRLS
  if (context && typeof context.dbWithRLS === 'function') {
    // This is a tRPC context with callback-wrapped pattern
    const repoContext: RepositoryContext = {
      dbWithRLS: context.dbWithRLS,
      orgId: context.session?.user?.currentOrgId || context.activeOrgId,
      workspaceId: context.activeWorkspaceId,
      userId: context.session?.user?.id
    };
    return new RepositoryImpl<T>(tableName, options, repoContext);
  }

  // Support direct database client for backward compatibility
  if (context && typeof context.execute === 'function' && typeof context.query === 'object') {
    // This is a direct database client
    const repoContext: RepositoryContext = {
      db: context as DatabaseClient
    };
    return new RepositoryImpl<T>(tableName, options, repoContext);
  }

  // Assume it's already a properly formatted RepositoryContext
  return new RepositoryImpl<T>(tableName, options, context as RepositoryContext);
}

/**
 * Re-export types that developers need
 */
export type { Repository, RepositoryOptions, BaseFilters };

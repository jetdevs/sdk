/**
 * Internal types for database operations
 * These types are not exported to SDK users
 */

import type { SQL } from 'drizzle-orm';

/**
 * Context required for database operations with RLS
 * @internal
 */
export interface RLSContext {
  orgId: number;
  workspaceId?: number;
  userId?: number;
}

/**
 * Options for creating a repository
 */
export interface RepositoryOptions {
  /**
   * Whether the table requires org-level isolation
   * When true, all queries are automatically filtered by org_id
   */
  orgScoped: boolean;

  /**
   * Whether the table has workspace-level data organization
   * Note: RLS is still at org-level, this is for data organization only
   */
  workspaceScoped?: boolean;
}

/**
 * Base filter interface for repository queries
 */
export interface BaseFilters {
  [key: string]: unknown;
}

/**
 * Repository interface providing CRUD operations
 */
export interface Repository<T> {
  /**
   * Find many records matching filters
   */
  findMany(filters?: BaseFilters): Promise<T[]>;

  /**
   * Find a single record by ID
   */
  findOne(id: number | string): Promise<T | undefined>;

  /**
   * Create a new record
   * org_id is automatically injected for org-scoped tables
   */
  create(data: Partial<T>): Promise<T>;

  /**
   * Update an existing record
   * Automatically scoped to current org if org-scoped
   */
  update(id: number | string, data: Partial<T>): Promise<T>;

  /**
   * Delete a record
   * Automatically scoped to current org if org-scoped
   */
  delete(id: number | string): Promise<void>;

  /**
   * Count records matching filters
   */
  count(filters?: BaseFilters): Promise<number>;
}

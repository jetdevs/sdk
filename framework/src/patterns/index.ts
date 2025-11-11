/**
 * Repository Pattern Interfaces
 *
 * These are PATTERNS, not implementations. Each domain implements
 * their own repositories following these interfaces.
 *
 * This ensures consistency without forcing generic CRUD operations.
 */

/**
 * Base repository pattern that all domain repositories should follow
 */
export interface DomainRepository<T, TCreateInput = Partial<T>, TUpdateInput = Partial<T>> {
  /**
   * Find a single entity by UUID
   */
  findByUuid(uuid: string): Promise<T | null>;

  /**
   * Find a single entity by ID
   */
  findById(id: number): Promise<T | null>;

  /**
   * Create a new entity
   */
  create(data: TCreateInput, orgId: number): Promise<T>;

  /**
   * Update an existing entity
   */
  update(uuid: string, data: TUpdateInput): Promise<T | null>;

  /**
   * Delete an entity
   */
  delete(uuid: string): Promise<boolean>;
}

/**
 * Repository pattern for entities that support soft delete
 */
export interface SoftDeletableRepository<T> {
  /**
   * Soft delete (archive) an entity
   */
  archive(uuid: string): Promise<T | null>;

  /**
   * Restore a soft-deleted entity
   */
  restore(uuid: string): Promise<T | null>;

  /**
   * Find including soft-deleted entities
   */
  findWithDeleted(uuid: string): Promise<T | null>;

  /**
   * Permanently delete a soft-deleted entity
   */
  hardDelete(uuid: string): Promise<boolean>;
}

/**
 * Repository pattern for auditable entities
 */
export interface AuditableRepository<T> {
  /**
   * Get the audit trail for an entity
   */
  getAuditTrail(uuid: string): Promise<AuditEntry[]>;

  /**
   * Create with audit logging
   */
  createWithAudit(data: any, context: AuditContext): Promise<T>;

  /**
   * Update with audit logging
   */
  updateWithAudit(uuid: string, data: any, context: AuditContext): Promise<T | null>;

  /**
   * Delete with audit logging
   */
  deleteWithAudit(uuid: string, context: AuditContext): Promise<boolean>;
}

/**
 * Repository pattern for versioned entities
 */
export interface VersionedRepository<T> {
  /**
   * Get all versions of an entity
   */
  getVersions(uuid: string): Promise<T[]>;

  /**
   * Get a specific version
   */
  getVersion(uuid: string, version: number): Promise<T | null>;

  /**
   * Create a new version from existing
   */
  createVersion(uuid: string, data?: Partial<T>): Promise<T>;

  /**
   * Publish a version
   */
  publishVersion(uuid: string, version: number): Promise<T>;

  /**
   * Revert to a previous version
   */
  revertToVersion(uuid: string, version: number): Promise<T>;
}

/**
 * Types for audit functionality
 */
export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  userId: string;
  changes?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
}

export interface AuditContext {
  userId: string;
  action: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Common query options
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Common filter options
 */
export interface FilterOptions {
  search?: string;
  isActive?: boolean;
  startDate?: Date;
  endDate?: Date;
  [key: string]: any;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Repository with list/search capabilities
 */
export interface SearchableRepository<T> {
  /**
   * List with pagination and filters
   */
  list(options: {
    page: number;
    pageSize: number;
    filters?: FilterOptions;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
  }): Promise<PaginatedResult<T>>;

  /**
   * Search entities
   */
  search(query: string, options?: QueryOptions): Promise<T[]>;

  /**
   * Count entities matching filters
   */
  count(filters?: FilterOptions): Promise<number>;
}

/**
 * Repository with bulk operations
 */
export interface BulkOperationsRepository<T> {
  /**
   * Create multiple entities
   */
  bulkCreate(items: any[]): Promise<T[]>;

  /**
   * Update multiple entities
   */
  bulkUpdate(updates: Array<{ uuid: string; data: any }>): Promise<T[]>;

  /**
   * Delete multiple entities
   */
  bulkDelete(uuids: string[]): Promise<number>;
}

/**
 * Example of how a domain would implement these patterns:
 *
 * ```typescript
 * export class ProductsRepository implements
 *   DomainRepository<Product>,
 *   SoftDeletableRepository<Product>,
 *   SearchableRepository<Product>,
 *   AuditableRepository<Product> {
 *
 *   constructor(private db: Database) {}
 *
 *   async findByUuid(uuid: string): Promise<Product | null> {
 *     // Custom implementation with business logic
 *   }
 *
 *   // ... implement other methods
 * }
 * ```
 */
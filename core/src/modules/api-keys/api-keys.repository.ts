/**
 * API Keys Repository
 *
 * Generic repository for API key management with schema injection.
 * Apps inject their schema to use this repository.
 *
 * @module @yobolabs/core/api-keys
 */

import { eq, and, isNull, desc, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  ApiKeyRecord,
  ApiKeyCreateData,
  ApiKeyUpdateData,
  ApiKeyListItem,
} from './types';

/**
 * Schema interface for API keys table.
 * Apps provide their actual schema table that matches this interface.
 */
export interface ApiKeysTableSchema {
  id: PgColumn<any>;
  orgId: PgColumn<any>;
  name: PgColumn<any>;
  keyPrefix: PgColumn<any>;
  keyHash: PgColumn<any>;
  permissions: PgColumn<any>;
  rateLimit: PgColumn<any>;
  expiresAt: PgColumn<any>;
  lastUsedAt: PgColumn<any>;
  createdAt: PgColumn<any>;
  updatedAt: PgColumn<any>;
  revokedAt: PgColumn<any>;
  createdBy: PgColumn<any>;
}

/**
 * Configuration for creating an ApiKeysRepository
 */
export interface ApiKeysRepositoryConfig {
  /** The database client */
  db: PostgresJsDatabase<Record<string, unknown>>;
  /** The API keys table from the schema */
  apiKeysTable: PgTable & ApiKeysTableSchema;
}

/**
 * Creates an API Keys Repository with injected schema
 *
 * @example
 * import { createApiKeysRepository } from '@yobolabs/core/api-keys';
 * import { apiKeys } from '@/db/schema';
 *
 * const repo = createApiKeysRepository({
 *   db,
 *   apiKeysTable: apiKeys,
 * });
 */
export function createApiKeysRepository(
  config: ApiKeysRepositoryConfig
) {
  const { db, apiKeysTable } = config;
  const table = apiKeysTable as PgTable & ApiKeysTableSchema;

  return {
    /**
     * Create new API key
     */
    async create(data: ApiKeyCreateData): Promise<ApiKeyRecord> {
      const [apiKey] = await db
        .insert(table)
        .values({
          orgId: data.orgId,
          name: data.name,
          keyPrefix: data.keyPrefix,
          keyHash: data.keyHash,
          permissions: data.permissions,
          rateLimit: data.rateLimit,
          expiresAt: data.expiresAt,
          createdBy: data.createdBy,
        })
        .returning();

      return apiKey as unknown as ApiKeyRecord;
    },

    /**
     * List API keys for an organization
     */
    async listByOrgId(orgId: number, includeRevoked: boolean = false): Promise<ApiKeyListItem[]> {
      const conditions: SQL<unknown>[] = [eq(table.orgId, orgId)];

      if (!includeRevoked) {
        conditions.push(isNull(table.revokedAt));
      }

      const keys = await db
        .select({
          id: table.id,
          name: table.name,
          keyPrefix: table.keyPrefix,
          permissions: table.permissions,
          rateLimit: table.rateLimit,
          expiresAt: table.expiresAt,
          lastUsedAt: table.lastUsedAt,
          createdAt: table.createdAt,
          revokedAt: table.revokedAt,
        })
        .from(table)
        .where(and(...conditions))
        .orderBy(desc(table.createdAt));

      return keys as unknown as ApiKeyListItem[];
    },

    /**
     * Get API key by ID
     */
    async findById(id: number, orgId: number): Promise<ApiKeyListItem | null> {
      const [apiKey] = await db
        .select({
          id: table.id,
          name: table.name,
          keyPrefix: table.keyPrefix,
          permissions: table.permissions,
          rateLimit: table.rateLimit,
          expiresAt: table.expiresAt,
          lastUsedAt: table.lastUsedAt,
          createdAt: table.createdAt,
          revokedAt: table.revokedAt,
        })
        .from(table)
        .where(and(eq(table.id, id), eq(table.orgId, orgId)))
        .limit(1);

      return (apiKey as unknown as ApiKeyListItem) || null;
    },

    /**
     * Find API key by hash (for authentication)
     */
    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
      const [apiKey] = await db
        .select()
        .from(table)
        .where(and(eq(table.keyHash, keyHash), isNull(table.revokedAt)))
        .limit(1);

      return (apiKey as unknown as ApiKeyRecord) || null;
    },

    /**
     * Revoke API key
     */
    async revoke(id: number, orgId: number): Promise<boolean> {
      const [revokedKey] = await db
        .update(table)
        .set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(table.id, id),
          eq(table.orgId, orgId),
          isNull(table.revokedAt)
        ))
        .returning({ id: table.id });

      return !!revokedKey;
    },

    /**
     * Update API key
     */
    async update(id: number, orgId: number, data: ApiKeyUpdateData): Promise<ApiKeyListItem | null> {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.name !== undefined) updates.name = data.name;
      if (data.permissions !== undefined) updates.permissions = data.permissions;
      if (data.rateLimit !== undefined) updates.rateLimit = data.rateLimit;
      if (data.expiresAt !== undefined) updates.expiresAt = data.expiresAt;

      const [updatedKey] = await db
        .update(table)
        .set(updates)
        .where(and(
          eq(table.id, id),
          eq(table.orgId, orgId),
          isNull(table.revokedAt)
        ))
        .returning({
          id: table.id,
          name: table.name,
          keyPrefix: table.keyPrefix,
          permissions: table.permissions,
          rateLimit: table.rateLimit,
          expiresAt: table.expiresAt,
          lastUsedAt: table.lastUsedAt,
          createdAt: table.createdAt,
          revokedAt: table.revokedAt,
        });

      return (updatedKey as unknown as ApiKeyListItem) || null;
    },

    /**
     * Update last used timestamp
     */
    async updateLastUsed(id: number): Promise<void> {
      await db
        .update(table)
        .set({ lastUsedAt: new Date() })
        .where(eq(table.id, id));
    },
  };
}

/**
 * Type for the repository returned by createApiKeysRepository
 */
export type ApiKeysRepository = ReturnType<typeof createApiKeysRepository>;

// =============================================================================
// SDK REPOSITORY CLASS (for createRouterWithActor pattern)
// =============================================================================

// Dynamic import to avoid circular dependencies
let apiKeysTable: any = null;

/**
 * SDK API Keys Repository Class
 *
 * Class-based wrapper that conforms to the createRouterWithActor pattern.
 * Uses SDK's built-in apiKeys schema.
 *
 * @example
 * // In createRouterWithActor config:
 * repository: SDKApiKeysRepository
 */
export class SDKApiKeysRepository {
  private repo: ApiKeysRepository;

  constructor(db: PostgresJsDatabase<Record<string, unknown>>) {
    // Lazy load the schema to avoid circular dependency
    if (!apiKeysTable) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const schema = require('../../db/schema/api');
      apiKeysTable = schema.apiKeys;
    }

    this.repo = createApiKeysRepository({
      db,
      apiKeysTable,
    });
  }

  async create(data: ApiKeyCreateData): Promise<ApiKeyRecord> {
    return this.repo.create(data);
  }

  async listByOrgId(orgId: number, includeRevoked: boolean = false): Promise<ApiKeyListItem[]> {
    return this.repo.listByOrgId(orgId, includeRevoked);
  }

  async findById(id: number, orgId: number): Promise<ApiKeyListItem | null> {
    return this.repo.findById(id, orgId);
  }

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.repo.findByHash(keyHash);
  }

  async revoke(id: number, orgId: number): Promise<boolean> {
    return this.repo.revoke(id, orgId);
  }

  async update(id: number, orgId: number, data: ApiKeyUpdateData): Promise<ApiKeyListItem | null> {
    return this.repo.update(id, orgId, data);
  }

  async updateLastUsed(id: number): Promise<void> {
    return this.repo.updateLastUsed(id);
  }
}

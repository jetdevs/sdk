/**
 * System Config Repository
 *
 * Generic repository for system configuration management with schema injection.
 * Apps inject their schema to use this repository.
 *
 * @module @yobolabs/core/system-config
 */

import { eq, asc } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  SystemConfigRecord,
  SystemConfigCreateData,
  SystemConfigUpdateData,
} from './types';

/**
 * Schema interface for system config table.
 * Apps provide their actual schema table that matches this interface.
 */
export interface SystemConfigTableSchema {
  id: PgColumn<any>;
  configKey: PgColumn<any>;
  configValue: PgColumn<any>;
  valueType: PgColumn<any>;
  category: PgColumn<any>;
  description: PgColumn<any>;
  isSystem: PgColumn<any>;
  createdAt: PgColumn<any>;
  updatedAt: PgColumn<any>;
}

/**
 * Configuration for creating a SystemConfigRepository
 */
export interface SystemConfigRepositoryConfig {
  /** The database client */
  db: PostgresJsDatabase<Record<string, unknown>>;
  /** The system config table from the schema */
  systemConfigTable: PgTable & SystemConfigTableSchema;
}

/**
 * Creates a System Config Repository with injected schema
 *
 * @example
 * import { createSystemConfigRepository } from '@yobolabs/core/system-config';
 * import { systemConfig } from '@/db/schema';
 *
 * const repo = createSystemConfigRepository({
 *   db,
 *   systemConfigTable: systemConfig,
 * });
 */
export function createSystemConfigRepository(
  config: SystemConfigRepositoryConfig
) {
  const { db, systemConfigTable } = config;
  const table = systemConfigTable as PgTable & SystemConfigTableSchema;

  return {
    /**
     * Get all system configurations
     */
    async findAll(): Promise<SystemConfigRecord[]> {
      const configs = await db
        .select()
        .from(table)
        .orderBy(asc(table.category), asc(table.configKey));

      return configs as unknown as SystemConfigRecord[];
    },

    /**
     * Get configuration by key
     */
    async findByKey(key: string): Promise<SystemConfigRecord | null> {
      const [config] = await db
        .select()
        .from(table)
        .where(eq(table.configKey, key))
        .limit(1);

      return (config as unknown as SystemConfigRecord) || null;
    },

    /**
     * Get configurations by category
     */
    async findByCategory(category: string): Promise<SystemConfigRecord[]> {
      const configs = await db
        .select()
        .from(table)
        .where(eq(table.category, category))
        .orderBy(asc(table.configKey));

      return configs as unknown as SystemConfigRecord[];
    },

    /**
     * Create new configuration
     */
    async create(data: SystemConfigCreateData): Promise<SystemConfigRecord> {
      const [config] = await db
        .insert(table)
        .values({
          configKey: data.configKey,
          configValue: data.configValue,
          valueType: data.valueType || 'string',
          category: data.category || data.configKey.split('.')[0] || 'general',
          description: data.description,
          isSystem: data.isSystem ?? true,
        })
        .returning();

      return config as unknown as SystemConfigRecord;
    },

    /**
     * Update configuration
     */
    async update(key: string, data: SystemConfigUpdateData): Promise<SystemConfigRecord | null> {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.configValue !== undefined) updates.configValue = data.configValue;
      if (data.description !== undefined) updates.description = data.description;

      const [config] = await db
        .update(table)
        .set(updates)
        .where(eq(table.configKey, key))
        .returning();

      return (config as unknown as SystemConfigRecord) || null;
    },

    /**
     * Upsert configuration (create or update)
     */
    async upsert(data: SystemConfigCreateData): Promise<{ config: SystemConfigRecord; isNew: boolean }> {
      const existing = await this.findByKey(data.configKey);

      if (existing) {
        const updated = await this.update(data.configKey, {
          configValue: data.configValue,
          description: data.description || existing.description || undefined,
        });
        return { config: updated!, isNew: false };
      } else {
        const created = await this.create(data);
        return { config: created, isNew: true };
      }
    },

    /**
     * Delete configuration
     */
    async delete(key: string): Promise<boolean> {
      const result = await db
        .delete(table)
        .where(eq(table.configKey, key))
        .returning();

      return result.length > 0;
    },

    /**
     * Get configuration value (parsed based on value type)
     */
    async getValue<T = string>(key: string): Promise<T | null> {
      const config = await this.findByKey(key);
      if (!config || config.configValue === null) return null;

      switch (config.valueType) {
        case 'number':
          return parseFloat(config.configValue) as T;
        case 'boolean':
          return (config.configValue === 'true') as T;
        case 'json':
          return JSON.parse(config.configValue) as T;
        default:
          return config.configValue as T;
      }
    },

    /**
     * Set configuration value (with type inference)
     */
    async setValue<T>(key: string, value: T, options?: { description?: string; category?: string }): Promise<SystemConfigRecord> {
      let valueType: string;
      let configValue: string;

      if (typeof value === 'number') {
        valueType = 'number';
        configValue = String(value);
      } else if (typeof value === 'boolean') {
        valueType = 'boolean';
        configValue = String(value);
      } else if (typeof value === 'object') {
        valueType = 'json';
        configValue = JSON.stringify(value);
      } else {
        valueType = 'string';
        configValue = String(value);
      }

      const { config } = await this.upsert({
        configKey: key,
        configValue,
        valueType,
        category: options?.category,
        description: options?.description,
      });

      return config;
    },
  };
}

/**
 * Type for the repository returned by createSystemConfigRepository
 */
export type SystemConfigRepository = ReturnType<typeof createSystemConfigRepository>;

// =============================================================================
// CACHING REPOSITORY WRAPPER
// =============================================================================

/**
 * Audit log parameters interface
 */
export interface AuditLogParams {
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Dependencies for the caching system config repository
 */
export interface CachingSystemConfigRepositoryDeps {
  /**
   * Caching function wrapper
   * @param key Cache key parts (e.g., ['system-config', 'key', keyValue])
   * @param fn Function to execute if cache miss
   * @param options Cache options
   */
  withCache?: <T>(
    key: string[],
    fn: () => Promise<T>,
    options?: { ttl?: number; tags?: string[] }
  ) => Promise<T>;

  /**
   * Telemetry function wrapper
   * @param name Operation name for tracing
   * @param fn Function to execute and trace
   */
  withTelemetry?: <T>(name: string, fn: () => Promise<T>) => Promise<T>;

  /**
   * Audit logging function
   * @param params Audit log parameters
   */
  auditLog?: (params: AuditLogParams) => Promise<void>;

  /**
   * Cache TTL in seconds
   * @default 300
   */
  cacheTtl?: number;

  /**
   * Cache tags for invalidation
   * @default ['system-config']
   */
  cacheTags?: string[];
}

/**
 * Creates a System Config Repository with caching, telemetry, and audit logging built-in.
 *
 * This factory wraps the core repository with cross-cutting concerns:
 * - Caching (via withCache)
 * - Telemetry (via withTelemetry)
 * - Audit logging (via auditLog)
 *
 * @example
 * import {
 *   createCachingSystemConfigRepository,
 *   type CachingSystemConfigRepositoryDeps
 * } from '@yobolabs/core/system-config';
 * import { withCache, withTelemetry, auditLog } from '@yobolabs/framework';
 * import { systemConfig } from '@/db/schema';
 *
 * const deps: CachingSystemConfigRepositoryDeps = {
 *   withCache,
 *   withTelemetry,
 *   auditLog,
 * };
 *
 * const repo = createCachingSystemConfigRepository(
 *   { db, systemConfigTable: systemConfig },
 *   deps
 * );
 */
export function createCachingSystemConfigRepository(
  config: SystemConfigRepositoryConfig,
  deps: CachingSystemConfigRepositoryDeps = {}
) {
  const {
    withCache,
    withTelemetry,
    auditLog,
    cacheTtl = 300,
    cacheTags = ['system-config'],
  } = deps;

  const coreRepo = createSystemConfigRepository(config);

  // Identity function if no wrapper provided
  const wrapTelemetry = withTelemetry || (<T>(name: string, fn: () => Promise<T>) => fn());
  const wrapCache = withCache || (<T>(_key: string[], fn: () => Promise<T>) => fn());

  return {
    /**
     * Get all system configurations (with caching)
     */
    async findAll(): Promise<SystemConfigRecord[]> {
      return wrapTelemetry('system-config.findAll', async () => {
        return wrapCache(
          ['system-config', 'all'],
          async () => coreRepo.findAll(),
          { ttl: cacheTtl, tags: cacheTags }
        );
      });
    },

    /**
     * Get configuration by key (with caching)
     */
    async findByKey(key: string): Promise<SystemConfigRecord | null> {
      return wrapCache(
        ['system-config', 'key', key],
        async () => coreRepo.findByKey(key),
        { ttl: cacheTtl, tags: cacheTags }
      );
    },

    /**
     * Get configurations by category (with caching)
     */
    async findByCategory(category: string): Promise<SystemConfigRecord[]> {
      return wrapCache(
        ['system-config', 'category', category],
        async () => coreRepo.findByCategory(category),
        { ttl: cacheTtl, tags: cacheTags }
      );
    },

    /**
     * Create new configuration (with telemetry and audit logging)
     */
    async create(data: SystemConfigCreateData, userId?: string): Promise<SystemConfigRecord> {
      return wrapTelemetry('system-config.create', async () => {
        const config = await coreRepo.create(data);

        if (auditLog) {
          await auditLog({
            action: 'create',
            entityType: 'system_config',
            entityId: data.configKey,
            userId,
            metadata: { category: config.category },
          });
        }

        return config;
      });
    },

    /**
     * Update configuration (with telemetry and audit logging)
     */
    async update(key: string, data: SystemConfigUpdateData, userId?: string): Promise<SystemConfigRecord | null> {
      return wrapTelemetry('system-config.update', async () => {
        const config = await coreRepo.update(key, data);

        if (config && auditLog) {
          await auditLog({
            action: 'update',
            entityType: 'system_config',
            entityId: key,
            userId,
            metadata: { changes: Object.keys(data) },
          });
        }

        return config;
      });
    },

    /**
     * Upsert configuration (with telemetry and audit logging)
     */
    async upsert(data: SystemConfigCreateData, userId?: string): Promise<{ config: SystemConfigRecord; isNew: boolean }> {
      return wrapTelemetry('system-config.upsert', async () => {
        const existing = await this.findByKey(data.configKey);

        if (existing) {
          const updated = await this.update(data.configKey, {
            configValue: data.configValue,
            description: data.description || existing.description || undefined,
          }, userId);
          return { config: updated!, isNew: false };
        } else {
          const created = await this.create(data, userId);
          return { config: created, isNew: true };
        }
      });
    },

    /**
     * Delete configuration (with telemetry and audit logging)
     */
    async delete(key: string, userId?: string): Promise<boolean> {
      return wrapTelemetry('system-config.delete', async () => {
        const deleted = await coreRepo.delete(key);

        if (deleted && auditLog) {
          await auditLog({
            action: 'delete',
            entityType: 'system_config',
            entityId: key,
            userId,
          });
        }

        return deleted;
      });
    },

    /**
     * Get configuration value (parsed based on value type)
     */
    async getValue<T = string>(key: string): Promise<T | null> {
      return coreRepo.getValue<T>(key);
    },

    /**
     * Set configuration value (with type inference)
     */
    async setValue<T>(key: string, value: T, options?: { description?: string; category?: string }): Promise<SystemConfigRecord> {
      return coreRepo.setValue(key, value, options);
    },
  };
}

/**
 * Type for the caching repository
 */
export type CachingSystemConfigRepository = ReturnType<typeof createCachingSystemConfigRepository>;

// =============================================================================
// SDK PRE-BUILT REPOSITORY CLASS
// =============================================================================

/**
 * SDK System Config Repository Class
 *
 * A class wrapper that can be used with createRouterWithActor's repository pattern.
 * Uses the SDK's systemConfig schema from @yobolabs/core/db/schema.
 *
 * Includes caching, telemetry, and audit logging when framework dependencies are available.
 *
 * @example
 * // Zero-config usage in root.ts
 * import { SDKSystemConfigRepository } from '@yobolabs/core/system-config';
 * import { systemConfigRouterConfig } from '@yobolabs/core/system-config';
 *
 * const systemConfigRouterConfigWithRepo = Object.fromEntries(
 *   Object.entries(systemConfigRouterConfig).map(([key, route]) => [
 *     key,
 *     { ...route, repository: SDKSystemConfigRepository },
 *   ])
 * );
 * const systemConfigRouter = createRouterWithActor(systemConfigRouterConfigWithRepo);
 */
export class SDKSystemConfigRepository {
  private repo: CachingSystemConfigRepository;

  constructor(db: PostgresJsDatabase<Record<string, unknown>>) {
    // Lazy import SDK schema to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { systemConfig } = require('../../db/schema') as { systemConfig: PgTable & SystemConfigTableSchema };

    // Try to import framework dependencies for caching/telemetry/audit
    let deps: CachingSystemConfigRepositoryDeps = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const framework = require('@yobolabs/framework');
      deps = {
        withCache: framework.withCache,
        withTelemetry: framework.withTelemetry,
        auditLog: framework.auditLog,
      };
    } catch {
      // Framework not available, run without caching/telemetry/audit
    }

    this.repo = createCachingSystemConfigRepository(
      { db, systemConfigTable: systemConfig },
      deps
    );
  }

  async findAll(): Promise<SystemConfigRecord[]> {
    return this.repo.findAll();
  }

  async findByKey(key: string): Promise<SystemConfigRecord | null> {
    return this.repo.findByKey(key);
  }

  async findByCategory(category: string): Promise<SystemConfigRecord[]> {
    return this.repo.findByCategory(category);
  }

  async create(data: SystemConfigCreateData, userId?: string): Promise<SystemConfigRecord> {
    return this.repo.create(data, userId);
  }

  async update(key: string, data: SystemConfigUpdateData, userId?: string): Promise<SystemConfigRecord | null> {
    return this.repo.update(key, data, userId);
  }

  async upsert(data: SystemConfigCreateData, userId?: string): Promise<{ config: SystemConfigRecord; isNew: boolean }> {
    return this.repo.upsert(data, userId);
  }

  async delete(key: string, userId?: string): Promise<boolean> {
    return this.repo.delete(key, userId);
  }

  async getValue<T = string>(key: string): Promise<T | null> {
    return this.repo.getValue<T>(key);
  }

  async setValue<T>(key: string, value: T, options?: { description?: string; category?: string }): Promise<SystemConfigRecord> {
    return this.repo.setValue(key, value, options);
  }
}

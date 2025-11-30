/**
 * System Config Router Configuration Factory
 *
 * Creates router configuration for system configuration management.
 * Apps use this with createRouterWithActor from @yobolabs/framework.
 *
 * @module @yobolabs/core/system-config
 */

import type { SystemConfigRepository } from './system-config.repository';
import {
  updateConfigSchema,
  getByKeySchema,
  getByCategorySchema,
} from './schemas';

/**
 * Service context interface expected by router handlers
 */
export interface SystemConfigServiceContext {
  userId: string;
}

/**
 * Configuration for creating System Config router config
 */
export interface CreateSystemConfigRouterConfigOptions {
  /**
   * Permission required to update configurations
   * @default 'admin:manage'
   */
  updatePermission?: string;

  /**
   * Cache TTL in seconds
   * @default 300
   */
  cacheTtl?: number;

  /**
   * Cache invalidation tags
   * @default ['system-config']
   */
  cacheTags?: string[];
}

/**
 * Creates router configuration for system configuration management.
 *
 * Use this with createRouterWithActor from @yobolabs/framework.
 *
 * @example
 * import { createSystemConfigRouterConfig } from '@yobolabs/core/system-config';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * export const systemConfigRouter = createRouterWithActor({
 *   ...createSystemConfigRouterConfig({
 *     updatePermission: 'admin:manage',
 *   }),
 * });
 */
export function createSystemConfigRouterConfig(
  options: CreateSystemConfigRouterConfigOptions = {}
) {
  const {
    updatePermission = 'admin:manage',
    cacheTtl = 300,
    cacheTags = ['system-config'],
  } = options;

  return {
    /**
     * Get all configurations
     */
    getAll: {
      type: 'query' as const,
      cache: { ttl: cacheTtl, tags: cacheTags },
      handler: async ({
        repo,
      }: {
        repo: SystemConfigRepository;
      }) => {
        return repo.findAll();
      },
    },

    /**
     * Get configuration by key
     */
    getByKey: {
      type: 'query' as const,
      input: getByKeySchema,
      cache: { ttl: cacheTtl, tags: cacheTags },
      handler: async ({
        input,
        repo,
      }: {
        input: { key: string };
        repo: SystemConfigRepository;
      }) => {
        return repo.findByKey(input.key);
      },
    },

    /**
     * Get configurations by category
     */
    getByCategory: {
      type: 'query' as const,
      input: getByCategorySchema,
      cache: { ttl: cacheTtl, tags: cacheTags },
      handler: async ({
        input,
        repo,
      }: {
        input: { category: string };
        repo: SystemConfigRepository;
      }) => {
        return repo.findByCategory(input.category);
      },
    },

    /**
     * Update configuration (admin only)
     */
    update: {
      permission: updatePermission,
      input: updateConfigSchema,
      invalidates: cacheTags,
      entityType: 'system_config',
      handler: async ({
        input,
        repo,
      }: {
        input: { key: string; value: string; description?: string };
        service: SystemConfigServiceContext;
        repo: SystemConfigRepository;
      }) => {
        const result = await repo.upsert({
          configKey: input.key,
          configValue: input.value,
          description: input.description,
        });

        return result.config;
      },
    },

    /**
     * Get AI prompt configurations
     */
    getPromptConfigs: {
      type: 'query' as const,
      cache: { ttl: cacheTtl, tags: cacheTags },
      handler: async ({
        repo,
      }: {
        repo: SystemConfigRepository;
      }) => {
        return repo.findByCategory('ai_prompts');
      },
    },

    /**
     * Get LLM provider configurations
     */
    getProviderConfigs: {
      type: 'query' as const,
      cache: { ttl: cacheTtl, tags: cacheTags },
      handler: async ({
        repo,
      }: {
        repo: SystemConfigRepository;
      }) => {
        return repo.findByCategory('llm_providers');
      },
    },
  };
}

/**
 * Default export - router config with default options
 */
export const systemConfigRouterConfig = createSystemConfigRouterConfig();

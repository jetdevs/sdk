/**
 * API Keys Router Configuration Factory
 *
 * Creates router configuration for API key management.
 * Apps use this with createRouterWithActor from @yobolabs/framework.
 *
 * @module @yobolabs/core/api-keys
 */

import { TRPCError } from '@trpc/server';
import { SDKApiKeysRepository, type ApiKeysRepository } from './api-keys.repository';
import { generateApiKey } from './key-generation';
import {
  createApiKeySchema,
  listApiKeysSchema,
  getApiKeySchema,
  revokeApiKeySchema,
  updateApiKeySchema,
} from './schemas';
import type { ApiKeyEnvironment } from './types';

/**
 * Service context interface expected by router handlers
 */
export interface ApiKeysServiceContext {
  orgId: number | null;
  userId: string;
}

/**
 * Handler context with optional repo (made required via assertion)
 */
interface HandlerContext<TInput = any> {
  input: TInput;
  service: ApiKeysServiceContext;
  repo?: ApiKeysRepository;
}

/**
 * Configuration for creating API Keys router config
 */
export interface CreateApiKeysRouterConfigOptions {
  /**
   * Permission required to manage API keys
   * @default 'admin:manage'
   */
  permission?: string;

  /**
   * Prefix for generated API keys
   * @default 'yobo'
   */
  keyPrefix?: string;

  /**
   * Cache invalidation tags
   * @default ['api-keys']
   */
  invalidationTags?: string[];

  /**
   * Repository class to use
   * @default SDKApiKeysRepository
   */
  Repository?: new (db: any) => ApiKeysRepository;
}

/**
 * Creates router configuration for API keys management.
 *
 * Use this with createRouterWithActor from @yobolabs/framework.
 *
 * @example
 * // Zero-config usage with SDK repository
 * import { apiKeysRouterConfig } from '@yobolabs/core/api-keys';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * export const apiKeysRouter = createRouterWithActor(apiKeysRouterConfig);
 *
 * @example
 * // Custom configuration
 * import { createApiKeysRouterConfig } from '@yobolabs/core/api-keys';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 * import { MyApiKeysRepository } from './my-repository';
 *
 * export const apiKeysRouter = createRouterWithActor(
 *   createApiKeysRouterConfig({
 *     permission: 'admin:manage',
 *     keyPrefix: 'myapp',
 *     Repository: MyApiKeysRepository,
 *   })
 * );
 */
export function createApiKeysRouterConfig(
  options: CreateApiKeysRouterConfigOptions = {}
) {
  const {
    permission = 'admin:manage',
    keyPrefix = 'yobo',
    invalidationTags = ['api-keys'],
    Repository = SDKApiKeysRepository,
  } = options;

  return {
    /**
     * Create a new API key
     */
    create: {
      permission,
      input: createApiKeySchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{
        name: string;
        permissions: string[];
        rateLimit?: number;
        expiresAt?: Date;
        environment: ApiKeyEnvironment;
      }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        // Repository is guaranteed by the repository config
        const repository = repo!;

        // Generate API key
        const { key, keyPrefix: generatedPrefix, keyHash } = generateApiKey(
          input.environment,
          keyPrefix
        );

        // Create the API key record
        const apiKey = await repository.create({
          orgId: service.orgId,
          name: input.name,
          keyPrefix: generatedPrefix,
          keyHash,
          permissions: input.permissions,
          rateLimit: input.rateLimit ?? 1000,
          expiresAt: input.expiresAt,
          createdBy: parseInt(service.userId),
        });

        // Return the full key ONLY on creation (never stored, never returned again)
        return {
          ...apiKey,
          key, // Full key shown only once
        };
      },
    },

    /**
     * List API keys for the organization
     */
    list: {
      type: 'query' as const,
      permission,
      input: listApiKeysSchema,
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{ includeRevoked: boolean }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        return repository.listByOrgId(service.orgId, input.includeRevoked);
      },
    },

    /**
     * Get API key by ID
     */
    getById: {
      type: 'query' as const,
      permission,
      input: getApiKeySchema,
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{ id: number }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        const apiKey = await repository.findById(input.id, service.orgId);

        if (!apiKey) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found',
          });
        }

        return apiKey;
      },
    },

    /**
     * Revoke API key
     */
    revoke: {
      permission,
      input: revokeApiKeySchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{ id: number }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        const revoked = await repository.revoke(input.id, service.orgId);

        if (!revoked) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          });
        }

        return { success: true };
      },
    },

    /**
     * Update API key
     */
    update: {
      permission,
      input: updateApiKeySchema,
      invalidates: invalidationTags,
      entityType: 'api_key',
      repository: Repository,
      handler: async ({
        input,
        service,
        repo,
      }: HandlerContext<{
        id: number;
        name?: string;
        permissions?: string[];
        rateLimit?: number;
        expiresAt?: Date | null;
      }>) => {
        if (!service.orgId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No active organization found',
          });
        }

        const repository = repo!;
        const { id, ...updateData } = input;
        const updatedKey = await repository.update(id, service.orgId, updateData);

        if (!updatedKey) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          });
        }

        return updatedKey;
      },
    },
  };
}

/**
 * Pre-built router config with SDK defaults
 *
 * Zero-configuration usage:
 * ```typescript
 * import { apiKeysRouterConfig } from '@yobolabs/core/api-keys';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * export const apiKeysRouter = createRouterWithActor(apiKeysRouterConfig);
 * ```
 */
export const apiKeysRouterConfig = createApiKeysRouterConfig();

/**
 * API Keys Module
 *
 * Provides API key management for external integrations.
 * Includes key generation, storage, validation, and router configuration.
 *
 * @module @yobolabs/core/api-keys
 *
 * @example
 * // Create repository
 * import { createApiKeysRepository } from '@yobolabs/core/api-keys';
 * import { apiKeys } from '@/db/schema';
 *
 * const repo = createApiKeysRepository({ db, apiKeysTable: apiKeys });
 *
 * @example
 * // Use router config
 * import { createApiKeysRouterConfig } from '@yobolabs/core/api-keys';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
 *
 * const apiKeysRouter = createRouterWithActor({
 *   ...createApiKeysRouterConfig({ keyPrefix: 'myapp' }),
 * });
 */

// Types
export * from './types';

// Validation schemas
export * from './schemas';

// Key generation utilities
export {
  generateApiKey,
  hashApiKey,
  validateApiKeyFormat,
  validateApiKeyChecksum,
  extractKeyEnvironment,
  DEFAULT_KEY_PREFIX,
} from './key-generation';

// Repository
export {
  createApiKeysRepository,
  SDKApiKeysRepository,
  type ApiKeysRepository,
  type ApiKeysTableSchema,
  type ApiKeysRepositoryConfig,
} from './api-keys.repository';

// Router configuration
export {
  createApiKeysRouterConfig,
  apiKeysRouterConfig,
  type CreateApiKeysRouterConfigOptions,
  type ApiKeysServiceContext,
} from './api-keys.router-config';

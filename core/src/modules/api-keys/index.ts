/**
 * API Keys Module
 *
 * Provides API key management for external integrations.
 * Includes key generation, storage, validation, and router configuration.
 *
 * @module @jetdevs/core/api-keys
 *
 * @example
 * // Create repository
 * import { createApiKeysRepository } from '@jetdevs/core/api-keys';
 * import { apiKeys } from '@/db/schema';
 *
 * const repo = createApiKeysRepository({ db, apiKeysTable: apiKeys });
 *
 * @example
 * // Use router config
 * import { createApiKeysRouterConfig } from '@jetdevs/core/api-keys';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
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
    DEFAULT_KEY_PREFIX, extractKeyEnvironment, generateApiKey,
    hashApiKey, validateApiKeyChecksum, validateApiKeyFormat
} from './key-generation';

// Repository
export {
    SDKApiKeysRepository, createApiKeysRepository, type ApiKeysRepository, type ApiKeysRepositoryConfig, type ApiKeysTableSchema
} from './api-keys.repository';

// Router configuration
export {
    apiKeysRouterConfig, createApiKeysRouterConfig, type ApiKeysServiceContext, type CreateApiKeysRouterConfigOptions
} from './api-keys.router-config';


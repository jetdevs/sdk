/**
 * System Config Module
 *
 * Provides system configuration management for application-wide settings.
 * Includes typed value storage, categorization, and router configuration.
 *
 * @module @jetdevs/core/system-config
 *
 * @example
 * // Create repository
 * import { createSystemConfigRepository } from '@jetdevs/core/system-config';
 * import { systemConfig } from '@/db/schema';
 *
 * const repo = createSystemConfigRepository({
 *   db,
 *   systemConfigTable: systemConfig,
 * });
 *
 * @example
 * // Use router config
 * import { createSystemConfigRouterConfig } from '@jetdevs/core/system-config';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 *
 * const systemConfigRouter = createRouterWithActor({
 *   ...createSystemConfigRouterConfig(),
 * });
 */

// Types
export * from './types';

// Validation schemas
export * from './schemas';

// Repository
export {
    SDKSystemConfigRepository, createCachingSystemConfigRepository, createSystemConfigRepository, type AuditLogParams, type CachingSystemConfigRepository, type CachingSystemConfigRepositoryDeps, type SystemConfigRepository, type SystemConfigRepositoryConfig, type SystemConfigTableSchema
} from './system-config.repository';

// Router configuration
export {
    createSystemConfigRouterConfig,
    systemConfigRouterConfig,
    type CreateSystemConfigRouterConfigOptions,
    type SystemConfigServiceContext
} from './system-config.router-config';


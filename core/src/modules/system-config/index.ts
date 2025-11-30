/**
 * System Config Module
 *
 * Provides system configuration management for application-wide settings.
 * Includes typed value storage, categorization, and router configuration.
 *
 * @module @yobolabs/core/system-config
 *
 * @example
 * // Create repository
 * import { createSystemConfigRepository } from '@yobolabs/core/system-config';
 * import { systemConfig } from '@/db/schema';
 *
 * const repo = createSystemConfigRepository({
 *   db,
 *   systemConfigTable: systemConfig,
 * });
 *
 * @example
 * // Use router config
 * import { createSystemConfigRouterConfig } from '@yobolabs/core/system-config';
 * import { createRouterWithActor } from '@yobolabs/framework/router';
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
  createSystemConfigRepository,
  createCachingSystemConfigRepository,
  SDKSystemConfigRepository,
  type SystemConfigRepository,
  type CachingSystemConfigRepository,
  type SystemConfigTableSchema,
  type SystemConfigRepositoryConfig,
  type CachingSystemConfigRepositoryDeps,
  type AuditLogParams,
} from './system-config.repository';

// Router configuration
export {
  createSystemConfigRouterConfig,
  systemConfigRouterConfig,
  type CreateSystemConfigRouterConfigOptions,
  type SystemConfigServiceContext,
} from './system-config.router-config';

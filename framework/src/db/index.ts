/**
 * Database Module - Public API
 *
 * Provides type-safe database access with automatic RLS enforcement
 *
 * @example
 * ```typescript
 * import { createRepository } from '@yobo/framework/db';
 *
 * const campaignRepo = createRepository('campaigns', {
 *   orgScoped: true
 * }, ctx.db);
 *
 * const campaigns = await campaignRepo.findMany();
 * ```
 */

export { createRepository } from './repository';
export { withRLSContext } from './context';
export {
  configureDatabaseContext,
  type DatabaseConfig,
  type DatabaseProvider,
  type OrgContextExtractor,
  type RLSContextSetter,
} from './configure';
export type { Repository, RepositoryOptions, BaseFilters } from './types';

// RLS context management (NEW)
export {
  getDbContext,
  createServiceContextWithDb,
} from './rls-context';
export type {
  DbContext,
  SqlTemplate,
} from './rls-context';

// Internal implementation details remain hidden

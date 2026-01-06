/**
 * Database Module - Public API
 *
 * Provides type-safe database access with automatic RLS enforcement
 *
 * @example
 * ```typescript
 * import { createRepository } from '@jetdevs/framework/db';
 *
 * const campaignRepo = createRepository('campaigns', {
 *   orgScoped: true
 * }, ctx.db);
 *
 * const campaigns = await campaignRepo.findMany();
 * ```
 */

export {
    configureDatabaseContext,
    type DatabaseConfig,
    type DatabaseProvider,
    type OrgContextExtractor,
    type RLSContextSetter
} from './configure';
export { withRLSContext } from './context';
export { createRepository } from './repository';
export type { BaseFilters, Repository, RepositoryOptions } from './types';

// RLS context management (NEW)
export {
    createServiceContextWithDb, getDbContext
} from './rls-context';
export type {
    DbContext,
    SqlTemplate
} from './rls-context';

// Internal implementation details remain hidden

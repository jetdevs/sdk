/**
 * p77 trigger SQL templates (STORY-002, specs.md §3.3 M2/M3/M6, §5.1): one
 * reviewed text for every relying party's migrations. Re-exported from
 * `@jetdevs/core/auth`.
 */
export {
  AUTHORITY_ROLLBACK_ERROR_PREFIX,
  AUTHORITY_TRANSITION_ERROR_PREFIX,
  WRITERS_CLOSED_ERROR_PREFIX,
  writersClosedTriggerSql,
} from './writers-closed';
export type { WritersClosedOptions } from './writers-closed';

export {
  ONE_ALLOCATOR_ERROR_PREFIX,
  ONE_ALLOCATOR_GUC,
  oneAllocatorGucSql,
  oneAllocatorTriggerSql,
} from './one-allocator';

export { credentialVersionBumpTriggerSql } from './credential-version-bump';

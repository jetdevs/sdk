/**
 * Org Membership Module
 *
 * Provides org membership management including:
 * - Type definitions for membership records and lifecycle
 * - Zod validation schemas for API input
 * - Repository factory for database operations
 * - Service factory for business logic
 * - Router configuration factory for tRPC integration
 *
 * @module @jetdevs/core/org-membership
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  OrgMemberStatus,
  OrgMemberRecord,
  OrgMemberWithUser,
  InviteInput,
  InviteByEmailInput,
  OrgMemberListOptions,
  OrgMemberListResult,
  OrgMembershipHooks,
} from './types';

// =============================================================================
// SCHEMAS
// =============================================================================

export {
  orgMemberStatusSchema,
  orgMemberListSchema,
  inviteByEmailSchema,
  inviteExistingUserSchema,
  acceptSchema,
  suspendSchema,
  unsuspendSchema,
  removeSchema,
  reinviteSchema,
} from './schemas';

export type {
  OrgMemberListInput,
  InviteByEmailInput as InviteByEmailSchemaInput,
  InviteExistingUserInput,
  AcceptInput,
  SuspendInput,
  UnsuspendInput,
  RemoveInput,
  ReinviteInput,
} from './schemas';

// =============================================================================
// REPOSITORY
// =============================================================================

export {
  createOrgMemberRepositoryClass,
} from './repository';

export type {
  OrgMemberRepositorySchema,
  IOrgMemberRepository,
} from './repository';

// =============================================================================
// SERVICE
// =============================================================================

export {
  createOrgMembershipService,
  OrgMembershipServiceError,
} from './service';

export type {
  OrgMembershipServiceDeps,
} from './service';

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export {
  createOrgMembershipRouterConfig,
} from './router-config';

export type {
  OrgMembershipRouterDeps,
} from './router-config';

// =============================================================================
// SDK PRE-BUILT REPOSITORY
// =============================================================================

import { orgMembers } from '../../db/schema/org-members';
import { users } from '../../db/schema/orgs';
import { roles } from '../../db/schema/rbac';
import { createOrgMemberRepositoryClass } from './repository';

/**
 * SDK OrgMember Repository
 *
 * Pre-built repository configured with SDK's own schema tables.
 */
export const SDKOrgMemberRepository = createOrgMemberRepositoryClass({
  orgMembers,
  users,
  roles,
});

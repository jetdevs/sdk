/**
 * Organization Membership Module
 *
 * Provides org membership lifecycle management including:
 * - Type definitions for members and status transitions
 * - Zod validation schemas for API input
 * - Repository factory for database operations
 * - Router configuration factory for tRPC integration
 *
 * @module @jetdevs/core/org-membership
 */

// =============================================================================
// SCHEMA RE-EXPORTS (from core db/schema)
// =============================================================================

export {
  orgMemberStatusEnum,
  orgMembers,
  orgMembersRelations,
  type OrgMember,
  type NewOrgMember,
} from '../../db/schema/org-members';

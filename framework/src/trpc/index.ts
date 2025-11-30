/**
 * tRPC Procedure Factories Module
 *
 * Provides factory functions to create tRPC procedures with built-in security:
 * - createProtectedProcedure: Authentication required
 * - createAdminOnlyProcedure: Platform admin access only
 * - createWithPermission: Specific permission required
 * - createOrgProtectedProcedure: Authentication + org context + RLS
 * - createOrgProtectedProcedureWithPermission: Full org + permission protection
 *
 * @module @yobolabs/framework/trpc
 *
 * @example
 * ```typescript
 * import {
 *   createProtectedProcedure,
 *   createAdminOnlyProcedure,
 *   createWithPermission,
 *   createOrgProtectedProcedure,
 *   createOrgProtectedProcedureWithPermission,
 * } from '@yobolabs/framework/trpc';
 *
 * // Create procedures with your tRPC instance
 * const protectedProcedure = createProtectedProcedure(t);
 * const adminOnlyProcedure = createAdminOnlyProcedure(t, {
 *   getPrivilegedDb: async () => privilegedDb,
 * });
 * ```
 */

// Procedure factories (NEW - main API)
export {
  createProtectedProcedure,
  createAdminOnlyProcedure,
  createWithPermission,
  createOrgProtectedProcedure,
  createOrgProtectedProcedureWithPermission,
} from './procedures';

// Middleware factories
export {
  createAuthMiddleware,
  createOrgContextMiddleware,
  createAdminOnlyMiddleware,
  createPermissionMiddleware,
} from './procedures';

// Legacy exports (for backward compatibility)
export {
  authMiddleware,
  orgContextMiddleware,
  adminOnlyMiddleware,
  permissionMiddleware,
  createTRPCProcedures,
  createTRPCRouter,
} from './procedures';

// Types
export type {
  TRPCContext,
  AuthenticatedContext,
  AdminOnlyProcedureOptions,
  WithPermissionOptions,
  OrgProtectedProcedureOptions,
  OrgProtectedContext,
  PublicProcedure,
  ProtectedProcedure,
  OrgProtectedProcedure,
  AdminOnlyProcedure,
} from './procedures';

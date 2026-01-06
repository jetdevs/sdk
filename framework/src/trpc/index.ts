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
 * @module @jetdevs/framework/trpc
 *
 * @example
 * ```typescript
 * import {
 *   createProtectedProcedure,
 *   createAdminOnlyProcedure,
 *   createWithPermission,
 *   createOrgProtectedProcedure,
 *   createOrgProtectedProcedureWithPermission,
 * } from '@jetdevs/framework/trpc';
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
    createAdminOnlyProcedure, createOrgProtectedProcedure,
    createOrgProtectedProcedureWithPermission, createProtectedProcedure, createWithPermission
} from './procedures';

// Middleware factories
export {
    createAdminOnlyMiddleware, createAuthMiddleware,
    createOrgContextMiddleware, createPermissionMiddleware
} from './procedures';

// Legacy exports (for backward compatibility)
export {
    adminOnlyMiddleware, authMiddleware, createTRPCProcedures,
    createTRPCRouter, orgContextMiddleware, permissionMiddleware
} from './procedures';

// Types
export type {
    AdminOnlyProcedure, AdminOnlyProcedureOptions, AuthenticatedContext, OrgProtectedContext, OrgProtectedProcedure, OrgProtectedProcedureOptions, ProtectedProcedure, PublicProcedure, TRPCContext, WithPermissionOptions
} from './procedures';


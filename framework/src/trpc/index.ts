/**
 * tRPC module exports
 *
 * @module @yobo/framework/trpc
 */

export {
  // Procedures factory
  createTRPCProcedures,
  createTRPCRouter,

  // Middleware
  authMiddleware,
  orgContextMiddleware,
  adminOnlyMiddleware,
  permissionMiddleware,

  // Types
  type TRPCContext,
  type AuthenticatedContext,
  type PublicProcedure,
  type ProtectedProcedure,
  type OrgProtectedProcedure,
  type AdminOnlyProcedure,
} from './procedures';
/**
 * tRPC Security Procedures for SaaS Applications
 *
 * Provides standard security layers for tRPC routers:
 * - publicProcedure: No authentication required
 * - protectedProcedure: Authentication required
 * - orgProtectedProcedure: Authentication + org context required
 * - adminOnlyProcedure: Platform admin access only
 *
 * @module @yobo/framework/trpc/procedures
 */

import { TRPCError, initTRPC } from '@trpc/server';
import type { Actor } from '../auth/actor';
import { createActor, hasPermission, validateOrgContext, AuthError } from '../auth/actor';

/**
 * Context type required for procedures
 * Applications must provide this context shape
 */
export interface TRPCContext {
  session: any | null;
  db: any;
  dbWithRLS?: (callback: (db: any) => Promise<any>) => Promise<any>;
  withPrivilegedDb?: (callback: (db: any) => Promise<any>) => Promise<any>;
  [key: string]: any;
}

/**
 * Context with authenticated actor
 */
export interface AuthenticatedContext extends TRPCContext {
  actor: Actor;
}

/**
 * Middleware to ensure user is authenticated
 */
export function authMiddleware(t: any) {
  return t.middleware(async ({ ctx, next }: any) => {
    try {
      const actor = createActor(ctx);
      return next({
        ctx: {
          ...ctx,
          actor,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        throw new TRPCError({
          code: error.code as any,
          message: error.message,
        });
      }
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }
  });
}

/**
 * Middleware to ensure user has organization context
 */
export function orgContextMiddleware(t: any) {
  return t.middleware(async ({ ctx, next }: any) => {
    try {
      const actor = createActor(ctx);
      validateOrgContext(actor, false);

      return next({
        ctx: {
          ...ctx,
          actor,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        throw new TRPCError({
          code: error.code as any,
          message: error.message,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization context required',
      });
    }
  });
}

/**
 * Middleware to ensure user is a platform admin
 */
export function adminOnlyMiddleware(t: any) {
  return t.middleware(async ({ ctx, next }: any) => {
    try {
      const actor = createActor(ctx);

      // Check for admin permissions
      if (!actor.isSuperUser && !hasPermission(actor, 'admin:full_access')) {
        throw new AuthError('FORBIDDEN', 'Admin access required');
      }

      return next({
        ctx: {
          ...ctx,
          actor,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        throw new TRPCError({
          code: error.code as any,
          message: error.message,
        });
      }
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }
  });
}

/**
 * Create a permission-checking middleware
 */
export function permissionMiddleware(permission: string, t: any) {
  return t.middleware(async ({ ctx, next }: any) => {
    try {
      const actor = createActor(ctx);

      if (!hasPermission(actor, permission)) {
        throw new AuthError('FORBIDDEN', `Permission required: ${permission}`);
      }

      return next({
        ctx: {
          ...ctx,
          actor,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        throw new TRPCError({
          code: error.code as any,
          message: error.message,
        });
      }
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Permission required: ${permission}`,
      });
    }
  });
}

/**
 * Factory to create tRPC procedures with authentication
 * Applications use this to create their procedure instances
 */
export function createTRPCProcedures<TContext extends TRPCContext>() {
  const t = initTRPC.context<TContext>().create({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
        },
      };
    },
  });

  // Create middleware instances
  const isAuthed = authMiddleware(t);
  const hasOrgContext = orgContextMiddleware(t);
  const isAdmin = adminOnlyMiddleware(t);

  return {
    // Base router creation
    router: t.router,
    createCallerFactory: t.createCallerFactory,

    // Public procedure - no auth required
    publicProcedure: t.procedure,

    // Protected procedure - auth required
    protectedProcedure: t.procedure.use(isAuthed),

    // Org-scoped procedure - auth + org context required
    orgProtectedProcedure: t.procedure.use(hasOrgContext),

    // Admin-only procedure - platform admin required
    adminOnlyProcedure: t.procedure.use(isAdmin),

    // Factory for permission-based procedures
    procedureWithPermission: (permission: string) =>
      t.procedure.use(permissionMiddleware(permission, t)),

    // Org-scoped with specific permission
    orgProtectedProcedureWithPermission: (permission: string) =>
      t.procedure.use(hasOrgContext).use(permissionMiddleware(permission, t)),

    // Middleware exports for custom procedures
    middleware: {
      auth: isAuthed,
      orgContext: hasOrgContext,
      adminOnly: isAdmin,
      permission: (permission: string) => permissionMiddleware(permission, t),
    },
  };
}

/**
 * Type exports for procedure types
 */
export type PublicProcedure = ReturnType<typeof createTRPCProcedures>['publicProcedure'];
export type ProtectedProcedure = ReturnType<typeof createTRPCProcedures>['protectedProcedure'];
export type OrgProtectedProcedure = ReturnType<typeof createTRPCProcedures>['orgProtectedProcedure'];
export type AdminOnlyProcedure = ReturnType<typeof createTRPCProcedures>['adminOnlyProcedure'];

/**
 * Helper to create a tRPC router with standard procedures
 */
export function createTRPCRouter<TContext extends TRPCContext>() {
  const procedures = createTRPCProcedures<TContext>();
  return procedures.router;
}
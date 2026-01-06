/**
 * tRPC Procedure Factories for SaaS Applications
 *
 * Provides factory functions to create standard security layers for tRPC routers:
 * - createProtectedProcedure: Authentication required
 * - createAdminOnlyProcedure: Platform admin access only
 * - createWithPermission: Specific permission required
 * - createOrgProtectedProcedure: Authentication + org context + RLS
 * - createOrgProtectedProcedureWithPermission: Full org + permission protection
 *
 * These factories accept a tRPC instance and dependencies, returning configured procedures.
 * This allows apps to inject their own DB clients, permission tables, and RLS setup.
 *
 * @module @jetdevs/framework/trpc/procedures
 */

import { TRPCError } from '@trpc/server';
import type { Actor } from '../auth/actor';
import { AuthError, createActor, hasPermission, validateOrgContext } from '../auth/actor';

// ============================================================================
// Types
// ============================================================================

/**
 * Context type required for procedures
 * Applications must provide this context shape
 */
export interface TRPCContext {
  session: {
    user: {
      id: number;
      email: string;
      currentOrgId: number | null;
      permissions?: string[];
      roles?: Array<{
        name: string;
        orgId?: number;
        isSystemRole?: boolean;
        isGlobalRole?: boolean;
        isPlatformRole?: boolean;
      }>;
    };
    expires: string;
  } | null;
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
 * Options for creating admin-only procedure
 */
export interface AdminOnlyProcedureOptions {
  /** Function to get privileged DB access (bypasses RLS) */
  getPrivilegedDb: () => Promise<any>;
  /** List of admin permissions that grant admin access */
  adminPermissions?: string[];
  /** Function to check if a role is a system/super user role */
  isSystemRole?: (roleName: string) => boolean;
}

/**
 * Options for creating permission middleware
 */
export interface WithPermissionOptions {
  /** Function to get privileged DB access (bypasses RLS) */
  getPrivilegedDb: () => Promise<any>;
  /** Permission that grants full access (bypasses all checks) */
  fullAccessPermission?: string;
}

/**
 * Options for creating org-protected procedure
 */
export interface OrgProtectedProcedureOptions {
  /** Function to get privileged DB access (bypasses RLS) */
  getPrivilegedDb: (callback: (db: any) => Promise<any>) => Promise<any>;
  /** Function to set RLS context in database */
  setOrgContext?: (db: any, orgId: number) => Promise<void>;
  /** Function to set superuser flag in database */
  setSuperuserFlag?: (db: any, isSuperuser: boolean) => Promise<void>;
}

/**
 * Extended context for org-protected procedures
 */
export interface OrgProtectedContext extends AuthenticatedContext {
  activeOrgId: number | undefined;
  isSystemUser: boolean;
  dbWithRLS: (callback: (db: any) => Promise<any>) => Promise<any>;
}

// ============================================================================
// Middleware Factories
// ============================================================================

/**
 * Factory to create authentication middleware
 */
export function createAuthMiddleware<T extends { middleware: Function }>(t: T) {
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
 * Factory to create organization context middleware
 */
export function createOrgContextMiddleware<T extends { middleware: Function }>(t: T) {
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
 * Factory to create admin-only middleware
 */
export function createAdminOnlyMiddleware<T extends { middleware: Function }>(t: T) {
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
 * Factory to create permission-checking middleware
 */
export function createPermissionMiddleware<T extends { middleware: Function }>(
  permission: string,
  t: T
) {
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

// ============================================================================
// Procedure Factories
// ============================================================================

/**
 * Factory to create a protected procedure that requires authentication
 *
 * @example
 * ```typescript
 * const protectedProcedure = createProtectedProcedure(t);
 *
 * // Use in router
 * export const userRouter = createTRPCRouter({
 *   getProfile: protectedProcedure.query(async ({ ctx }) => {
 *     return ctx.session.user;
 *   }),
 * });
 * ```
 */
export function createProtectedProcedure<T extends { procedure: any; middleware: Function }>(t: T) {
  return t.procedure.use(({ ctx, next }: any) => {
    if (!ctx.session || !ctx.session.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }
    return next({
      ctx: {
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });
}

/**
 * Factory to create an admin-only procedure with permission checking
 *
 * This procedure:
 * 1. Requires authentication
 * 2. Checks for admin:* permissions or super user role
 * 3. Uses privileged DB for permission lookup to bypass RLS
 *
 * @example
 * ```typescript
 * const adminOnlyProcedure = createAdminOnlyProcedure(t, {
 *   getPrivilegedDb: async () => privilegedDb,
 *   adminPermissions: ['admin:full_access', 'admin:manage_users'],
 *   isSystemRole: (name) => name === 'Super User',
 * });
 * ```
 */
export function createAdminOnlyProcedure<T extends { procedure: any; middleware: Function }>(
  t: T,
  options: AdminOnlyProcedureOptions
) {
  const {
    getPrivilegedDb,
    adminPermissions = ['admin:full_access'],
    isSystemRole = (name: string) => {
      const normalized = name.trim().toLowerCase();
      return normalized === 'super user' || normalized === 'superuser' || normalized === 'super_user';
    },
  } = options;

  return t.procedure.use(async ({ ctx, next }: any) => {
    if (!ctx.session) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'No session found',
      });
    }

    const userId = ctx.session?.user?.id;
    const currentOrgId = ctx.session?.user?.currentOrgId;

    // Fast path: Check session roles first
    const sessionRoles: Array<{ name?: string; isSystemRole?: boolean }> =
      (ctx.session?.user as any)?.roles || [];
    const sessionHasSuper = sessionRoles.some((r) => {
      return r?.isSystemRole === true || isSystemRole(r?.name || '');
    });

    if (sessionHasSuper) {
      return next({ ctx: { session: ctx.session } });
    }

    if (!userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    try {
      const privilegedDb = await getPrivilegedDb();

      // Check for super user role in database
      const userRolesData = await privilegedDb.query.userRoles.findMany({
        where: (userRoles: any, { and, eq, or }: any) => {
          const conditions = [eq(userRoles.userId, userId), eq(userRoles.isActive, true)];

          if (currentOrgId) {
            conditions.push(or(eq(userRoles.orgId, currentOrgId), eq(userRoles.orgId, -1)));
          } else {
            conditions.push(eq(userRoles.orgId, -1));
          }

          return and(...conditions);
        },
        with: {
          role: true,
        },
      });

      const isSuperUser = userRolesData.some((ur: any) => {
        return ur.role.isSystemRole === true || isSystemRole(ur.role.name || '');
      });

      if (isSuperUser) {
        return next({ ctx: { session: ctx.session } });
      }

      // Check for admin permissions
      const userRolesWithPerms = await privilegedDb.query.userRoles.findMany({
        where: (userRoles: any, { and, eq }: any) => {
          const conditions = [eq(userRoles.userId, userId)];
          if (currentOrgId) {
            conditions.push(eq(userRoles.orgId, currentOrgId));
          }
          return and(...conditions);
        },
        with: {
          role: {
            with: {
              rolePermissions: {
                with: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      const userPermissions = userRolesWithPerms.flatMap((userRole: any) =>
        userRole.role.rolePermissions.map((rp: any) => rp.permission.slug)
      );

      const hasAdminAccess =
        adminPermissions.some((p) => userPermissions.includes(p)) ||
        userPermissions.some((p: string) => p.startsWith('admin:'));

      if (!hasAdminAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required',
        });
      }

      return next({ ctx: { session: ctx.session } });
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error('Error checking admin permissions:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to verify admin permissions',
      });
    }
  });
}

/**
 * Factory to create a permission-checking middleware factory
 *
 * Returns a function that creates procedures requiring specific permissions.
 *
 * @example
 * ```typescript
 * const withPermission = createWithPermission(t, {
 *   getPrivilegedDb: async () => privilegedDb,
 *   fullAccessPermission: 'admin:full_access',
 * });
 *
 * // Use in router
 * export const workflowRouter = createTRPCRouter({
 *   create: withPermission('workflow:create').mutation(async ({ ctx, input }) => {
 *     // User has workflow:create permission
 *   }),
 * });
 * ```
 */
export function createWithPermission<T extends { procedure: any; middleware: Function }>(
  t: T,
  options: WithPermissionOptions
) {
  const { getPrivilegedDb, fullAccessPermission = 'admin:full_access' } = options;

  // Create the protected procedure base
  const protectedProcedure = createProtectedProcedure(t);

  return (requiredPermission: string) => {
    return protectedProcedure.use(async ({ ctx, next }: any) => {
      const userId = ctx.session.user.id;
      const currentOrgId = ctx.session.user.currentOrgId;

      try {
        const privilegedDb = await getPrivilegedDb();

        // Check for super user first
        const userRolesData = await privilegedDb.query.userRoles.findMany({
          where: (userRoles: any, { and, eq, or }: any) =>
            and(
              eq(userRoles.userId, userId),
              eq(userRoles.isActive, true),
              or(eq(userRoles.orgId, currentOrgId), eq(userRoles.orgId, -1))
            ),
          with: {
            role: true,
          },
        });

        const isSuperUser = userRolesData.some(
          (ur: any) => ur.role.name === 'Super User' || ur.role.isSystemRole === true
        );

        if (isSuperUser) {
          return next({ ctx: { session: ctx.session } });
        }

        // Check for required permission
        const userRolesWithPerms = await privilegedDb.query.userRoles.findMany({
          where: (userRoles: any, { and, eq }: any) =>
            and(eq(userRoles.userId, userId), eq(userRoles.orgId, currentOrgId)),
          with: {
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: true,
                  },
                },
              },
            },
          },
        });

        const userPermissions = userRolesWithPerms.flatMap((userRole: any) =>
          userRole.role.rolePermissions.map((rp: any) => rp.permission.slug)
        );

        const hasPermission =
          userPermissions.includes(requiredPermission) ||
          userPermissions.includes(fullAccessPermission);

        if (!hasPermission) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Permission required: ${requiredPermission}`,
          });
        }

        return next({ ctx: { session: ctx.session } });
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('Error checking permissions:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify permissions',
        });
      }
    });
  };
}

/**
 * Factory to create an org-protected procedure with RLS enforcement
 *
 * This procedure:
 * 1. Requires authentication
 * 2. Validates org context (or allows system users without org)
 * 3. Sets up RLS context for database queries
 * 4. Provides a dbWithRLS helper for executing queries with RLS
 *
 * @example
 * ```typescript
 * const orgProtectedProcedure = createOrgProtectedProcedure(t, {
 *   getPrivilegedDb: withPrivilegedDb,
 *   setOrgContext: async (db, orgId) => {
 *     await db.execute(sql`SELECT set_org_context(${orgId})`);
 *   },
 * });
 * ```
 */
export function createOrgProtectedProcedure<T extends { procedure: any; middleware: Function }>(
  t: T,
  options: OrgProtectedProcedureOptions
) {
  const {
    getPrivilegedDb,
    setOrgContext = async () => {},
    setSuperuserFlag = async () => {},
  } = options;

  const protectedProcedure = createProtectedProcedure(t);

  return protectedProcedure.use(async ({ ctx, next }: any) => {
    const rawCurrentOrgId = ctx.session.user.currentOrgId as number | string | null | undefined;
    let currentOrgId: number | null = null;

    // Parse org ID from various formats
    if (typeof rawCurrentOrgId === 'string') {
      const parsedOrgId = Number.parseInt(rawCurrentOrgId, 10);
      currentOrgId = Number.isNaN(parsedOrgId) ? null : parsedOrgId;
    } else if (typeof rawCurrentOrgId === 'number') {
      currentOrgId = rawCurrentOrgId;
    } else if (rawCurrentOrgId !== null && rawCurrentOrgId !== undefined) {
      const coerced = Number(rawCurrentOrgId);
      currentOrgId = Number.isNaN(coerced) ? null : coerced;
    }

    const userId = ctx.session.user.id;

    // Check if user is a system user
    const isSystemUser = await getPrivilegedDb(async (db: any) => {
      const allUserRoles = await db.query.userRoles.findMany({
        where: (userRoles: any, { and, eq }: any) =>
          and(eq(userRoles.userId, userId), eq(userRoles.isActive, true)),
        with: {
          role: true,
        },
      });

      return allUserRoles.some(
        (ur: any) => ur.role.isSystemRole === true || ur.role.isGlobalRole === true
      );
    });

    // Non-system users require org context
    if (!isSystemUser && !currentOrgId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No active organization found. Please contact support or try refreshing the page.',
      });
    }

    // System users without org context get privileged DB access
    if (isSystemUser && !currentOrgId) {
      return next({
        ctx: {
          ...ctx,
          session: ctx.session,
          activeOrgId: undefined,
          isSystemUser: true,
          dbWithRLS: async (callback: (db: any) => Promise<any>) => {
            return getPrivilegedDb(callback);
          },
        },
      });
    }

    // Regular users and system users with org context use RLS
    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
        activeOrgId: currentOrgId ?? undefined,
        isSystemUser,
        dbWithRLS: async (callback: (db: any) => Promise<any>) => {
          try {
            if (currentOrgId != null) {
              await setOrgContext(ctx.db, currentOrgId);
            }
            if (isSystemUser) {
              await setSuperuserFlag(ctx.db, true);
            }
          } catch (err: any) {
            // If RLS functions don't exist, warn but continue
            if (err?.message?.includes('function') || err?.message?.includes('does not exist')) {
              console.warn('RLS context function not found. Proceeding without RLS context.');
            } else {
              console.warn('Failed to set RLS context:', err?.message);
            }
          }

          return await callback(ctx.db);
        },
      },
    });
  });
}

/**
 * Factory to create an org-protected procedure with permission checking
 *
 * Combines org-protection with permission validation.
 *
 * @example
 * ```typescript
 * const orgProtectedProcedureWithPermission = createOrgProtectedProcedureWithPermission(
 *   t,
 *   orgProtectedProcedure,
 *   {
 *     getPrivilegedDb: withPrivilegedDb,
 *     fullAccessPermission: 'admin:full_access',
 *   }
 * );
 *
 * // Returns a function that accepts a permission
 * const workflowProcedure = orgProtectedProcedureWithPermission('workflow:read');
 * ```
 */
export function createOrgProtectedProcedureWithPermission<
  T extends { procedure: any; middleware: Function }
>(t: T, orgProtectedProcedure: any, options: WithPermissionOptions) {
  const { getPrivilegedDb, fullAccessPermission = 'admin:full_access' } = options;

  return (requiredPermission: string) => {
    return orgProtectedProcedure.use(async ({ ctx, next }: any) => {
      const userId = ctx.session.user.id;
      const currentOrgId = ctx.session.user.currentOrgId;

      try {
        const privilegedDb = await getPrivilegedDb();

        // Check for super user first
        const userRolesData = await privilegedDb.query.userRoles.findMany({
          where: (userRoles: any, { and, eq, or }: any) =>
            and(
              eq(userRoles.userId, userId),
              eq(userRoles.isActive, true),
              or(eq(userRoles.orgId, currentOrgId), eq(userRoles.orgId, -1))
            ),
          with: {
            role: true,
          },
        });

        const isSuperUser = userRolesData.some(
          (ur: any) => ur.role.name === 'Super User' || ur.role.isSystemRole === true
        );

        if (isSuperUser) {
          return next({ ctx });
        }
      } catch (error) {
        console.error('Error checking superuser status:', error);
        // Continue with normal permission check
      }

      // Get permissions from session (JWT array)
      const userPermissions = (ctx.session.user as any).permissions || [];

      const hasPermission =
        userPermissions.includes(requiredPermission) ||
        userPermissions.includes(fullAccessPermission) ||
        userPermissions.includes('*'); // Wildcard for API keys

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Permission required: ${requiredPermission}`,
        });
      }

      return next({ ctx });
    });
  };
}

// ============================================================================
// Legacy Exports (for backward compatibility)
// ============================================================================

// Re-export middleware functions with old names for backward compatibility
export const authMiddleware = createAuthMiddleware;
export const orgContextMiddleware = createOrgContextMiddleware;
export const adminOnlyMiddleware = createAdminOnlyMiddleware;
export const permissionMiddleware = createPermissionMiddleware;

/**
 * Legacy factory to create all procedures at once
 * @deprecated Use individual factory functions instead for better tree-shaking
 */
export function createTRPCProcedures<TContext extends TRPCContext>(
  t: any,
  options?: {
    getPrivilegedDb?: () => Promise<any>;
  }
) {
  const isAuthed = createAuthMiddleware(t);
  const hasOrgContext = createOrgContextMiddleware(t);
  const isAdmin = createAdminOnlyMiddleware(t);

  return {
    router: t.router,
    createCallerFactory: t.createCallerFactory,
    publicProcedure: t.procedure,
    protectedProcedure: t.procedure.use(isAuthed),
    orgProtectedProcedure: t.procedure.use(hasOrgContext),
    adminOnlyProcedure: t.procedure.use(isAdmin),
    procedureWithPermission: (permission: string) =>
      t.procedure.use(createPermissionMiddleware(permission, t)),
    orgProtectedProcedureWithPermission: (permission: string) =>
      t.procedure.use(hasOrgContext).use(createPermissionMiddleware(permission, t)),
    middleware: {
      auth: isAuthed,
      orgContext: hasOrgContext,
      adminOnly: isAdmin,
      permission: (permission: string) => createPermissionMiddleware(permission, t),
    },
  };
}

/**
 * Helper to create a tRPC router (simple re-export pattern)
 */
export function createTRPCRouter<TContext extends TRPCContext>(t: any) {
  return t.router;
}

// ============================================================================
// Type Exports
// ============================================================================

export type PublicProcedure = ReturnType<typeof createTRPCProcedures>['publicProcedure'];
export type ProtectedProcedure = ReturnType<typeof createTRPCProcedures>['protectedProcedure'];
export type OrgProtectedProcedure = ReturnType<typeof createTRPCProcedures>['orgProtectedProcedure'];
export type AdminOnlyProcedure = ReturnType<typeof createTRPCProcedures>['adminOnlyProcedure'];

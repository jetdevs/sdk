/**
 * Auth Router Configuration Factory
 *
 * Creates auth router configuration for use with createRouterWithActor.
 * This factory pattern allows apps to inject their own dependencies while
 * reusing the core auth logic.
 *
 * @module @jetdevs/core/auth
 */

import { z } from 'zod';
import type { IAuthRepository } from './repository';
import { registerSchema, updateProfileSchema } from './schemas';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Schema tables needed for getCurrentUser
 */
export interface AuthSchema {
  users: any;
  userRoles: any;
}

/**
 * Dependencies that must be provided by the consuming app
 */
export interface AuthRouterDeps {
  /**
   * Repository class constructor - will be instantiated by createRouterWithActor
   */
  Repository: new (db: any) => IAuthRepository;

  /**
   * Password hashing function (e.g., bcrypt.hash)
   */
  hashPassword: (password: string, rounds?: number) => Promise<string>;

  /**
   * Get privileged database client for cross-org operations
   * This is needed for getCurrentUser which must bypass RLS
   */
  getPrivilegedDb: () => any;

  /**
   * Schema tables needed for getCurrentUser queries
   * Must have users and userRoles tables with proper relations
   */
  schema: AuthSchema;

  /**
   * Check if public registration is enabled (optional)
   * Defaults to checking NEXT_PUBLIC_ENABLE_PUBLIC_REGISTRATION env var
   */
  isRegistrationEnabled?: () => boolean;
}

/**
 * Session user structure (minimal)
 */
export interface SessionUser {
  id: string | number;
  email?: string;
  currentOrgId?: number | null;
}

/**
 * tRPC context with session
 */
export interface AuthContext {
  session: {
    user: SessionUser;
    expires: string;
  };
}

/**
 * Handler context from createRouterWithActor
 */
export interface AuthHandlerContext<TInput = any> {
  input: TInput;
  service: {
    db: any;
    orgId: number;
    userId: string;
  };
  actor: any;
  db: any;
  repo: IAuthRepository;
  ctx: AuthContext;
}

/**
 * Error class for auth operations
 */
export class AuthRouterError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'AuthRouterError';
  }
}

// =============================================================================
// ROUTER CONFIG FACTORY
// =============================================================================

/**
 * Create auth router configuration for use with createRouterWithActor.
 *
 * This factory creates a configuration object that can be passed to
 * createRouterWithActor. It handles:
 * - Session retrieval
 * - User registration (when enabled)
 * - Get current user with roles and permissions
 * - Profile updates
 *
 * @example
 * ```typescript
 * import { createAuthRouterConfig } from '@jetdevs/core/auth';
 * import { createRouterWithActor } from '@jetdevs/framework/router';
 * import { AuthRepository } from '@/server/repos/auth.repository';
 * import { privilegedDb } from '@/db/clients';
 * import bcrypt from 'bcrypt';
 *
 * const authRouterConfig = createAuthRouterConfig({
 *   Repository: AuthRepository,
 *   hashPassword: (password) => bcrypt.hash(password, 12),
 *   getPrivilegedDb: () => privilegedDb,
 * });
 *
 * export const authRouter = createRouterWithActor(authRouterConfig);
 * ```
 */
export function createAuthRouterConfig(deps: AuthRouterDeps) {
  const isRegistrationEnabled = deps.isRegistrationEnabled ||
    (() => process.env.NEXT_PUBLIC_ENABLE_PUBLIC_REGISTRATION === 'true');

  return {
    // -------------------------------------------------------------------------
    // GET SESSION
    // Returns the current user session
    //
    // IMPORTANT: crossOrg: true is required because:
    // 1. This endpoint must work on custom domains even when user's session org
    //    differs from the locked org (e.g., during login flow)
    // 2. Session data is not org-scoped, it's user-scoped
    // -------------------------------------------------------------------------
    session: {
      type: 'query' as const,
      crossOrg: true,
      repository: deps.Repository,
      handler: async ({ ctx }: AuthHandlerContext) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('auth.session endpoint called:', {
            hasSession: !!ctx.session,
            hasUser: !!ctx.session?.user,
            userEmail: ctx.session?.user?.email,
            userId: ctx.session?.user?.id,
            currentOrgId: ctx.session?.user?.currentOrgId,
          });
        }

        return {
          user: ctx.session.user,
          expires: ctx.session.expires,
        };
      },
    },

    // -------------------------------------------------------------------------
    // REGISTER (public)
    // Creates a new user account when registration is enabled
    // -------------------------------------------------------------------------
    register: {
      type: 'mutation' as const,
      public: true,
      input: registerSchema,
      repository: deps.Repository,
      handler: async ({ input, repo }: AuthHandlerContext<z.infer<typeof registerSchema>>) => {
        // Check if public registration is enabled
        if (!isRegistrationEnabled()) {
          throw new AuthRouterError('FORBIDDEN', 'Public registration is disabled');
        }

        const existingUser = await repo.findByEmail(input.email);

        if (existingUser) {
          throw new AuthRouterError('CONFLICT', 'User already exists');
        }

        const hashedPassword = await deps.hashPassword(input.password, 12);

        const newUser = await repo.createUser({
          email: input.email,
          password: hashedPassword,
          name: input.name || input.email.split('@')[0],
        });

        return {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        };
      },
    },

    // -------------------------------------------------------------------------
    // UPDATE PROFILE
    // Updates the current user's profile
    //
    // IMPORTANT: crossOrg: true is required because:
    // 1. Profile updates are user-scoped, not org-scoped
    // 2. Must work on custom domains regardless of org context
    // -------------------------------------------------------------------------
    updateProfile: {
      input: updateProfileSchema,
      invalidates: ['users'],
      entityType: 'user',
      crossOrg: true,
      repository: deps.Repository,
      handler: async ({ input, service, repo }: AuthHandlerContext<z.infer<typeof updateProfileSchema>>) => {
        const userId = parseInt(service.userId);

        if (!userId) {
          throw new AuthRouterError('UNAUTHORIZED', 'User not authenticated');
        }

        const updatedUser = await repo.updateProfile(userId, input);

        if (!updatedUser) {
          throw new AuthRouterError('NOT_FOUND', 'User not found');
        }

        return {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          username: updatedUser.username,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        };
      },
    },

    // -------------------------------------------------------------------------
    // GET CURRENT USER
    // Returns the current user with all roles, permissions, and available orgs
    // Uses privilegedDb to bypass RLS and fetch ALL user roles
    //
    // IMPORTANT: crossOrg: true is required because:
    // 1. This endpoint must work on custom domains even when user's session org
    //    differs from the locked org (e.g., during login flow)
    // 2. We use privilegedDb anyway to bypass RLS
    // 3. This is an auth endpoint, not an org-scoped data endpoint
    // -------------------------------------------------------------------------
    getCurrentUser: {
      type: 'query' as const,
      crossOrg: true,
      repository: deps.Repository,
      handler: async ({ ctx }: AuthHandlerContext) => {
        const userId = ctx.session?.user?.id;

        if (!userId) {
          throw new AuthRouterError('UNAUTHORIZED', 'User not authenticated');
        }

        const privilegedDb = deps.getPrivilegedDb();

        if (!privilegedDb) {
          console.error('Privileged database client not available');
          throw new AuthRouterError('INTERNAL_SERVER_ERROR', 'Database configuration error');
        }

        const { users, userRoles } = deps.schema;
        const { eq, and, isNull, or } = await import('drizzle-orm');

        const numericUserId = typeof userId === 'string' ? parseInt(userId) : userId;

        if (process.env.NODE_ENV === 'development') {
          console.log(`getCurrentUser: Fetching data for user ${numericUserId} using privilegedDb`);
        }

        // Use privilegedDb for authentication-related queries (bypasses RLS)
        const user = await privilegedDb.query.users.findFirst({
          where: eq(users.id, numericUserId),
        });

        if (!user) {
          console.warn(`User ID ${userId} exists in session but not in database`);
          throw new AuthRouterError('NOT_FOUND', 'User not found - please sign in again');
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`User found: ${user.email}, orgId: ${user.currentOrgId}`);
        }

        // Get ALL active roles for the user (bypasses RLS)
        const allUserRoles = await privilegedDb.query.userRoles.findMany({
          where: and(
            eq(userRoles.userId, numericUserId),
            eq(userRoles.isActive, true)
          ),
          with: {
            org: {
              columns: { id: true, name: true }
            },
            role: {
              columns: { id: true, name: true }
            }
          }
        });

        // Categorize roles
        const systemRoles = allUserRoles.filter((r: any) => r.orgId === null || r.orgId === -1);
        const orgRoles = allUserRoles.filter((r: any) => r.orgId !== null && r.orgId !== -1);
        const hasAccessToCurrentOrg = user.currentOrgId
          ? orgRoles.some((r: any) => r.orgId === user.currentOrgId)
          : false;

        if (process.env.NODE_ENV === 'development') {
          console.log(`User ${numericUserId} role analysis:`, {
            totalRoles: allUserRoles.length,
            systemRoles: systemRoles.length,
            orgRoles: orgRoles.length,
            currentOrgId: user.currentOrgId,
            hasAccessToCurrentOrg,
            orgIds: [...new Set(orgRoles.map((r: any) => r.orgId))]
          });
        }

        // Determine which roles to return based on user's access
        let roleWhereClause;

        if (systemRoles.length > 0 && orgRoles.length === 0) {
          // User has ONLY system roles
          roleWhereClause = and(
            eq(userRoles.userId, numericUserId),
            isNull(userRoles.orgId),
            eq(userRoles.isActive, true)
          );
        } else if (systemRoles.length > 0 && !hasAccessToCurrentOrg) {
          // User has system roles but no access to current org
          roleWhereClause = and(
            eq(userRoles.userId, numericUserId),
            isNull(userRoles.orgId),
            eq(userRoles.isActive, true)
          );
        } else if (hasAccessToCurrentOrg) {
          // User has access to current org - return both org and system roles
          roleWhereClause = and(
            eq(userRoles.userId, numericUserId),
            or(
              eq(userRoles.orgId, user.currentOrgId!),
              isNull(userRoles.orgId)
            ),
            eq(userRoles.isActive, true)
          );
        } else {
          // Edge case: User has org roles but not for current org, and no system roles
          roleWhereClause = and(
            eq(userRoles.userId, numericUserId),
            eq(userRoles.orgId, -9999), // Will return nothing
            eq(userRoles.isActive, true)
          );
        }

        // Get role assignments with permissions (bypasses RLS)
        const userRoleAssignments = await privilegedDb.query.userRoles.findMany({
          where: roleWhereClause,
          with: {
            org: {
              columns: { id: true, name: true }
            },
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: {
                      columns: { id: true, slug: true, name: true, description: true }
                    }
                  }
                }
              }
            }
          }
        });

        // Debug logging for permission resolution
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_AUTH === 'true') {
          console.log(`getCurrentUser: Found ${userRoleAssignments.length} role assignments for user ${numericUserId}`);
          userRoleAssignments.forEach((assignment: any, idx: number) => {
            const rolePermsCount = assignment.role?.rolePermissions?.length ?? 0;
            const adminPerms = assignment.role?.rolePermissions?.filter((rp: any) =>
              rp.permission?.slug?.startsWith('admin:')
            ).length ?? 0;
            console.log(`  Role ${idx + 1}: ${assignment.role?.name ?? 'unknown'} - ${rolePermsCount} total permissions, ${adminPerms} admin permissions`);
          });
        }

        // Aggregate all unique permissions
        const allPermissions = userRoleAssignments.flatMap((assignment: any) => {
          if (!assignment.role || !assignment.role.rolePermissions) {
            console.warn('Role or rolePermissions missing for assignment:', JSON.stringify({
              roleId: assignment.roleId,
              roleName: assignment.role?.name,
              hasRole: !!assignment.role,
              hasRolePermissions: !!assignment.role?.rolePermissions
            }));
            return [];
          }

          return assignment.role.rolePermissions
            .filter((rp: any) => rp.permission !== null)
            .map((rp: any) => ({
              slug: rp.permission?.slug ?? '',
              name: rp.permission?.name ?? 'Unknown',
              description: rp.permission?.description ?? null
            }));
        });

        // Remove duplicates and filter out empty slugs
        const uniquePermissions = allPermissions
          .filter((permission: any) => permission.slug && permission.slug.length > 0)
          .filter(
            (permission: any, index: number, self: any[]) =>
              index === self.findIndex((p: any) => p.slug === permission.slug)
          );

        // Get available organizations (filter out system role assignments and missing data)
        const availableOrgs = allUserRoles
          .filter((assignment: any) =>
            assignment.orgId !== null &&
            assignment.orgId !== -1 &&
            assignment.org &&
            assignment.role
          )
          .map((assignment: any) => ({
            id: assignment.org.id,
            name: assignment.org.name,
            roleName: assignment.role?.name ?? 'Unknown',
            isActive: assignment.isActive
          }));

        // Format ALL roles for the frontend
        const roles = allUserRoles
          .filter((assignment: any) => assignment.role !== null)
          .map((assignment: any) => ({
            id: assignment.role?.id ?? 0,
            name: assignment.role?.name ?? 'Unknown',
            orgId: assignment.orgId,
            orgName: assignment.org?.name || 'System',
            isActive: assignment.isActive
          }));

        const result = {
          id: user.id,
          uuid: user.uuid,
          email: user.email,
          name: user.name,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          currentOrgId: user.currentOrgId,
          permissions: uniquePermissions,
          roles,
          availableOrgs,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };

        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_AUTH === 'true') {
          const adminPerms = result.permissions.filter((p: any) => p.slug?.startsWith('admin:'));
          console.log(`getCurrentUser successful: ${result.email}, permissions: ${result.permissions.length} (${adminPerms.length} admin), roles: ${result.roles.length}, orgs: ${result.availableOrgs.length}`);
          if (adminPerms.length > 0) {
            console.log(`  Admin permissions: ${adminPerms.map((p: any) => p.slug).join(', ')}`);
          }
        }

        return result;
      },
    },
  };
}

/**
 * Create a standalone getCurrentUser handler.
 *
 * This is separated because it requires privilegedDb access which
 * is typically not available through the normal RLS-protected context.
 *
 * @example
 * ```typescript
 * import { createGetCurrentUserHandler } from '@jetdevs/core/auth';
 * import { privilegedDb } from '@/db/clients';
 * import { users, userRoles } from '@/db/schema';
 *
 * const getCurrentUserHandler = createGetCurrentUserHandler({
 *   getPrivilegedDb: () => privilegedDb,
 *   schema: { users, userRoles },
 * });
 *
 * // Use in a custom router setup
 * getCurrentUser: orgProtectedProcedure.query(async ({ ctx }) => {
 *   return getCurrentUserHandler(ctx);
 * }),
 * ```
 */
export function createGetCurrentUserHandler(config: {
  getPrivilegedDb: () => any;
  schema: {
    users: any;
    userRoles: any;
  };
}) {
  return async (ctx: AuthContext) => {
    const userId = ctx.session?.user?.id;

    if (!userId) {
      throw new AuthRouterError('UNAUTHORIZED', 'User not authenticated');
    }

    const privilegedDb = config.getPrivilegedDb();

    if (!privilegedDb) {
      console.error('Privileged database client not available');
      throw new AuthRouterError('INTERNAL_SERVER_ERROR', 'Database configuration error');
    }

    const { users, userRoles } = config.schema;
    const { eq, and, isNull, or } = await import('drizzle-orm');

    // Use privilegedDb for authentication-related queries (bypasses RLS)
    const user = await privilegedDb.query.users.findFirst({
      where: eq(users.id, typeof userId === 'string' ? parseInt(userId) : userId),
    });

    if (!user) {
      console.warn(`User ID ${userId} exists in session but not in database`);
      throw new AuthRouterError('NOT_FOUND', 'User not found - please sign in again');
    }

    // Get ALL active roles for the user (bypasses RLS)
    const allUserRoles = await privilegedDb.query.userRoles.findMany({
      where: and(
        eq(userRoles.userId, user.id),
        eq(userRoles.isActive, true)
      ),
      with: {
        org: {
          columns: { id: true, name: true }
        },
        role: {
          columns: { id: true, name: true }
        }
      }
    });

    // Categorize roles
    const systemRoles = allUserRoles.filter((r: any) => r.orgId === null || r.orgId === -1);
    const orgRoles = allUserRoles.filter((r: any) => r.orgId !== null && r.orgId !== -1);
    const hasAccessToCurrentOrg = user.currentOrgId
      ? orgRoles.some((r: any) => r.orgId === user.currentOrgId)
      : false;

    // Determine which roles to return based on user's access
    let roleWhereClause;

    if (systemRoles.length > 0 && orgRoles.length === 0) {
      // User has ONLY system roles
      roleWhereClause = and(
        eq(userRoles.userId, user.id),
        isNull(userRoles.orgId),
        eq(userRoles.isActive, true)
      );
    } else if (systemRoles.length > 0 && !hasAccessToCurrentOrg) {
      // User has system roles but no access to current org
      roleWhereClause = and(
        eq(userRoles.userId, user.id),
        isNull(userRoles.orgId),
        eq(userRoles.isActive, true)
      );
    } else if (hasAccessToCurrentOrg) {
      // User has access to current org - return both org and system roles
      roleWhereClause = and(
        eq(userRoles.userId, user.id),
        or(
          eq(userRoles.orgId, user.currentOrgId!),
          isNull(userRoles.orgId)
        ),
        eq(userRoles.isActive, true)
      );
    } else {
      // Edge case: User has org roles but not for current org, and no system roles
      roleWhereClause = and(
        eq(userRoles.userId, user.id),
        eq(userRoles.orgId, -9999), // Will return nothing
        eq(userRoles.isActive, true)
      );
    }

    // Get role assignments with permissions (bypasses RLS)
    const userRoleAssignments = await privilegedDb.query.userRoles.findMany({
      where: roleWhereClause,
      with: {
        org: {
          columns: { id: true, name: true }
        },
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: {
                  columns: { id: true, slug: true, name: true, description: true }
                }
              }
            }
          }
        }
      }
    });

    // Aggregate all unique permissions
    const allPermissions = userRoleAssignments.flatMap((assignment: any) => {
      if (!assignment.role || !assignment.role.rolePermissions) {
        console.warn('Role or rolePermissions missing for assignment:', assignment);
        return [];
      }

      return assignment.role.rolePermissions
        .filter((rp: any) => rp.permission !== null)
        .map((rp: any) => ({
          slug: rp.permission?.slug ?? '',
          name: rp.permission?.name ?? 'Unknown',
          description: rp.permission?.description ?? null
        }));
    });

    // Remove duplicates and filter out empty slugs
    const uniquePermissions = allPermissions
      .filter((permission: any) => permission.slug && permission.slug.length > 0)
      .filter(
        (permission: any, index: number, self: any[]) =>
          index === self.findIndex((p: any) => p.slug === permission.slug)
      );

    // Get available organizations
    const availableOrgs = allUserRoles
      .filter((assignment: any) =>
        assignment.orgId !== null &&
        assignment.orgId !== -1 &&
        assignment.org &&
        assignment.role
      )
      .map((assignment: any) => ({
        id: assignment.org.id,
        name: assignment.org.name,
        roleName: assignment.role?.name ?? 'Unknown',
        isActive: assignment.isActive
      }));

    // Format ALL roles for the frontend
    const roles = allUserRoles
      .filter((assignment: any) => assignment.role !== null)
      .map((assignment: any) => ({
        id: assignment.role?.id ?? 0,
        name: assignment.role?.name ?? 'Unknown',
        orgId: assignment.orgId,
        orgName: assignment.org?.name || 'System',
        isActive: assignment.isActive
      }));

    return {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      name: user.name,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      currentOrgId: user.currentOrgId,
      permissions: uniquePermissions,
      roles,
      availableOrgs,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  };
}

/**
 * User Organization Service
 *
 * Business logic layer for user-organization relationship management.
 * Handles organization switching, role assignments, and access validation.
 * Enforces security rules around cross-org access and system roles.
 *
 * This is a factory function that creates a service class with optional
 * app-specific hooks for real-time updates and other integrations.
 *
 * @module @jetdevs/core/user-org
 *
 * @example
 * ```typescript
 * // Option 1: Zero-config usage (no hooks)
 * import { UserOrgService } from '@jetdevs/core/user-org';
 *
 * const service = new UserOrgService();
 * const result = await service.getCurrentOrg(userId, currentOrgId, ctx);
 *
 * // Option 2: With custom hooks for real-time updates
 * import { createUserOrgService } from '@jetdevs/core/user-org';
 *
 * const UserOrgServiceWithHooks = createUserOrgService({
 *   hooks: {
 *     broadcastPermissionUpdate: async (userIds) => {
 *       // Notify clients via WebSocket
 *       await websocket.broadcast('permissions:updated', { userIds });
 *     },
 *   },
 * });
 *
 * const service = new UserOrgServiceWithHooks();
 * ```
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { orgs, roles, userRoles, users } from '../../db/schema';
import { createUserOrgRepository, type UserOrgRepositoryConfig } from './user-org.repository';

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Result of getCurrentOrg operation
 */
export interface GetCurrentOrgResult {
  currentOrgId: number | null;
  currentOrg: UserOrganization | undefined;
  availableOrgs: UserOrganization[];
}

/**
 * User's organization with aggregated roles
 */
export interface UserOrganization {
  id: number;
  name: string;
  roles: string[];
  roleCount: number;
}

/**
 * Result of switchOrg operation
 */
export interface SwitchOrgResult {
  success: boolean;
  org: {
    id: number;
    name: string;
  };
  role: {
    id: number;
    name: string;
  };
  sessionRefreshRequired: boolean;
  currentOrgId: number;
}

/**
 * Result of role assignment operation
 */
export interface RoleAssignmentResult {
  success: boolean;
  action: 'assigned' | 'reactivated';
}

/**
 * Available role for assignment with scope information
 */
export interface AvailableRole {
  id: number;
  name: string;
  description: string | null;
  isGlobalRole: boolean;
  isSystemRole: boolean;
  orgId: number | null;
  isActive: boolean;
  scope: 'global' | 'org-specific';
  roleType: 'global' | 'org-specific';
}

/**
 * User role assignment details across organizations
 */
export interface UserRoleAllOrgsResult {
  roleId: number;
  roleName: string;
  roleDescription: string;
  orgId: number;
  orgName: string;
  isActive: boolean;
  assignedAt: Date;
  isGlobalRole: boolean;
  roleType: 'global' | 'org-specific';
}

/**
 * Service context with actor and database
 */
export interface UserOrgServiceContext {
  db: PostgresJsDatabase<any>;
  actor: {
    userId: string;
    orgId?: number;
  };
  orgId?: number;
}

/**
 * Error constructor interface (compatible with TRPCError)
 */
export interface ServiceErrorConstructor {
  new (opts: { code: string; message: string; cause?: unknown }): Error;
}

// =============================================================================
// HOOKS INTERFACE
// =============================================================================

/**
 * Optional hooks for app-specific integrations
 */
export interface UserOrgServiceHooks {
  /**
   * Broadcast permission updates via WebSocket or other mechanism
   * Called after role assignment/removal operations
   */
  broadcastPermissionUpdate?: (userIds: number[]) => Promise<void>;
}

/**
 * Dependencies for the service factory
 */
export interface UserOrgServiceDeps {
  /**
   * Optional hooks for app-specific behavior
   */
  hooks?: UserOrgServiceHooks;

  /**
   * Optional telemetry wrapper function
   * Defaults to a no-op wrapper if not provided
   */
  withTelemetry?: <T>(name: string, fn: () => Promise<T>) => Promise<T>;

  /**
   * Optional audit logging function
   */
  auditLog?: (params: {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string | number;
    orgId?: number | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;

  /**
   * Optional event publishing function
   */
  publishEvent?: (event: string, data: Record<string, unknown>) => Promise<void>;

  /**
   * Optional metric tracking function
   */
  trackMetric?: (
    metric: string,
    type: string,
    options?: { tags?: Record<string, string> }
  ) => Promise<void>;

  /**
   * Error class to throw (defaults to basic Error)
   * Pass TRPCError for tRPC router integration
   */
  ErrorClass?: ServiceErrorConstructor;

  /**
   * Custom repository configuration
   * If not provided, uses SDK's default schema
   */
  repositoryConfig?: Partial<UserOrgRepositoryConfig>;
}

// =============================================================================
// DEFAULT ERROR CLASS
// =============================================================================

/**
 * Default error class when TRPCError is not provided
 */
class ServiceError extends Error {
  code: string;
  cause?: unknown;

  constructor(opts: { code: string; message: string; cause?: unknown }) {
    super(opts.message);
    this.name = 'ServiceError';
    this.code = opts.code;
    this.cause = opts.cause;
  }
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

/**
 * Creates a UserOrgService class with the given dependencies
 *
 * @param deps - Optional dependencies and hooks
 * @returns A UserOrgService class that can be instantiated
 *
 * @example
 * ```typescript
 * // With WebSocket hooks
 * const UserOrgServiceWithHooks = createUserOrgService({
 *   hooks: {
 *     broadcastPermissionUpdate: async (userIds) => {
 *       await broadcastPermissionUpdate(userIds);
 *     },
 *   },
 *   withTelemetry,
 *   auditLog,
 *   publishEvent,
 *   trackMetric,
 *   ErrorClass: TRPCError,
 * });
 * ```
 */
export function createUserOrgService(deps?: UserOrgServiceDeps) {
  const {
    hooks = {},
    withTelemetry = async <T>(_name: string, fn: () => Promise<T>) => fn(),
    auditLog = async () => {},
    publishEvent = async () => {},
    trackMetric = async () => {},
    ErrorClass = ServiceError,
    repositoryConfig,
  } = deps || {};

  // Create repository class with merged config
  const UserOrgRepository = createUserOrgRepository({
    tables: repositoryConfig?.tables || { userRoles, users, roles, orgs },
    withTelemetry: repositoryConfig?.withTelemetry || withTelemetry,
    auditLog: repositoryConfig?.auditLog || auditLog,
    publishEvent: repositoryConfig?.publishEvent || publishEvent,
    trackMetric: repositoryConfig?.trackMetric || trackMetric,
  });

  // Helper function to broadcast permission updates
  // Defined outside class to avoid TS4094 error with exported class expressions
  const broadcastPermissionUpdateFn = async (userIds: number[]): Promise<void> => {
    if (hooks.broadcastPermissionUpdate) {
      try {
        await hooks.broadcastPermissionUpdate(userIds);
        console.log(`Real-time permission update triggered for users:`, userIds);
      } catch (error) {
        console.error(`Error triggering real-time permission update:`, error);
        // Don't fail the main operation if real-time update fails
      }
    }
  };

  return class UserOrgService {
    /**
     * Get current user's organization context
     */
    async getCurrentOrg(
      userId: number,
      currentOrgId: number | null,
      ctx: UserOrgServiceContext
    ): Promise<GetCurrentOrgResult> {
      return withTelemetry('user-org.getCurrentOrg', async () => {
        try {
          // Get all user's organizations
          const userOrgs = await this.getUserOrganizations(userId, ctx);

          // Find current org in the list
          const currentOrg = userOrgs.find((org) => org.id === currentOrgId);

          return {
            currentOrgId,
            currentOrg,
            availableOrgs: userOrgs,
          };
        } catch (error) {
          console.error('Error getting current org:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current organization',
            cause: error,
          });
        }
      });
    }

    /**
     * Get all organizations user has access to
     * Includes special handling for system roles
     */
    async getUserOrganizations(
      userId: number,
      ctx: UserOrgServiceContext
    ): Promise<UserOrganization[]> {
      return withTelemetry('user-org.getUserOrganizations', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);

          // Get user's organizations from userRoles table
          const userOrgsData = await repo.getUserRoleAssignments(userId);

          // Group by organization and aggregate roles
          const orgMap = new Map<number, UserOrganization>();
          let hasSystemRole = false;

          userOrgsData.forEach((ur: any) => {
            // Skip any malformed assignments without an orgId
            if (ur.orgId === null || ur.orgId === undefined) {
              return;
            }

            // Check for system roles (orgId = -1)
            if (ur.orgId === -1) {
              // User has a system role (like Super User)
              if (ur.role?.isSystemRole) {
                hasSystemRole = true;
              }
              return;
            }

            if (!orgMap.has(ur.orgId)) {
              orgMap.set(ur.orgId, {
                id: ur.orgId,
                name:
                  (ur.org?.name ?? '').trim() ||
                  (typeof ur.orgId === 'number'
                    ? `Organization ${ur.orgId}`
                    : 'Organization'),
                roles: [],
                roleCount: 0,
              });
            }
            const orgData = orgMap.get(ur.orgId);
            if (orgData) {
              orgData.roles.push(ur.role?.name || 'Unknown Role');
              orgData.roleCount++;
            }
          });

          // If user has a system role, they should see ALL organizations
          if (hasSystemRole) {
            // Get all active organizations for system role users
            const allOrgs = await repo.getAllActiveOrgs();

            // Add or update all organizations to the list for system role users
            allOrgs.forEach((org: any) => {
              if (orgMap.has(org.id)) {
                // User already has roles in this org, add system role indicator
                const existingOrg = orgMap.get(org.id);
                if (
                  existingOrg &&
                  !existingOrg.roles.includes('System Role Access')
                ) {
                  existingOrg.roles.push('System Role Access');
                  existingOrg.roleCount++;
                }
              } else {
                // Add org that user doesn't have direct roles in
                orgMap.set(org.id, {
                  id: org.id,
                  name: org.name,
                  roles: ['System Role Access'],
                  roleCount: 1,
                });
              }
            });
          }

          return Array.from(orgMap.values());
        } catch (error) {
          console.error('Error getting user organizations:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get user organizations',
            cause: error,
          });
        }
      });
    }

    /**
     * Switch user's current organization
     * Validates access and updates user record
     */
    async switchOrg(
      userId: number,
      targetOrgId: number,
      ctx: UserOrgServiceContext
    ): Promise<SwitchOrgResult> {
      return withTelemetry('user-org.switchOrg', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);

          // First check if user has a system role
          const systemRole = await repo.getUserSystemRole(userId);

          let hasAccess = false;
          let userRole = null;

          if (systemRole && (systemRole.role as any)?.isSystemRole) {
            // System role users have access to ALL organizations
            hasAccess = true;
            // Get the target org info
            const targetOrg = await repo.getOrgById(targetOrgId);

            if (targetOrg) {
              userRole = {
                org: targetOrg,
                role: systemRole.role,
              };
            }
          } else {
            // Check for direct role assignment in the target org
            userRole = await repo.getUserRoleInOrg(userId, targetOrgId);

            hasAccess = !!userRole;
          }

          if (!hasAccess || !userRole) {
            throw new ErrorClass({
              code: 'FORBIDDEN',
              message: 'You do not have access to this organization',
            });
          }

          // Update user's currentOrgId
          await repo.updateUserCurrentOrg(userId, targetOrgId);

          // Validate we have required data
          if (!userRole || !userRole.org || !userRole.role) {
            throw new ErrorClass({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to retrieve organization or role information',
            });
          }

          const result = {
            success: true,
            org: {
              id: (userRole.org as any).id,
              name: (userRole.org as any).name,
            },
            role: {
              id: (userRole.role as any).id,
              name: (userRole.role as any).name,
            },
            sessionRefreshRequired: true,
            currentOrgId: targetOrgId,
          };

          // Audit log
          await auditLog({
            action: 'update',
            entityType: 'user_org_switch',
            entityId: String(userId),
            userId: ctx.actor.userId,
            orgId: targetOrgId,
            metadata: {
              previousOrgId: ctx.orgId,
              newOrgId: targetOrgId,
              orgName: result.org.name,
              roleName: result.role.name,
            },
          });

          // Domain event
          await publishEvent('user.org.switched', {
            userId,
            previousOrgId: ctx.orgId,
            newOrgId: targetOrgId,
            orgName: result.org.name,
            timestamp: new Date(),
          });

          // Business metric
          await trackMetric('user.org.switch', 'counter', {
            tags: {
              fromOrgId: String(ctx.orgId),
              toOrgId: String(targetOrgId),
            },
          });

          return result;
        } catch (error) {
          console.error('Error switching org:', error);

          if ((error as any)?.code) {
            throw error;
          }

          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to switch org',
          });
        }
      });
    }

    /**
     * Assign role to user in organization
     * Validates role type and organization compatibility
     */
    async assignRole(
      userId: number,
      orgId: number,
      roleId: number,
      assignedBy: number,
      ctx: UserOrgServiceContext
    ): Promise<RoleAssignmentResult> {
      return withTelemetry('user-org.assignRole', async () => {
        const repo = new UserOrgRepository(ctx.db);

        // CRITICAL: Validate role can be assigned to this org
        const role = await repo.getRoleById(roleId);

        if (!role) {
          throw new ErrorClass({
            code: 'NOT_FOUND',
            message: 'Role not found or inactive',
          });
        }

        // Determine the orgId to use for the assignment based on role type
        // Role assignment validation based on RBAC hierarchy:
        // - System roles (isSystemRole=true): Assigned with orgId=null (visible to all orgs through RLS)
        // - Global roles (isGlobalRole=true, orgId=null): Can be assigned to any org
        // - Org-specific roles (orgId=specific): Can only be assigned within that org
        let assignmentOrgId: number | null;

        if (role.isSystemRole) {
          // System roles are assigned with orgId = null so they're visible through RLS
          assignmentOrgId = null;
        } else if (role.isGlobalRole) {
          // Global roles can be assigned to any org
          assignmentOrgId = orgId;
        } else {
          // Org-specific roles must match their designated org
          if (role.orgId !== null && role.orgId !== orgId) {
            throw new ErrorClass({
              code: 'FORBIDDEN',
              message: 'This role can only be assigned within its own organization',
            });
          }
          assignmentOrgId = orgId;
        }

        // Check if assignment already exists
        const existingAssignment = await repo.findRoleAssignment(
          userId,
          roleId,
          assignmentOrgId
        );

        if (existingAssignment) {
          // If exists but inactive, reactivate it
          if (!existingAssignment.isActive) {
            await repo.reactivateRoleAssignment(userId, roleId, assignmentOrgId);

            // Trigger real-time permission updates
            await broadcastPermissionUpdateFn([userId]);

            return { success: true, action: 'reactivated' };
          } else {
            throw new ErrorClass({
              code: 'CONFLICT',
              message: 'User already has this role assigned',
            });
          }
        }

        try {
          console.log('[assignRole] Attempting to insert:', {
            userId,
            orgId: assignmentOrgId,
            roleId,
            isActive: true,
            assignedBy,
            role: {
              name: role.name,
              isSystemRole: role.isSystemRole,
              isGlobalRole: role.isGlobalRole,
            },
          });

          await repo.createRoleAssignment({
            userId,
            orgId: assignmentOrgId,
            roleId,
            assignedBy,
          });

          console.log('[assignRole] Role assignment successful');

          // Audit log
          await auditLog({
            action: 'create',
            entityType: 'user_role_assignment',
            entityId: `${userId}-${assignmentOrgId ?? 'system'}-${roleId}`,
            userId: assignedBy,
            orgId: assignmentOrgId ?? ctx.orgId, // Use current org for system role audit context
            metadata: {
              targetUserId: userId,
              roleId,
              roleName: role.name,
              assignedBy,
              isSystemRole: role.isSystemRole,
              assignmentOrgId: assignmentOrgId ?? 'null',
            },
          });

          // Domain event
          await publishEvent('role.assigned', {
            userId,
            orgId: assignmentOrgId,
            roleId,
            roleName: role.name,
            assignedBy,
            isSystemRole: role.isSystemRole,
            timestamp: new Date(),
          });

          // Business metric
          await trackMetric('user.role.assigned', 'counter', {
            tags: {
              roleId: String(roleId),
              roleName: role.name,
              orgId: assignmentOrgId !== null ? String(assignmentOrgId) : 'system',
              isSystemRole: String(role.isSystemRole),
            },
          });

          // Trigger real-time permission updates
          await broadcastPermissionUpdateFn([userId]);

          return { success: true, action: 'assigned' };
        } catch (error) {
          console.error('[assignRole] Error assigning role:', {
            error,
            errorMessage: error instanceof Error ? error.message : String(error),
            userId,
            assignmentOrgId,
            roleId,
            assignedBy,
          });
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to assign role: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          });
        }
      });
    }

    /**
     * Remove role from user in organization
     */
    async removeRole(
      userId: number,
      orgId: number,
      roleId: number,
      ctx: UserOrgServiceContext
    ): Promise<{ success: boolean }> {
      return withTelemetry('user-org.removeRole', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);

          // Support both org-scoped roles (orgId matches) and system roles (orgId IS NULL)
          const deleted = await repo.deleteRoleAssignment(userId, roleId, orgId);

          if (!deleted) {
            throw new ErrorClass({
              code: 'NOT_FOUND',
              message: 'Role assignment not found',
            });
          }

          // Audit log
          await auditLog({
            action: 'delete',
            entityType: 'user_role_assignment',
            entityId: `${userId}-${orgId}-${roleId}`,
            userId: ctx.actor.userId,
            orgId,
            metadata: {
              targetUserId: userId,
              roleId,
              removedBy: ctx.actor.userId,
            },
          });

          // Domain event
          await publishEvent('role.removed', {
            userId,
            orgId,
            roleId,
            removedBy: ctx.actor.userId,
            timestamp: new Date(),
          });

          // Business metric
          await trackMetric('user.role.removed', 'counter', {
            tags: {
              roleId: String(roleId),
              orgId: String(orgId),
            },
          });

          // Trigger real-time permission updates
          await broadcastPermissionUpdateFn([userId]);

          return { success: true };
        } catch (error) {
          console.error('Error removing role:', error);

          if ((error as any)?.code) {
            throw error;
          }

          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to remove role',
            cause: error,
          });
        }
      });
    }

    /**
     * Validate user has access to specific organization
     */
    async validateOrgAccess(
      userId: number,
      orgId: number,
      ctx: UserOrgServiceContext
    ): Promise<{ hasAccess: boolean }> {
      return withTelemetry('user-org.validateOrgAccess', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);

          // Check system role first
          const systemRole = await repo.getUserSystemRole(userId);

          if (systemRole && (systemRole.role as any)?.isSystemRole) {
            return { hasAccess: true };
          }

          // Check direct org assignment
          const userRole = await repo.getUserRoleInOrg(userId, orgId);

          return { hasAccess: !!userRole };
        } catch (error) {
          console.error('Error validating org access:', error);
          return { hasAccess: false };
        }
      });
    }

    /**
     * Get user's permissions in their current organization
     */
    async getUserOrgPermissions(
      userId: number,
      currentOrgId: number | null,
      ctx: UserOrgServiceContext
    ) {
      return withTelemetry('user-org.getUserOrgPermissions', async () => {
        try {
          if (!currentOrgId) {
            return {
              orgId: null,
              permissions: [],
            };
          }

          const repo = new UserOrgRepository(ctx.db);

          // Get user's roles and permissions in current org
          const permissions = await repo.getUserPermissionsInOrg(
            userId,
            currentOrgId
          );

          return {
            orgId: currentOrgId,
            permissions,
          };
        } catch (error) {
          console.error('Error getting user org permissions:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get user permissions',
            cause: error,
          });
        }
      });
    }

    /**
     * Get users by role ID (org-scoped)
     */
    async getUsersByRole(
      roleId: number,
      currentOrgId: number,
      ctx: UserOrgServiceContext
    ) {
      return withTelemetry('user-org.getUsersByRole', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);
          return repo.getUsersByRoleInOrg(roleId, currentOrgId);
        } catch (error) {
          console.error('Error getting users by role:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get users for this role',
            cause: error,
          });
        }
      });
    }

    /**
     * Get available roles for an organization
     * Returns global roles + org-specific roles for this org only
     */
    async getAvailableRoles(
      orgId: number,
      ctx: UserOrgServiceContext
    ): Promise<AvailableRole[]> {
      return withTelemetry('user-org.getAvailableRoles', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);
          const availableRoles = await repo.getAvailableRolesForOrg(orgId);

          return availableRoles.map((role: any) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            isGlobalRole: role.isGlobalRole,
            isSystemRole: role.isSystemRole,
            orgId: role.orgId,
            isActive: role.isActive,
            scope: role.isGlobalRole ? 'global' : 'org-specific',
            roleType: role.isGlobalRole ? 'global' : 'org-specific',
          }));
        } catch (error) {
          console.error('Error getting available roles:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get available roles',
          });
        }
      });
    }

    /**
     * Get all organizations that a user can be assigned to
     * (All active organizations in the system)
     */
    async getAssignableOrganizations(ctx: UserOrgServiceContext) {
      return withTelemetry('user-org.getAssignableOrganizations', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);
          return repo.getAssignableOrganizations();
        } catch (error) {
          console.error('Error getting assignable organizations:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get assignable organizations',
            cause: error,
          });
        }
      });
    }

    /**
     * Get user's roles across all organizations
     */
    async getUserRolesAllOrgs(
      userId: number,
      ctx: UserOrgServiceContext
    ): Promise<UserRoleAllOrgsResult[]> {
      return withTelemetry('user-org.getUserRolesAllOrgs', async () => {
        try {
          const repo = new UserOrgRepository(ctx.db);
          const userRolesData = await repo.getUserRolesAllOrgs(userId);

          // Transform the data to include role type information
          return userRolesData.map((ur: any) => ({
            roleId: ur.roleId,
            roleName: ur.role?.name || 'Unknown Role',
            roleDescription: ur.role?.description || '',
            orgId: ur.orgId,
            orgName: ur.org?.name || 'Unknown Organization',
            isActive: ur.isActive,
            assignedAt: ur.assignedAt,
            isGlobalRole: ur.role?.isGlobalRole || false,
            roleType: ur.role?.isGlobalRole ? 'global' : 'org-specific',
          }));
        } catch (error) {
          console.error('Error getting user roles across orgs:', error);
          throw new ErrorClass({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get user roles across organizations',
            cause: error,
          });
        }
      });
    }

  };
}

// =============================================================================
// PRE-BUILT SERVICE (Zero-config usage)
// =============================================================================

/**
 * Pre-built UserOrgService class
 *
 * Uses SDK's default schema and no hooks.
 * For apps that don't need custom integrations.
 *
 * @example
 * ```typescript
 * import { UserOrgService } from '@jetdevs/core/user-org';
 *
 * const service = new UserOrgService();
 * const result = await service.getCurrentOrg(userId, currentOrgId, ctx);
 * ```
 */
export const UserOrgService = createUserOrgService();

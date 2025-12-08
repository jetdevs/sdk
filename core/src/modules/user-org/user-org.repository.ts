/**
 * User Organization Repository
 *
 * Data access layer for user-organization relationship management.
 * Handles all database operations for:
 * - User organization assignments
 * - Role assignments across organizations
 * - Organization access validation
 * - Cross-org permission queries
 *
 * This is a generic repository factory that can be configured with
 * app-specific schema and telemetry providers.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, eq, or, isNull, asc, sql } from 'drizzle-orm';
import type {
  UserRoleData,
  UserOrgContext,
  UserOrgData,
  UserOrgMembership,
  UserOrgPermission,
  OrgUser,
  AssignableRole,
  AssignableOrganization,
  UserRoleAllOrgs,
  CreateRoleAssignmentInput,
} from './types';

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Configuration for UserOrgRepository
 */
export interface UserOrgRepositoryConfig {
  /**
   * Table references from schema
   */
  tables: {
    userRoles: any;
    users: any;
    roles: any;
    orgs: any;
  };

  /**
   * Optional telemetry wrapper function
   */
  withTelemetry?: <T>(
    name: string,
    fn: () => Promise<T>
  ) => Promise<T>;

  /**
   * Optional audit logging function
   */
  auditLog?: (params: {
    action: string;
    entityType: string;
    entityId: string;
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
}

/**
 * Creates a UserOrgRepository instance with the given configuration
 */
export function createUserOrgRepository(
  config: UserOrgRepositoryConfig
) {
  const {
    tables,
    withTelemetry = async <T>(_name: string, fn: () => Promise<T>) => fn(),
    auditLog = async () => {},
    publishEvent = async () => {},
    trackMetric = async () => {},
  } = config;

  const { userRoles, users, roles, orgs } = tables;

  return class UserOrgRepository {
    public db: PostgresJsDatabase<any>;

    constructor(db: PostgresJsDatabase<any>) {
      this.db = db;
    }

    /**
     * Get user's current organization context
     */
    async getCurrentOrg(
      userId: number,
      currentOrgId: number | null
    ): Promise<UserOrgContext | null> {
      return withTelemetry('user-org-repo.getCurrentOrg', async () => {
        if (!currentOrgId) {
          // Find first available org for user
          const firstRole = await (this.db as any).query.userRoles.findFirst({
            where: and(
              eq(userRoles.userId, userId),
              eq(userRoles.isActive, true)
            ),
            with: {
              org: true,
              role: true,
            },
            orderBy: [asc(userRoles.assignedAt)],
          });

          if (!firstRole || !firstRole.org) return null;

          return {
            orgId: firstRole.org.id,
            orgName: firstRole.org.name,
            roles: [{ id: firstRole.role.id, name: firstRole.role.name }],
          };
        }

        // Get all roles for user in current org
        const userOrgRoles = await (this.db as any).query.userRoles.findMany({
          where: and(
            eq(userRoles.userId, userId),
            eq(userRoles.orgId, currentOrgId),
            eq(userRoles.isActive, true)
          ),
          with: {
            org: true,
            role: true,
          },
        });

        if (userOrgRoles.length === 0 || !userOrgRoles[0].org) return null;

        return {
          orgId: userOrgRoles[0].org.id,
          orgName: userOrgRoles[0].org.name,
          roles: userOrgRoles.map((ur: any) => ({
            id: ur.role.id,
            name: ur.role.name,
          })),
        };
      });
    }

    /**
     * Get all organizations a user has access to
     * Returns aggregated organization data with roles grouped per org
     * Format: { id, name, roles: string[], roleCount }
     */
    async getUserOrganizations(userId: number): Promise<UserOrgData[]> {
      return withTelemetry('user-org-repo.getUserOrganizations', async () => {
        const userOrgRoles = await (this.db as any).query.userRoles.findMany({
          where: and(
            eq(userRoles.userId, userId),
            eq(userRoles.isActive, true)
          ),
          with: {
            org: true,
            role: true,
          },
        });

        // Filter out null orgs and system roles (orgId null or -1)
        const validRoles = userOrgRoles.filter(
          (ur: any) =>
            ur.org !== null && ur.orgId !== null && ur.orgId !== -1
        );

        // Aggregate roles by organization
        const orgMap = new Map<number, { id: number; name: string; roles: string[] }>();

        for (const ur of validRoles) {
          const orgId = ur.org?.id ?? 0;
          const orgName = ur.org?.name ?? 'Unknown';
          const roleName = ur.role?.name ?? 'Unknown';

          if (orgMap.has(orgId)) {
            const existing = orgMap.get(orgId)!;
            if (!existing.roles.includes(roleName)) {
              existing.roles.push(roleName);
            }
          } else {
            orgMap.set(orgId, {
              id: orgId,
              name: orgName,
              roles: [roleName],
            });
          }
        }

        // Convert to array with roleCount
        return Array.from(orgMap.values()).map(org => ({
          id: org.id,
          name: org.name,
          roles: org.roles,
          roleCount: org.roles.length,
        }));
      });
    }

    /**
     * Validate user has access to organization
     */
    async validateOrgAccess(userId: number, orgId: number): Promise<boolean> {
      const role = await (this.db as any).query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, userId),
          eq(userRoles.orgId, orgId),
          eq(userRoles.isActive, true)
        ),
      });

      return !!role;
    }

    /**
     * Switch user's current organization
     */
    async switchOrg(
      userId: number,
      newOrgId: number,
      _actorUserId?: string
    ): Promise<{ success: boolean }> {
      return withTelemetry('user-org-repo.switchOrg', async () => {
        await this.db
          .update(users)
          .set({ currentOrgId: newOrgId, updatedAt: new Date() })
          .where(eq(users.id, userId));

        await publishEvent('user.current_org.updated', {
          userId,
          newOrgId,
          timestamp: new Date(),
        });

        await trackMetric('user.current_org.updated', 'counter', {
          tags: {
            userId: String(userId),
            orgId: String(newOrgId),
          },
        });

        return { success: true };
      });
    }

    /**
     * Get all user's role assignments
     */
    async getUserRoleAssignments(userId: number): Promise<UserRoleData[]> {
      return withTelemetry('user-org-repo.getUserRoleAssignments', async () => {
        const userOrgsData = await (this.db as any).query.userRoles.findMany({
          where: and(
            eq(userRoles.userId, userId),
            eq(userRoles.isActive, true)
          ),
          with: {
            org: true,
            role: true,
          },
        });

        return userOrgsData as UserRoleData[];
      });
    }

    /**
     * Get all active organizations (for system role users)
     */
    async getAllActiveOrgs(): Promise<any[]> {
      return withTelemetry('user-org-repo.getAllActiveOrgs', async () => {
        return (this.db as any).query.orgs.findMany({
          where: eq(orgs.isActive, true),
        });
      });
    }

    /**
     * Check if user has a system role
     */
    async getUserSystemRole(userId: number): Promise<any | null> {
      return withTelemetry('user-org-repo.getUserSystemRole', async () => {
        const systemRole = await (this.db as any).query.userRoles.findFirst({
          where: and(
            eq(userRoles.userId, userId),
            isNull(userRoles.orgId),
            eq(userRoles.isActive, true)
          ),
          with: {
            role: true,
          },
        });

        return systemRole || null;
      });
    }

    /**
     * Get user's role in a specific organization
     */
    async getUserRoleInOrg(
      userId: number,
      orgId: number
    ): Promise<any | null> {
      return withTelemetry('user-org-repo.getUserRoleInOrg', async () => {
        const userRole = await (this.db as any).query.userRoles.findFirst({
          where: and(
            eq(userRoles.userId, userId),
            eq(userRoles.orgId, orgId),
            eq(userRoles.isActive, true)
          ),
          with: {
            org: true,
            role: true,
          },
        });

        return userRole || null;
      });
    }

    /**
     * Get organization by ID
     */
    async getOrgById(orgId: number): Promise<any | null> {
      return withTelemetry('user-org-repo.getOrgById', async () => {
        const org = await (this.db as any).query.orgs.findFirst({
          where: eq(orgs.id, orgId),
        });

        return org || null;
      });
    }

    /**
     * Update user's current organization
     */
    async updateUserCurrentOrg(userId: number, orgId: number): Promise<void> {
      return withTelemetry('user-org-repo.updateUserCurrentOrg', async () => {
        await this.db
          .update(users)
          .set({
            currentOrgId: orgId,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        await publishEvent('user.current_org.updated', {
          userId,
          newOrgId: orgId,
          timestamp: new Date(),
        });

        await trackMetric('user.current_org.updated', 'counter', {
          tags: {
            userId: String(userId),
            orgId: String(orgId),
          },
        });
      });
    }

    /**
     * Get role by ID
     */
    async getRoleById(roleId: number): Promise<any | null> {
      return withTelemetry('user-org-repo.getRoleById', async () => {
        const role = await (this.db as any).query.roles.findFirst({
          where: and(eq(roles.id, roleId), eq(roles.isActive, true)),
        });

        return role || null;
      });
    }

    /**
     * Check if role assignment exists
     */
    async findRoleAssignment(
      userId: number,
      roleId: number,
      orgId: number | null
    ): Promise<any | null> {
      return withTelemetry('user-org-repo.findRoleAssignment', async () => {
        const whereConditions = [
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
        ];

        if (orgId === null) {
          whereConditions.push(isNull(userRoles.orgId));
        } else {
          whereConditions.push(eq(userRoles.orgId, orgId));
        }

        const result = await this.db
          .select()
          .from(userRoles)
          .where(and(...whereConditions))
          .limit(1);

        return result[0] || null;
      });
    }

    /**
     * Reactivate existing role assignment
     */
    async reactivateRoleAssignment(
      userId: number,
      roleId: number,
      orgId: number | null
    ): Promise<void> {
      return withTelemetry(
        'user-org-repo.reactivateRoleAssignment',
        async () => {
          const whereConditions = [
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleId),
          ];

          if (orgId === null) {
            whereConditions.push(isNull(userRoles.orgId));
          } else {
            whereConditions.push(eq(userRoles.orgId, orgId));
          }

          await this.db
            .update(userRoles)
            .set({
              isActive: true,
              updatedAt: new Date(),
            })
            .where(and(...whereConditions));

          await auditLog({
            action: 'update',
            entityType: 'user_role_assignment',
            entityId: `${userId}-${orgId ?? 'system'}-${roleId}`,
            metadata: {
              action: 'reactivated',
              userId,
              roleId,
              orgId: orgId ?? 'system',
            },
          });
        }
      );
    }

    /**
     * Create new role assignment
     */
    async createRoleAssignment(data: CreateRoleAssignmentInput): Promise<void> {
      return withTelemetry('user-org-repo.createRoleAssignment', async () => {
        await this.db.insert(userRoles).values({
          userId: data.userId,
          orgId: data.orgId,
          roleId: data.roleId,
          isActive: true,
          assignedBy: data.assignedBy,
        });
      });
    }

    /**
     * Delete role assignment
     */
    async deleteRoleAssignment(
      userId: number,
      roleId: number,
      orgId: number
    ): Promise<boolean> {
      return withTelemetry('user-org-repo.deleteRoleAssignment', async () => {
        const deletedAssignment = await this.db
          .delete(userRoles)
          .where(
            and(
              eq(userRoles.userId, userId),
              or(eq(userRoles.orgId, orgId), isNull(userRoles.orgId)),
              eq(userRoles.roleId, roleId)
            )
          )
          .returning();

        return deletedAssignment.length > 0;
      });
    }

    /**
     * Get user's permissions in an organization
     */
    async getUserPermissionsInOrg(
      userId: number,
      orgId: number
    ): Promise<UserOrgPermission[]> {
      return withTelemetry(
        'user-org-repo.getUserPermissionsInOrg',
        async () => {
          const userRolesData = await (this.db as any).query.userRoles.findMany({
            where: and(
              eq(userRoles.userId, userId),
              eq(userRoles.orgId, orgId),
              eq(userRoles.isActive, true)
            ),
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

          const permissions = userRolesData.flatMap((userRole: any) =>
            (userRole.role?.rolePermissions || []).map((rp: any) => ({
              slug: rp.permission?.slug,
              name: rp.permission?.name,
              description: rp.permission?.description,
              category: rp.permission?.category,
            }))
          );

          // Remove duplicates
          return permissions.filter(
            (permission: UserOrgPermission, index: number, self: UserOrgPermission[]) =>
              index === self.findIndex((p: UserOrgPermission) => p.slug === permission.slug)
          );
        }
      );
    }

    /**
     * Get users by role in organization
     */
    async getUsersByRoleInOrg(
      roleId: number,
      orgId: number
    ): Promise<OrgUser[]> {
      return withTelemetry('user-org-repo.getUsersByRoleInOrg', async () => {
        const usersWithRole = await this.db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            isActive: users.isActive,
          })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(
            and(
              eq(userRoles.roleId, roleId),
              eq(userRoles.orgId, orgId),
              eq(userRoles.isActive, true),
              eq(users.isActive, true)
            )
          )
          .orderBy(users.name);

        return usersWithRole;
      });
    }

    /**
     * Get available roles for an organization
     * Returns global roles + org-specific roles for this org only
     */
    async getAvailableRolesForOrg(orgId: number): Promise<AssignableRole[]> {
      return withTelemetry(
        'user-org-repo.getAvailableRolesForOrg',
        async () => {
          const availableRoles = await this.db
            .select()
            .from(roles)
            .where(
              and(
                eq(roles.isActive, true),
                or(
                  eq(roles.orgId, orgId),
                  and(
                    eq(roles.isGlobalRole, true),
                    isNull(roles.orgId),
                    eq(roles.isSystemRole, false)
                  )
                )
              )
            )
            .orderBy(
              asc(sql`CASE WHEN ${roles.orgId} IS NULL THEN 0 ELSE 1 END`),
              asc(roles.name)
            );

          return availableRoles as AssignableRole[];
        }
      );
    }

    /**
     * Get all assignable organizations (all active orgs)
     */
    async getAssignableOrganizations(): Promise<AssignableOrganization[]> {
      return withTelemetry(
        'user-org-repo.getAssignableOrganizations',
        async () => {
          const organizations = await this.db
            .select({
              id: orgs.id,
              name: orgs.name,
              slug: orgs.slug,
              description: orgs.description,
              isActive: orgs.isActive,
            })
            .from(orgs)
            .where(eq(orgs.isActive, true))
            .orderBy(asc(orgs.name));

          return organizations as AssignableOrganization[];
        }
      );
    }

    /**
     * Get user's roles across all organizations
     */
    async getUserRolesAllOrgs(userId: number): Promise<UserRoleAllOrgs[]> {
      return withTelemetry('user-org-repo.getUserRolesAllOrgs', async () => {
        const userRolesData = await (this.db as any).query.userRoles.findMany({
          where: and(
            eq(userRoles.userId, userId),
            eq(userRoles.isActive, true)
          ),
          with: {
            org: true,
            role: true,
          },
        });

        return userRolesData as UserRoleAllOrgs[];
      });
    }
  };
}

/**
 * User-Organization Module
 *
 * Core SDK module for managing user-organization relationships.
 * Provides types, schemas, repository factory, and router configuration
 * for handling multi-tenant user assignments.
 *
 * @example
 * ```ts
 * // In your app, create the repository with your schema
 * import { createUserOrgRepository } from '@jetdevs/core/user-org';
 * import * as schema from '@/db/schema';
 *
 * const UserOrgRepository = createUserOrgRepository({
 *   schema,
 *   tables: {
 *     userRoles: schema.userRoles,
 *     users: schema.users,
 *     roles: schema.roles,
 *     orgs: schema.orgs,
 *   },
 *   withTelemetry: myTelemetryWrapper,
 * });
 *
 * // Then use it in your router
 * const repo = new UserOrgRepository(db);
 * const currentOrg = await repo.getCurrentOrg(userId, orgId);
 * ```
 */

// Types
export type {
    AssignableOrganization, AssignableRole, CreateRoleAssignmentInput, OrgUser, OrganizationInfo, RoleAssignmentData, RoleInfo, RoleAssignmentResult as TypesRoleAssignmentResult, UserOrgContext, UserOrgData, UserOrgMembership,
    UserOrgPermission, UserRoleAllOrgs, UserRoleData
} from './types';

// Schemas
export {
    assignRoleSchema, assignableOrganizationSchema, assignableRoleSchema, getAvailableRolesSchema,
    // Input schemas
    getCurrentOrgSchema, getUserRolesAllOrgsSchema, getUsersByRoleSchema, orgAccessResultSchema, orgUserSchema, removeRoleSchema, roleAssignmentResultSchema, switchOrgResultSchema, switchOrgSchema,
    // Output schemas
    userOrgContextSchema,
    userOrgMembershipSchema, userOrgPermissionSchema, validateOrgAccessSchema
} from './schemas';

export type {
    AssignRoleInput, GetAvailableRolesInput, GetCurrentOrgInput, GetUserRolesAllOrgsInput, GetUsersByRoleInput, OrgAccessResult, RemoveRoleInput, RoleAssignmentResultOutput, SwitchOrgResult as SchemaSwitchOrgResult, SwitchOrgInput, UserOrgContextOutput,
    UserOrgMembershipOutput, ValidateOrgAccessInput
} from './schemas';

// Repository
export {
    createUserOrgRepository
} from './user-org.repository';

export type {
    UserOrgRepositoryConfig
} from './user-org.repository';

// Router Config
export {
    SDKUserOrgRepository, createUserOrgRouterConfig,
    userOrgRouterConfig
} from './user-org.router-config';

export type {
    TRPCErrorConstructor, UserOrgRouterConfig, UserOrgRouterContext, UserOrgRouterFactoryDeps, UserOrgServiceContext as UserOrgRouterServiceContext
} from './user-org.router-config';

// Service
export {
    UserOrgService, createUserOrgService
} from './service';

export type {
    GetCurrentOrgResult, AvailableRole as ServiceAvailableRole, ServiceErrorConstructor, RoleAssignmentResult as ServiceRoleAssignmentResult, SwitchOrgResult as ServiceSwitchOrgResult, UserOrgServiceContext, UserOrgServiceDeps, UserOrgServiceHooks, UserOrganization, UserRoleAllOrgsResult
} from './service';


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
 * import { createUserOrgRepository } from '@yobolabs/core/user-org';
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
  UserRoleData,
  OrganizationInfo,
  RoleInfo,
  UserOrgData,
  RoleAssignmentData,
  UserOrgContext,
  UserOrgMembership,
  UserOrgPermission,
  OrgUser,
  AssignableRole,
  AssignableOrganization,
  UserRoleAllOrgs,
  RoleAssignmentResult as TypesRoleAssignmentResult,
  CreateRoleAssignmentInput,
} from './types';

// Schemas
export {
  // Input schemas
  getCurrentOrgSchema,
  switchOrgSchema,
  validateOrgAccessSchema,
  assignRoleSchema,
  removeRoleSchema,
  getUsersByRoleSchema,
  getAvailableRolesSchema,
  getUserRolesAllOrgsSchema,
  // Output schemas
  userOrgContextSchema,
  userOrgMembershipSchema,
  switchOrgResultSchema,
  roleAssignmentResultSchema,
  orgAccessResultSchema,
  userOrgPermissionSchema,
  orgUserSchema,
  assignableRoleSchema,
  assignableOrganizationSchema,
} from './schemas';

export type {
  GetCurrentOrgInput,
  SwitchOrgInput,
  ValidateOrgAccessInput,
  AssignRoleInput,
  RemoveRoleInput,
  GetUsersByRoleInput,
  GetAvailableRolesInput,
  GetUserRolesAllOrgsInput,
  UserOrgContextOutput,
  UserOrgMembershipOutput,
  SwitchOrgResult as SchemaSwitchOrgResult,
  RoleAssignmentResultOutput,
  OrgAccessResult,
} from './schemas';

// Repository
export {
  createUserOrgRepository,
} from './user-org.repository';

export type {
  UserOrgRepositoryConfig,
} from './user-org.repository';

// Router Config
export {
  createUserOrgRouterConfig,
  userOrgRouterConfig,
  SDKUserOrgRepository,
} from './user-org.router-config';

export type {
  UserOrgRouterContext,
  UserOrgServiceContext as UserOrgRouterServiceContext,
  UserOrgRouterConfig,
  UserOrgRouterFactoryDeps,
  TRPCErrorConstructor,
} from './user-org.router-config';

// Service
export {
  createUserOrgService,
  UserOrgService,
} from './service';

export type {
  GetCurrentOrgResult,
  UserOrganization,
  SwitchOrgResult as ServiceSwitchOrgResult,
  RoleAssignmentResult as ServiceRoleAssignmentResult,
  AvailableRole as ServiceAvailableRole,
  UserRoleAllOrgsResult,
  UserOrgServiceContext,
  ServiceErrorConstructor,
  UserOrgServiceHooks,
  UserOrgServiceDeps,
} from './service';

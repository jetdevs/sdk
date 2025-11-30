/**
 * Role Type Detection Utilities
 *
 * System user detection utilities for RBAC.
 * These help with role type detection without hardcoding role names.
 *
 * @module @yobolabs/core/rbac
 */

// =============================================================================
// ROLE TYPE CHECKS
// =============================================================================

/**
 * Check if a user has system-level access based on their permissions
 * @param permissions Array of permission slugs the user has
 * @returns true if user has any admin:* permissions
 *
 * @example
 * ```typescript
 * if (hasSystemAccess(user.permissions)) {
 *   // User has admin access
 * }
 * ```
 */
export function hasSystemAccess(permissions: string[]): boolean {
  return permissions.some((perm) => perm.startsWith("admin:"));
}

/**
 * Check if a role is a system role based on its flags
 * @param role Role object with isSystemRole flag
 * @returns true if role has isSystemRole: true
 *
 * @example
 * ```typescript
 * if (isSystemRole(role)) {
 *   // Role is a system role
 * }
 * ```
 */
export function isSystemRole(role: { isSystemRole?: boolean }): boolean {
  return role.isSystemRole === true;
}

/**
 * Check if a role is a global role (available across all orgs)
 * @param role Role object with isGlobalRole flag
 * @returns true if role has isGlobalRole: true
 *
 * @example
 * ```typescript
 * if (isGlobalRole(role)) {
 *   // Role is available to all organizations
 * }
 * ```
 */
export function isGlobalRole(role: { isGlobalRole?: boolean }): boolean {
  return role.isGlobalRole === true;
}

/**
 * Check if a role is org-specific (belongs to a specific org)
 * @param role Role object with orgId
 * @returns true if role has a specific orgId (not null)
 *
 * @example
 * ```typescript
 * if (isOrgSpecificRole(role)) {
 *   // Role belongs to a specific organization
 * }
 * ```
 */
export function isOrgSpecificRole(role: {
  orgId?: number | null;
}): boolean {
  return role.orgId !== null && role.orgId !== undefined;
}

/**
 * Check if user has platform system role based on their roles
 * @param roles Array of role objects with isSystemRole flag
 * @returns true if any role has isSystemRole: true
 *
 * @example
 * ```typescript
 * if (hasPlatformSystemRole(user.roles)) {
 *   // User has at least one system role
 * }
 * ```
 */
export function hasPlatformSystemRole(
  roles: Array<{ isSystemRole?: boolean }>
): boolean {
  return roles.some((role) => role.isSystemRole === true);
}

/**
 * Check if user should have backoffice access
 * Based on either:
 * 1. Having admin:* permissions
 * 2. Having a role with isSystemRole: true
 *
 * @param permissions Array of permission slugs
 * @param roles Array of role objects
 * @returns true if user should have backoffice access
 *
 * @example
 * ```typescript
 * if (hasBackofficeAccess(user.permissions, user.roles)) {
 *   // User can access backoffice
 * }
 * ```
 */
export function hasBackofficeAccess(
  permissions: string[],
  roles: Array<{ isSystemRole?: boolean }>
): boolean {
  return hasSystemAccess(permissions) || hasPlatformSystemRole(roles);
}

/**
 * Check if user can manage roles in an organization
 * @param permissions Array of permission slugs
 * @returns true if user can manage roles
 *
 * @example
 * ```typescript
 * if (canManageRoles(user.permissions)) {
 *   // Show role management UI
 * }
 * ```
 */
export function canManageRoles(permissions: string[]): boolean {
  return (
    permissions.includes("role:create") ||
    permissions.includes("role:update") ||
    permissions.includes("role:delete") ||
    hasSystemAccess(permissions)
  );
}

/**
 * Check if user can view roles in an organization
 * @param permissions Array of permission slugs
 * @returns true if user can view roles
 *
 * @example
 * ```typescript
 * if (canViewRoles(user.permissions)) {
 *   // Show roles list
 * }
 * ```
 */
export function canViewRoles(permissions: string[]): boolean {
  return (
    permissions.includes("role:read") ||
    canManageRoles(permissions)
  );
}

/**
 * Check if user can manage permissions assignment
 * @param permissions Array of permission slugs
 * @returns true if user can assign permissions
 *
 * @example
 * ```typescript
 * if (canAssignPermissions(user.permissions)) {
 *   // Show permission assignment UI
 * }
 * ```
 */
export function canAssignPermissions(permissions: string[]): boolean {
  return (
    permissions.includes("role:assign_permissions") ||
    hasSystemAccess(permissions)
  );
}

// =============================================================================
// LEGACY EXPORTS - For backward compatibility during migration
// These should be phased out in favor of the functions above
// =============================================================================

/**
 * @deprecated Use isSystemRole() or hasSystemAccess() instead
 * Hardcoded role names - only kept for backward compatibility
 */
export const SYSTEM_ROLES = {
  SUPER_USER: "Super User",
  OWNER: "Owner",
  ADMIN: "Admin",
  OPERATIONS_SPECIALIST: "Operations Specialist",
  CUSTOMER_SERVICE: "Customer Service",
} as const;

/**
 * @deprecated Use isOrgSpecificRole() instead
 */
export const ORG_ROLES = {
  STANDARD_USER: "Standard User",
  GUEST: "Guest",
} as const;

// Type helpers (legacy)
export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
export type OrgRoleName = (typeof ORG_ROLES)[keyof typeof ORG_ROLES];
export type RoleName = SystemRoleName | OrgRoleName;

/**
 * @deprecated Use isSystemRole() with role object instead
 */
export const isSystemRoleName = (
  roleName: string
): roleName is SystemRoleName => {
  return Object.values(SYSTEM_ROLES).includes(roleName as SystemRoleName);
};

/**
 * @deprecated Use isOrgSpecificRole() with role object instead
 */
export const isOrgRoleName = (roleName: string): roleName is OrgRoleName => {
  return Object.values(ORG_ROLES).includes(roleName as OrgRoleName);
};

/**
 * @deprecated Use isGlobalRole() with role object instead
 */
export const isGlobalRoleName = (roleName: string): boolean => {
  return roleName === SYSTEM_ROLES.OWNER || roleName === SYSTEM_ROLES.ADMIN;
};

/**
 * @deprecated Use hasPlatformSystemRole() or hasSystemAccess() instead
 */
export const isPlatformSystemRole = (roleName: string): boolean => {
  return roleName === SYSTEM_ROLES.SUPER_USER;
};

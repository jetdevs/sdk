/**
 * Centralized Permission Registry
 *
 * Single source of truth for all core permissions in the SaaS platform.
 * This registry contains only core framework permissions for:
 * - Authentication and user management
 * - Role-based access control (RBAC)
 * - Organization management
 * - System administration
 * - Theme management
 *
 * Extensions can add their own permissions via the extension system.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Permission categories for organizational grouping
 */
export type PermissionCategory =
  | 'admin'
  | 'organization'
  | 'users'
  | 'roles'
  | 'system';

/**
 * Individual permission definition
 */
export interface PermissionDefinition {
  /** Unique permission slug (e.g., "user:create") */
  slug: string;
  /** Human-readable permission name */
  name: string;
  /** Detailed description of what this permission grants */
  description: string;
  /** Category this permission belongs to */
  category: PermissionCategory;
  /** Whether this permission requires organization context */
  requiresOrg?: boolean;
  /** Permissions that must also be granted for this to be meaningful */
  dependencies?: string[];
  /** Whether this is a system-critical permission that should be carefully audited */
  critical?: boolean;
}

/**
 * Module-based permission grouping
 */
export interface PermissionModule {
  /** Module identifier */
  name: string;
  /** Human-readable module description */
  description: string;
  /** All permissions in this module */
  permissions: Record<string, PermissionDefinition>;
  /** Modules this module depends on */
  dependencies?: string[];
  /** Secure components that use these permissions */
  secureComponents?: string[];
  /** Primary RLS table for this module's data */
  rlsTable?: string;
  /** Module category */
  category: PermissionCategory;
}

/**
 * Complete permission registry
 */
export interface PermissionRegistry {
  /** All permission modules */
  modules: Record<string, PermissionModule>;
  /** Registry metadata */
  metadata: {
    version: string;
    generated: string;
    totalModules: number;
    totalPermissions: number;
    lastDatabaseSync?: string;
  };
}

// =============================================================================
// CORE PERMISSION REGISTRY
// =============================================================================

/**
 * Core permissions - the foundation for all SaaS applications.
 * Extensions add their own permissions via mergePermissions().
 */
export const corePermissions: PermissionRegistry = {
  modules: {

    // =============================================================================
    // SYSTEM ADMINISTRATION MODULE
    // =============================================================================
    admin: {
      name: "System Administration",
      description: "System-wide administrative functions and critical operations",
      category: 'admin',
      rlsTable: 'audit_logs',
      secureComponents: ['AdminPanel', 'SystemSettings', 'PermissionManager'],
      permissions: {
        "admin:full_access": {
          slug: "admin:full_access",
          name: "Full System Access",
          description: "Complete administrative access to all system functions",
          category: 'admin',
          critical: true,
        },
        "admin:audit_logs": {
          slug: "admin:audit_logs",
          name: "View Audit Logs",
          description: "Access to system audit logs and security events",
          category: 'admin',
          critical: true,
        },
        "admin:debug_context": {
          slug: "admin:debug_context",
          name: "Debug System Context",
          description: "Access debugging tools and system context information",
          category: 'admin',
        },
        "admin:permission_management": {
          slug: "admin:permission_management",
          name: "Manage Permissions",
          description: "Create, modify, and assign permissions and roles",
          category: 'admin',
          critical: true,
        },
        "admin:role_management": {
          slug: "admin:role_management",
          name: "Manage Roles",
          description: "Create, modify, and delete user roles",
          category: 'admin',
          critical: true,
        },
        "admin:seed_orgs": {
          slug: "admin:seed_orgs",
          name: "Seed Organizations",
          description: "Initialize organization data and structure",
          category: 'admin',
        },
        "admin:seed_rbac": {
          slug: "admin:seed_rbac",
          name: "Seed RBAC System",
          description: "Initialize roles, permissions, and access control",
          category: 'admin',
          critical: true,
        },
        "admin:system_settings": {
          slug: "admin:system_settings",
          name: "System Settings",
          description: "Configure system-wide settings and parameters",
          category: 'admin',
        },
        "admin:manage": {
          slug: "admin:manage",
          name: "Administrative Management",
          description: "General administrative access for management operations (users, orgs, system)",
          category: 'admin',
          critical: true,
        },
      }
    },

    // =============================================================================
    // ORGANIZATION MANAGEMENT MODULE
    // =============================================================================
    organization: {
      name: "Organization Management",
      description: "Organization-level operations and settings",
      category: 'organization',
      rlsTable: 'orgs',
      secureComponents: ['OrgSettings', 'OrgSwitcher'],
      permissions: {
        "org:create": {
          slug: "org:create",
          name: "Create Organizations",
          description: "Create new organizations",
          category: 'organization',
        },
        "org:read": {
          slug: "org:read",
          name: "View Organization",
          description: "View organization details and settings",
          category: 'organization',
          requiresOrg: true,
        },
        "org:update": {
          slug: "org:update",
          name: "Update Organization",
          description: "Modify organization settings and configuration",
          category: 'organization',
          requiresOrg: true,
          dependencies: ["org:read"],
        },
        "org:delete": {
          slug: "org:delete",
          name: "Delete Organization",
          description: "Remove organization and all associated data",
          category: 'organization',
          requiresOrg: true,
          dependencies: ["org:read"],
          critical: true,
        },
        "org:list": {
          slug: "org:list",
          name: "List Organizations",
          description: "View list of organizations",
          category: 'organization',
        },
        "org:audit": {
          slug: "org:audit",
          name: "View Organization Audit Logs",
          description: "Access organization audit trails",
          category: 'organization',
          requiresOrg: true,
          dependencies: ["org:read"],
        },
        "org:settings:read": {
          slug: "org:settings:read",
          name: "View Organization Settings",
          description: "View organization settings and configuration",
          category: 'organization',
          requiresOrg: true,
          dependencies: ["org:read"],
        },
        "org:settings:update": {
          slug: "org:settings:update",
          name: "Update Organization Settings",
          description: "Modify organization settings and configuration",
          category: 'organization',
          requiresOrg: true,
          critical: true,
          dependencies: ["org:settings:read"],
        },
        "org:analytics": {
          slug: "org:analytics",
          name: "View Organization Analytics",
          description: "Access organization analytics and statistics",
          category: 'organization',
          requiresOrg: true,
          dependencies: ["org:read"],
        },
        "org:cross_org_access": {
          slug: "org:cross_org_access",
          name: "Cross-Organization Access",
          description: "Access data across multiple organizations (system users only)",
          category: 'organization',
          critical: true,
        },
        "org:member": {
          slug: "org:member",
          name: "Organization Member",
          description: "Basic organization membership and access",
          category: 'organization',
          requiresOrg: true,
        },
        "org:billing": {
          slug: "org:billing",
          name: "Organization Billing",
          description: "Access billing information and manage subscriptions",
          category: 'organization',
          requiresOrg: true,
          dependencies: ["org:member"],
        },
      }
    },

    // =============================================================================
    // USER MANAGEMENT MODULE
    // =============================================================================
    users: {
      name: "User Management",
      description: "User account management and role assignments",
      category: 'users',
      dependencies: ['organization'],
      rlsTable: 'users',
      secureComponents: ['UserList', 'UserProfile', 'UserRoleAssigner'],
      permissions: {
        "user:create": {
          slug: "user:create",
          name: "Create Users",
          description: "Create new user accounts",
          category: 'users',
          requiresOrg: true,
          dependencies: ["org:member"],
          critical: true,
        },
        "user:read": {
          slug: "user:read",
          name: "View Users",
          description: "View user profiles and information",
          category: 'users',
          requiresOrg: true,
          dependencies: ["org:member"],
        },
        "user:update": {
          slug: "user:update",
          name: "Update Users",
          description: "Modify user profiles and settings",
          category: 'users',
          requiresOrg: true,
          dependencies: ["user:read"],
        },
        "user:assign_roles": {
          slug: "user:assign_roles",
          name: "Assign User Roles",
          description: "Assign and remove roles for users in organizations",
          category: 'users',
          requiresOrg: true,
          dependencies: ["user:read"],
        },
        "user:delete": {
          slug: "user:delete",
          name: "Delete Users",
          description: "Remove user accounts",
          category: 'users',
          requiresOrg: true,
          dependencies: ["user:read"],
          critical: true,
        },
      }
    },

    // =============================================================================
    // ROLE MANAGEMENT MODULE
    // =============================================================================
    roles: {
      name: "Role Management",
      description: "RBAC role management and permissions assignment",
      category: 'roles',
      dependencies: ['organization'],
      rlsTable: 'roles',
      secureComponents: ['RoleList', 'RoleEditor', 'PermissionAssigner'],
      permissions: {
        "role:create": {
          slug: "role:create",
          name: "Create Roles",
          description: "Create new user roles",
          category: 'roles',
          requiresOrg: true,
          dependencies: ["org:member"],
          critical: true,
        },
        "role:read": {
          slug: "role:read",
          name: "View Roles",
          description: "View existing roles and their permissions",
          category: 'roles',
          requiresOrg: true,
          dependencies: ["org:member"],
        },
        "role:update": {
          slug: "role:update",
          name: "Update Roles",
          description: "Modify role configurations and permissions",
          category: 'roles',
          requiresOrg: true,
          dependencies: ["role:read"],
          critical: true,
        },
        "role:delete": {
          slug: "role:delete",
          name: "Delete Roles",
          description: "Remove roles from organization",
          category: 'roles',
          requiresOrg: true,
          dependencies: ["role:read"],
          critical: true,
        },
        "role:assign_permissions": {
          slug: "role:assign_permissions",
          name: "Assign Permissions",
          description: "Manage role permissions and access rights",
          category: 'roles',
          requiresOrg: true,
          dependencies: ["role:read"],
          critical: true,
        },
      }
    },

    // =============================================================================
    // THEME MANAGEMENT MODULE
    // =============================================================================
    themes: {
      name: "Theme Management",
      description: "Application theme management and configuration",
      category: 'system',
      rlsTable: 'themes',
      secureComponents: ['ThemeList', 'ThemeEditor', 'ThemePreview'],
      permissions: {
        "theme:create": {
          slug: "theme:create",
          name: "Create Themes",
          description: "Create new application themes",
          category: 'system',
          requiresOrg: false,
          critical: true,
        },
        "theme:read": {
          slug: "theme:read",
          name: "View Themes",
          description: "View available themes and their configurations",
          category: 'system',
          requiresOrg: false,
        },
        "theme:update": {
          slug: "theme:update",
          name: "Update Themes",
          description: "Modify theme configurations and styles",
          category: 'system',
          requiresOrg: false,
          critical: true,
        },
        "theme:delete": {
          slug: "theme:delete",
          name: "Delete Themes",
          description: "Remove themes from the system",
          category: 'system',
          requiresOrg: false,
          critical: true,
        },
      }
    },

  },

  metadata: {
    version: "1.0.0",
    generated: new Date().toISOString(),
    totalModules: 5,
    totalPermissions: 34,
    lastDatabaseSync: undefined,
  }
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get all permissions from a registry as a flat array
 */
export function getAllPermissions(registry: PermissionRegistry = corePermissions): PermissionDefinition[] {
  const permissions: PermissionDefinition[] = [];

  for (const module of Object.values(registry.modules)) {
    permissions.push(...Object.values(module.permissions));
  }

  return permissions;
}

/**
 * Get permissions by category
 */
export function getPermissionsByCategory(
  category: PermissionCategory,
  registry: PermissionRegistry = corePermissions
): PermissionDefinition[] {
  return getAllPermissions(registry).filter(permission => permission.category === category);
}

/**
 * Get permissions by module
 */
export function getPermissionsByModule(
  moduleName: string,
  registry: PermissionRegistry = corePermissions
): PermissionDefinition[] {
  const module = registry.modules[moduleName];
  return module ? Object.values(module.permissions) : [];
}

/**
 * Find a permission by slug
 */
export function getPermissionBySlug(
  slug: string,
  registry: PermissionRegistry = corePermissions
): PermissionDefinition | undefined {
  return getAllPermissions(registry).find(permission => permission.slug === slug);
}

/**
 * Validate a permission slug exists in the registry
 */
export function isValidPermissionSlug(
  slug: string,
  registry: PermissionRegistry = corePermissions
): boolean {
  return getPermissionBySlug(slug, registry) !== undefined;
}

/**
 * Get all permission slugs
 */
export function getAllPermissionSlugs(registry: PermissionRegistry = corePermissions): string[] {
  return getAllPermissions(registry).map(permission => permission.slug);
}

/**
 * Get module dependencies for a given module
 */
export function getModuleDependencies(
  moduleName: string,
  registry: PermissionRegistry = corePermissions
): string[] {
  const module = registry.modules[moduleName];
  return module?.dependencies || [];
}

/**
 * Get permissions that have organization requirements
 */
export function getOrgRequiredPermissions(registry: PermissionRegistry = corePermissions): PermissionDefinition[] {
  return getAllPermissions(registry).filter(permission => permission.requiresOrg);
}

/**
 * Get critical permissions that require special handling
 */
export function getCriticalPermissions(registry: PermissionRegistry = corePermissions): PermissionDefinition[] {
  return getAllPermissions(registry).filter(permission => permission.critical);
}

/**
 * Validate permission dependencies
 */
export function validatePermissionDependencies(
  permissionSlugs: string[],
  registry: PermissionRegistry = corePermissions
): {
  valid: boolean;
  missing: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const missing: string[] = [];
  const providedSet = new Set(permissionSlugs);

  for (const slug of permissionSlugs) {
    const permission = getPermissionBySlug(slug, registry);

    if (!permission) {
      errors.push(`Invalid permission slug: ${slug}`);
      continue;
    }

    if (permission.dependencies) {
      for (const dependency of permission.dependencies) {
        if (!providedSet.has(dependency)) {
          missing.push(dependency);
        }
      }
    }
  }

  return {
    valid: errors.length === 0 && missing.length === 0,
    missing: [...new Set(missing)],
    errors,
  };
}

/**
 * Get summary statistics for a registry
 */
export function getRegistrySummary(registry: PermissionRegistry = corePermissions) {
  const allPermissions = getAllPermissions(registry);
  const totalPermissions = allPermissions.length;
  const totalModules = Object.keys(registry.modules).length;

  const criticalPermissions = getCriticalPermissions(registry).length;
  const orgRequiredPermissions = getOrgRequiredPermissions(registry).length;

  const permissionsByCategory = allPermissions.reduce((acc, permission) => {
    acc[permission.category] = (acc[permission.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalPermissions,
    totalModules,
    criticalPermissions,
    orgRequiredPermissions,
    permissionsByCategory,
    version: registry.metadata.version,
    generated: registry.metadata.generated,
  };
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/**
 * Export all permission slugs as a union type
 */
export type PermissionSlug = string;

export default corePermissions;

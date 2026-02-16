/**
 * Core RLS Registry
 *
 * Defines RLS configuration for core SaaS framework tables.
 * Extensions can add their own tables via mergeRlsRegistries().
 */

import type { RlsRegistry, RlsTableConfig, TableValidationResult, RlsIsolation, RlsRegistryStats } from './types';

// =============================================================================
// CORE RLS TABLES
// =============================================================================

/**
 * Registry of core SaaS framework tables and their RLS requirements.
 *
 * This registry is the single source of truth for:
 * - Which tables need RLS policies
 * - What isolation level each table requires
 * - Whether tables have org_id/workspace_id columns
 * - How tables inherit isolation from parent tables
 */
export const coreRlsTables: RlsRegistry = {

  // =============================================================================
  // PUBLIC TABLES - No RLS Required
  // =============================================================================

  users: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'User identity table - contains user auth info and org relationships in JSONB',
    rlsEnabled: false,
  },

  permissions: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'System permissions registry - available to all users',
    rlsEnabled: false,
  },

  themes: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'Application themes - available to all users',
    rlsEnabled: false,
  },

  orgs: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'Organization entities - visible to authenticated users for switching',
    rlsEnabled: false,
  },

  system_config: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'System-wide configuration settings - read-only for all users',
    rlsEnabled: false,
  },

  // =============================================================================
  // ORG-LEVEL ISOLATION TABLES
  // =============================================================================

  roles: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'Roles within organizations - isolated by org. Global roles (org_id IS NULL, is_global_role = true) are readable by all orgs.',
    rlsEnabled: true,
    // Custom policy to allow reading global roles (assignable to any org)
    // Global roles have: org_id IS NULL, is_global_role = true, is_system_role = false
    // System roles should NOT be included (they're assigned via backoffice with privileged access)
    customPolicy: `(
      current_setting('app.is_superuser', true) = 'true'
      OR org_id = get_current_org_id()
      OR (org_id IS NULL AND is_global_role = true AND is_system_role = false)
    )`,
  },

  role_permissions: {
    isolation: 'org',
    orgId: false,
    workspaceId: false,
    inheritedFrom: 'roles',
    description: 'Role-permission mappings - inherits isolation from roles table',
    rlsEnabled: true,
  },

  user_roles: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'User-role assignments within organizations',
    rlsEnabled: true,
  },

  audit_logs: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'Audit trail for organization activities',
    rlsEnabled: true,
  },

  org_audit_logs: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'Organization-specific audit logs for backoffice tracking',
    rlsEnabled: true,
  },

  org_settings: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'Organization settings and configuration - isolated by org',
    rlsEnabled: true,
  },

  feature_flags: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'Feature flags for controlled rollouts - can be global (null orgId) or org-specific',
    rlsEnabled: true,
    customPolicy: `(
      current_setting('app.is_superuser', true) = 'true'
      OR org_id = get_current_org_id()
      OR org_id IS NULL
    )`,
  },

  api_keys: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'API keys for organization integrations - isolated by org',
    rlsEnabled: true,
  },

  api_usage_logs: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'API usage tracking - isolated by org',
    rlsEnabled: true,
  },

  org_members: {
    isolation: 'org',
    orgId: true,
    workspaceId: false,
    description: 'Organization membership records - tracks user lifecycle within orgs',
    rlsEnabled: true,
  },

  // =============================================================================
  // AUTHENTICATION TABLES - No RLS (managed by application logic)
  // =============================================================================

  auth_accounts: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'User authentication accounts for multiple providers - linked to org after signup',
    rlsEnabled: false,
  },

  auth_sessions: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'Temporary authentication sessions for verification flows',
    rlsEnabled: false,
  },

  auth_logs: {
    isolation: 'public',
    orgId: false,
    workspaceId: false,
    description: 'Authentication audit logs for security monitoring',
    rlsEnabled: false,
  },

};

// =============================================================================
// REGISTRY FACTORY
// =============================================================================

/**
 * Create an RLS registry from core tables and extension tables.
 */
export function createRlsRegistry(
  extensionTables: RlsRegistry = {}
): RlsRegistry {
  return {
    ...coreRlsTables,
    ...extensionTables,
  };
}

/**
 * Merge multiple RLS registries.
 */
export function mergeRlsRegistries(
  ...registries: RlsRegistry[]
): RlsRegistry {
  return Object.assign({}, ...registries);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get all table names from a registry.
 */
export function getAllTableNames(registry: RlsRegistry = coreRlsTables): string[] {
  return Object.keys(registry);
}

/**
 * Get tables by isolation level.
 */
export function getTablesByIsolation(
  isolation: RlsIsolation,
  registry: RlsRegistry = coreRlsTables
): string[] {
  return Object.entries(registry)
    .filter(([_, config]) => config.isolation === isolation)
    .map(([tableName]) => tableName);
}

/**
 * Get all tables requiring org-level RLS.
 */
export function getOrgIsolatedTables(registry: RlsRegistry = coreRlsTables): string[] {
  return getTablesByIsolation('org', registry);
}

/**
 * Get all public tables (no RLS).
 */
export function getPublicTables(registry: RlsRegistry = coreRlsTables): string[] {
  return getTablesByIsolation('public', registry);
}

/**
 * Get tables that require RLS policies.
 */
export function getTablesWithRLS(registry: RlsRegistry = coreRlsTables): string[] {
  return Object.entries(registry)
    .filter(([_, config]) => config.rlsEnabled === true)
    .map(([tableName]) => tableName);
}

/**
 * Get tables that have org_id columns.
 */
export function getTablesWithOrgId(registry: RlsRegistry = coreRlsTables): string[] {
  return Object.entries(registry)
    .filter(([_, config]) => config.orgId === true)
    .map(([tableName]) => tableName);
}

/**
 * Get tables that have workspace_id columns.
 */
export function getTablesWithWorkspaceId(registry: RlsRegistry = coreRlsTables): string[] {
  return Object.entries(registry)
    .filter(([_, config]) => config.workspaceId === true)
    .map(([tableName]) => tableName);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate table configuration.
 */
export function validateTableConfig(
  tableName: string,
  config: RlsTableConfig,
  registry: RlsRegistry = coreRlsTables
): TableValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validation rules
  if (config.isolation === 'org' && !config.orgId && !config.inheritedFrom) {
    errors.push(`Table ${tableName} has org isolation but no orgId column or inheritance`);
  }

  if (config.isolation === 'workspace' && (!config.orgId || !config.workspaceId) && !config.inheritedFrom) {
    errors.push(`Table ${tableName} has workspace isolation but missing required columns or inheritance`);
  }

  if (config.isolation === 'user' && !config.userId && !config.inheritedFrom) {
    errors.push(`Table ${tableName} has user isolation but no userId column or inheritance`);
  }

  if (config.inheritedFrom && !registry[config.inheritedFrom]) {
    errors.push(`Table ${tableName} inherits from ${config.inheritedFrom} which doesn't exist in registry`);
  }

  // Warnings
  if (config.isolation === 'public' && config.rlsEnabled === true) {
    warnings.push(`Table ${tableName} is public but has RLS enabled - this may be intentional`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate entire registry.
 */
export function validateRegistry(
  registry: RlsRegistry = coreRlsTables
): { isValid: boolean; tableResults: Record<string, TableValidationResult> } {
  const tableResults: Record<string, TableValidationResult> = {};
  let isValid = true;

  for (const [tableName, config] of Object.entries(registry)) {
    const result = validateTableConfig(tableName, config, registry);
    tableResults[tableName] = result;
    if (!result.isValid) {
      isValid = false;
    }
  }

  return { isValid, tableResults };
}

/**
 * Get registry statistics.
 */
export function getRegistryStats(registry: RlsRegistry = coreRlsTables): RlsRegistryStats {
  const totalTables = Object.keys(registry).length;
  const publicTables = getTablesByIsolation('public', registry).length;
  const orgTables = getTablesByIsolation('org', registry).length;
  const workspaceTables = getTablesByIsolation('workspace', registry).length;
  const userTables = getTablesByIsolation('user', registry).length;
  const rlsEnabledTables = getTablesWithRLS(registry).length;
  const tablesWithOrgId = getTablesWithOrgId(registry).length;
  const tablesWithWorkspaceId = getTablesWithWorkspaceId(registry).length;

  return {
    totalTables,
    publicTables,
    orgTables,
    workspaceTables,
    userTables,
    rlsEnabledTables,
    tablesWithOrgId,
    tablesWithWorkspaceId,
    isolationBreakdown: {
      public: publicTables,
      org: orgTables,
      workspace: workspaceTables,
      user: userTables
    }
  };
}

export default coreRlsTables;

/**
 * RLS Policy Generators
 *
 * Functions to generate SQL statements for RLS policies based on registry configuration.
 * Supports different isolation levels: public, org, workspace, user.
 */

import type { RlsTableConfig, RlsRegistry } from './types';
import type { PolicyTemplate, ColumnRequirements } from './deploy-types';

// =============================================================================
// POLICY CONDITION GENERATORS
// =============================================================================

/**
 * Generate policy condition based on table configuration
 *
 * IMPORTANT: The workspace_id check is ONLY added when the isolation level is 'workspace'.
 * For tables with isolation: 'org' that have a workspace_id column (for association/filtering),
 * the workspace_id column is NOT used in the RLS policy because:
 * 1. The primary isolation boundary is the org
 * 2. workspace_id may be NULL for catalog/shared items
 * 3. Workspace filtering should happen at the application level, not RLS level
 */
export function generatePolicyCondition(config: RlsTableConfig): string {
  // If custom policy is defined, use it directly
  if (config.customPolicy) {
    return config.customPolicy.trim();
  }

  const conditions: string[] = [];

  if (config.orgId) {
    conditions.push("org_id = get_current_org_id()");
  }

  // Only add workspace_id check if the isolation level is 'workspace'
  // Tables with isolation: 'org' that have workspace_id columns use it for
  // association/filtering, not as a security boundary
  if (config.workspaceId && config.isolation === 'workspace') {
    conditions.push("workspace_id = get_current_workspace_id()");
  }

  if (config.userId) {
    conditions.push("user_id = current_setting('app.current_user_id')::integer");
  }

  // If no conditions, return true (for public tables)
  if (conditions.length === 0) {
    return 'true';
  }

  // Wrap conditions with superuser bypass check
  const regularCondition = conditions.join(' AND ');
  return `(current_setting('app.is_superuser', true) = 'true' OR (${regularCondition}))`;
}

// =============================================================================
// POLICY TEMPLATE GENERATORS BY ISOLATION LEVEL
// =============================================================================

/**
 * Generate policy templates for public tables
 */
export function generatePublicPolicies(tableName: string): PolicyTemplate[] {
  return [
    {
      name: `${tableName}_public_access`,
      cmd: 'ALL',
      role: 'app_user',
      using: 'true',
      withCheck: 'true',
    },
    {
      name: `${tableName}_internal_access`,
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    }
  ];
}

/**
 * Generate policy templates for org-level isolation
 */
export function generateOrgPolicies(tableName: string, config: RlsTableConfig): PolicyTemplate[] {
  const condition = generatePolicyCondition(config);

  return [
    {
      name: `${tableName}_org_policy`,
      cmd: 'ALL',
      role: 'app_user',
      using: condition,
      withCheck: condition,
    },
    {
      name: `${tableName}_internal_policy`,
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    }
  ];
}

/**
 * Generate policy templates for workspace-level isolation
 */
export function generateWorkspacePolicies(tableName: string, config: RlsTableConfig): PolicyTemplate[] {
  const condition = generatePolicyCondition(config);

  return [
    {
      name: `${tableName}_workspace_policy`,
      cmd: 'ALL',
      role: 'app_user',
      using: condition,
      withCheck: condition,
    },
    {
      name: `${tableName}_internal_policy`,
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    }
  ];
}

/**
 * Generate policy templates for user-level isolation
 */
export function generateUserPolicies(tableName: string, config: RlsTableConfig): PolicyTemplate[] {
  const condition = generatePolicyCondition(config);

  return [
    {
      name: `${tableName}_user_policy`,
      cmd: 'ALL',
      role: 'app_user',
      using: condition,
      withCheck: condition,
    },
    {
      name: `${tableName}_internal_policy`,
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    }
  ];
}

/**
 * Generate policies based on isolation level
 */
export function generatePoliciesForIsolation(
  tableName: string,
  config: RlsTableConfig
): PolicyTemplate[] {
  switch (config.isolation) {
    case 'public':
      return generatePublicPolicies(tableName);
    case 'org':
      return generateOrgPolicies(tableName, config);
    case 'workspace':
      return generateWorkspacePolicies(tableName, config);
    case 'user':
      return generateUserPolicies(tableName, config);
    default:
      throw new Error(`Unknown isolation level: ${config.isolation}`);
  }
}

// =============================================================================
// SQL GENERATION FUNCTIONS
// =============================================================================

/**
 * Generate SQL to enable RLS on a table
 */
export function generateEnableRLSSQL(tableName: string): string {
  return `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`;
}

/**
 * Generate SQL to disable RLS on a table
 */
export function generateDisableRLSSQL(tableName: string): string {
  return `ALTER TABLE "${tableName}" DISABLE ROW LEVEL SECURITY;`;
}

/**
 * Generate SQL to drop an existing policy
 */
export function generateDropPolicySQL(tableName: string, policyName: string): string {
  return `DROP POLICY IF EXISTS "${policyName}" ON "${tableName}";`;
}

/**
 * Generate SQL to create a policy
 */
export function generateCreatePolicySQL(tableName: string, policy: PolicyTemplate): string {
  let sql = `CREATE POLICY "${policy.name}" ON "${tableName}"`;

  // Add command
  sql += `\n  FOR ${policy.cmd}`;

  // Add role
  sql += `\n  TO "${policy.role}"`;

  // Add USING clause
  if (policy.using) {
    sql += `\n  USING (${policy.using})`;
  }

  // Add WITH CHECK clause
  if (policy.withCheck) {
    sql += `\n  WITH CHECK (${policy.withCheck})`;
  }

  sql += ';';
  return sql;
}

/**
 * Generate SQL to add a column to a table
 */
export function generateAddColumnSQL(tableName: string, columnName: string, columnType: string = 'INTEGER'): string {
  return `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${columnType};`;
}

// =============================================================================
// PERMISSION ANALYSIS
// =============================================================================

/**
 * Analyze permission requirements to determine which tables need org_id and workspace_id columns.
 *
 * @param permissionRegistry - The permission registry to analyze
 * @param rlsRegistry - The RLS registry for inheritance lookup
 * @returns Set of tables needing each column type
 */
export function analyzePermissionRequirements(
  permissionRegistry: {
    modules: Record<string, {
      rlsTable?: string;
      permissions: Record<string, {
        requiresOrg?: boolean;
        requiresWorkspace?: boolean;
      }>;
    }>;
  },
  rlsRegistry: RlsRegistry
): ColumnRequirements {
  const tablesNeedingOrgId = new Set<string>();
  const tablesNeedingWorkspaceId = new Set<string>();

  // Tables that define boundaries shouldn't require their own ID columns
  const boundaryTables = new Set(['workspaces', 'orgs', 'organizations']);

  // Helper function to find all tables that inherit from a parent table
  function findInheritedTables(parentTable: string): string[] {
    const inheritedTables: string[] = [];

    for (const [tableName, config] of Object.entries(rlsRegistry)) {
      if (config.inheritedFrom === parentTable) {
        inheritedTables.push(tableName);
        // Recursively find tables that inherit from this inherited table
        inheritedTables.push(...findInheritedTables(tableName));
      }
    }

    return inheritedTables;
  }

  // Iterate through all modules in the permission registry
  for (const [moduleName, module] of Object.entries(permissionRegistry.modules)) {
    // Check if this module has an associated RLS table
    if (module.rlsTable) {
      // Check all permissions in this module
      for (const [permissionKey, permission] of Object.entries(module.permissions)) {
        if (permission.requiresOrg && !boundaryTables.has(module.rlsTable)) {
          // Add the primary RLS table
          tablesNeedingOrgId.add(module.rlsTable);

          // Add all tables that inherit from this primary table
          const inheritedTables = findInheritedTables(module.rlsTable);
          inheritedTables.forEach(tableName => {
            if (!boundaryTables.has(tableName)) {
              tablesNeedingOrgId.add(tableName);
            }
          });
        }

        if (permission.requiresWorkspace && !boundaryTables.has(module.rlsTable)) {
          // Add the primary RLS table
          tablesNeedingWorkspaceId.add(module.rlsTable);

          // Add all tables that inherit from this primary table
          const inheritedTables = findInheritedTables(module.rlsTable);
          inheritedTables.forEach(tableName => {
            if (!boundaryTables.has(tableName)) {
              tablesNeedingWorkspaceId.add(tableName);
            }
          });
        }
      }
    }
  }

  return { tablesNeedingOrgId, tablesNeedingWorkspaceId };
}

// =============================================================================
// CONFIGURATION FUNCTION SQL
// =============================================================================

/**
 * SQL to create RLS context functions
 */
export const RLS_CONTEXT_FUNCTIONS = {
  // Organization context functions
  set_org_context: {
    dropSql: 'DROP FUNCTION IF EXISTS set_org_context(integer);',
    createSql: `
CREATE OR REPLACE FUNCTION set_org_context(org_id integer)
RETURNS void AS $$
BEGIN
    PERFORM set_config('rls.current_org_id', org_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
    comment: 'Sets the current organization context for RLS policies',
    paramType: 'integer'
  },

  clear_org_context: {
    createSql: `
CREATE OR REPLACE FUNCTION clear_org_context()
RETURNS void AS $$
BEGIN
    PERFORM set_config('rls.current_org_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
    comment: 'Clears the current organization context',
    paramType: ''
  },

  get_current_org_id: {
    createSql: `
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS integer AS $$
BEGIN
    RETURN current_setting('rls.current_org_id', true)::integer;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
    comment: 'Gets the current organization ID from session context',
    paramType: ''
  },

  // Workspace context functions
  set_workspace_context: {
    dropSql: 'DROP FUNCTION IF EXISTS set_workspace_context(integer);',
    createSql: `
CREATE OR REPLACE FUNCTION set_workspace_context(workspace_id integer)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_workspace_id', workspace_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
    comment: 'Sets the current workspace context for RLS policies',
    paramType: 'integer'
  },

  clear_workspace_context: {
    createSql: `
CREATE OR REPLACE FUNCTION clear_workspace_context()
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_workspace_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
    comment: 'Clears the current workspace context',
    paramType: ''
  },

  get_current_workspace_id: {
    createSql: `
CREATE OR REPLACE FUNCTION get_current_workspace_id()
RETURNS integer AS $$
BEGIN
    RETURN current_setting('app.current_workspace_id', true)::integer;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
    comment: 'Gets the current workspace ID from session context',
    paramType: ''
  }
};

/**
 * SQL to create/ensure RLS roles exist
 */
export const RLS_ROLES_SQL = `
DO $$
DECLARE
    db_name TEXT;
BEGIN
    -- Get the current database name
    SELECT current_database() INTO db_name;

    -- Create app_user role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN PASSWORD 'app-user-password';
        RAISE NOTICE 'Created app_user role';
    END IF;

    -- Create internal_api_user role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_user') THEN
        CREATE ROLE internal_api_user WITH LOGIN;
        RAISE NOTICE 'Created internal_api_user role';
    END IF;

    -- Grant database connection privileges using dynamic SQL
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user, internal_api_user', db_name);
END
$$;`;

/**
 * SQL statements to grant RLS function permissions to app_user
 */
export const RLS_FUNCTION_PERMISSIONS = [
  'GRANT EXECUTE ON FUNCTION set_org_context(integer) TO app_user',
  'GRANT EXECUTE ON FUNCTION set_workspace_context(integer) TO app_user',
  'GRANT EXECUTE ON FUNCTION get_current_org_id() TO app_user',
  'GRANT EXECUTE ON FUNCTION get_current_workspace_id() TO app_user',
  'GRANT EXECUTE ON FUNCTION clear_org_context() TO app_user',
  'GRANT EXECUTE ON FUNCTION clear_workspace_context() TO app_user'
];

/**
 * SQL statements to grant table permissions to RLS roles
 */
export const RLS_TABLE_PERMISSIONS = [
  'GRANT USAGE ON SCHEMA public TO app_user, internal_api_user',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, internal_api_user',
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, internal_api_user',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, internal_api_user',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user, internal_api_user'
];

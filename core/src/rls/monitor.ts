/**
 * RLS Monitor Utilities
 *
 * Database introspection functions for RLS policy management.
 * Provides functions to check existing policies, table structure, and RLS status.
 *
 * These are generic utilities that work with any postgres database connection.
 */

import type { ExistingPolicy, TableColumn, DbIntrospection } from './deploy-types';

// =============================================================================
// SQL QUERIES
// =============================================================================

/**
 * SQL to get all tables in public schema
 */
export const SQL_GET_TABLES = `
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`;

/**
 * SQL to check if RLS is enabled on a table (parameterized)
 */
export const SQL_CHECK_RLS = (tableName: string) => `
  SELECT relrowsecurity
  FROM pg_class
  WHERE relname = '${tableName}'
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
`;

/**
 * SQL to get all policies for a table (parameterized)
 */
export const SQL_GET_POLICIES = (tableName: string) => `
  SELECT
    pol.polname AS policy_name,
    tab.relname AS table_name,
    ARRAY(
      SELECT rolname
      FROM pg_roles
      WHERE oid = ANY(pol.polroles)
    ) AS roles,
    CASE pol.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE 'UNKNOWN'
    END AS cmd,
    CASE pol.polpermissive
      WHEN true THEN 'PERMISSIVE'
      ELSE 'RESTRICTIVE'
    END AS permissive,
    pg_get_expr(pol.polqual, pol.polrelid) AS qual,
    pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
  FROM pg_policy pol
  JOIN pg_class tab ON pol.polrelid = tab.oid
  WHERE tab.relname = '${tableName}'
    AND tab.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY pol.polname
`;

/**
 * SQL to get all columns for a table (parameterized)
 */
export const SQL_GET_COLUMNS = (tableName: string) => `
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = '${tableName}'
  ORDER BY ordinal_position
`;

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create database introspection functions using a SQL executor.
 *
 * @param executeSql - Function to execute SQL and return results
 * @returns DbIntrospection interface implementation
 *
 * @example
 * ```typescript
 * // With postgres package
 * const sql = postgres(connectionString);
 * const introspection = createDbIntrospection(async (query) => {
 *   return await sql.unsafe(query);
 * });
 *
 * const tables = await introspection.getDatabaseTables();
 * ```
 */
export function createDbIntrospection(
  executeSql: (sql: string) => Promise<any[]>
): DbIntrospection {
  return {
    async getDatabaseTables(): Promise<string[]> {
      const result = await executeSql(SQL_GET_TABLES);
      return result.map((row: any) => row.tablename);
    },

    async isRLSEnabled(tableName: string): Promise<boolean> {
      const result = await executeSql(SQL_CHECK_RLS(tableName));
      return result.length > 0 && result[0].relrowsecurity === true;
    },

    async getTablePolicies(tableName: string): Promise<ExistingPolicy[]> {
      const result = await executeSql(SQL_GET_POLICIES(tableName));
      return result.map((row: any) => ({
        policyName: row.policy_name,
        tableName: row.table_name,
        roles: row.roles,
        cmd: row.cmd,
        permissive: row.permissive,
        qual: row.qual,
        withCheck: row.with_check,
      }));
    },

    async getTableColumns(tableName: string): Promise<TableColumn[]> {
      const result = await executeSql(SQL_GET_COLUMNS(tableName));
      return result.map((row: any) => ({
        columnName: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === 'YES',
        columnDefault: row.column_default,
      }));
    },
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a table has a specific column
 */
export async function hasColumn(
  introspection: DbIntrospection,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const columns = await introspection.getTableColumns(tableName);
  return columns.some(col => col.columnName === columnName);
}

/**
 * Get tables that have RLS enabled
 */
export async function getTablesWithRlsEnabled(
  introspection: DbIntrospection
): Promise<string[]> {
  const tables = await introspection.getDatabaseTables();
  const results: string[] = [];

  for (const table of tables) {
    if (await introspection.isRLSEnabled(table)) {
      results.push(table);
    }
  }

  return results;
}

/**
 * Get tables that have policies
 */
export async function getTablesWithPolicies(
  introspection: DbIntrospection
): Promise<string[]> {
  const tables = await introspection.getDatabaseTables();
  const results: string[] = [];

  for (const table of tables) {
    const policies = await introspection.getTablePolicies(table);
    if (policies.length > 0) {
      results.push(table);
    }
  }

  return results;
}

/**
 * Get RLS status summary for all tables
 */
export async function getRlsStatusSummary(
  introspection: DbIntrospection
): Promise<{
  total: number;
  rlsEnabled: number;
  withPolicies: number;
  tables: Array<{
    name: string;
    rlsEnabled: boolean;
    policyCount: number;
  }>;
}> {
  const tables = await introspection.getDatabaseTables();
  const result = {
    total: tables.length,
    rlsEnabled: 0,
    withPolicies: 0,
    tables: [] as Array<{
      name: string;
      rlsEnabled: boolean;
      policyCount: number;
    }>,
  };

  for (const table of tables) {
    const rlsEnabled = await introspection.isRLSEnabled(table);
    const policies = await introspection.getTablePolicies(table);

    if (rlsEnabled) result.rlsEnabled++;
    if (policies.length > 0) result.withPolicies++;

    result.tables.push({
      name: table,
      rlsEnabled,
      policyCount: policies.length,
    });
  }

  return result;
}

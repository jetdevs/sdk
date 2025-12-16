/**
 * RLS Deploy
 *
 * Main deployment function and utilities for applying RLS policies to a database.
 * This module provides a generic, configurable deployment system that apps can use
 * with their specific registry and database connections.
 */

import type {
    DbIntrospection,
    DeployOptions,
    GenerationSummary,
    PolicyGenerationResult,
    TablePolicySet,
} from './deploy-types';
import {
    generateAddColumnSQL,
    generateCreatePolicySQL,
    generateDisableRLSSQL,
    generateDropPolicySQL,
    generateEnableRLSSQL,
    generatePoliciesForIsolation,
    RLS_CONTEXT_FUNCTIONS,
    RLS_FUNCTION_PERMISSIONS,
    RLS_ROLES_SQL,
    RLS_TABLE_PERMISSIONS
} from './policies';
import type { RlsRegistry, RlsTableConfig } from './types';

// =============================================================================
// TABLE POLICY SET GENERATION
// =============================================================================

/**
 * Generate complete policy set for a table
 */
export async function generateTablePolicySet(
  tableName: string,
  registry: RlsRegistry,
  introspection: DbIntrospection
): Promise<TablePolicySet> {
  const config = registry[tableName];
  if (!config) {
    throw new Error(`Table '${tableName}' not found in RLS registry`);
  }

  // Get existing policies to determine what to drop
  const existingPolicies = await introspection.getTablePolicies(tableName);
  const dropExistingPolicies = existingPolicies.map(p =>
    generateDropPolicySQL(tableName, p.policyName)
  );

  // Generate new policies
  const policies = generatePoliciesForIsolation(tableName, config);

  // Generate enable RLS SQL (only if needed for this isolation level)
  const enableRLS = config.isolation === 'public'
    ? generateDisableRLSSQL(tableName)
    : generateEnableRLSSQL(tableName);

  return {
    tableName,
    config,
    enableRLS,
    policies,
    dropExistingPolicies,
  };
}

// =============================================================================
// EXECUTION FUNCTIONS
// =============================================================================

/**
 * Execute SQL statements for a table policy set
 */
export async function executePolicySet(
  policySet: TablePolicySet,
  executeSql: (sql: string) => Promise<void>,
  dryRun: boolean = false
): Promise<PolicyGenerationResult> {
  const sqlStatements: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (!dryRun) {
      // Step 1: Drop existing policies
      for (const dropSQL of policySet.dropExistingPolicies) {
        sqlStatements.push(dropSQL);
        await executeSql(dropSQL);
      }

      // Step 2: Enable/Disable RLS as needed
      sqlStatements.push(policySet.enableRLS);
      await executeSql(policySet.enableRLS);

      // Step 3: Create new policies
      for (const policy of policySet.policies) {
        const createSQL = generateCreatePolicySQL(policySet.tableName, policy);
        sqlStatements.push(createSQL);
        await executeSql(createSQL);
      }
    } else {
      // For dry run, just collect SQL statements
      for (const dropSQL of policySet.dropExistingPolicies) {
        sqlStatements.push(dropSQL);
      }

      sqlStatements.push(policySet.enableRLS);

      for (const policy of policySet.policies) {
        const createSQL = generateCreatePolicySQL(policySet.tableName, policy);
        sqlStatements.push(createSQL);
      }
    }

    // Add informational messages
    if (policySet.config.isolation === 'public') {
      warnings.push('Public table - RLS disabled as expected');
    }

    if (policySet.policies.length === 0 && policySet.config.isolation !== 'public') {
      warnings.push('No policies generated - table may inherit isolation');
    }

    return {
      tableName: policySet.tableName,
      success: true,
      sqlStatements,
      errors,
      warnings,
    };

  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return {
      tableName: policySet.tableName,
      success: false,
      sqlStatements,
      errors,
      warnings,
    };
  }
}

// =============================================================================
// SETUP FUNCTIONS
// =============================================================================

/**
 * Ensure RLS context functions exist in the database
 */
export async function ensureConfigurationFunctions(
  executeSql: (sql: string) => Promise<void>,
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<void> {
  const { dryRun = false, verbose = false } = options;

  for (const [name, func] of Object.entries(RLS_CONTEXT_FUNCTIONS)) {
    try {
      if (!dryRun) {
        // Drop existing function if dropSql is provided
        if ('dropSql' in func && func.dropSql) {
          await executeSql(func.dropSql);
          if (verbose) console.log(`  Dropped existing function: ${name}`);
        }

        // Create the function
        await executeSql(func.createSql);
        if (verbose) console.log(`  Created/updated function: ${name}`);

        // Add comment
        const commentSql = `COMMENT ON FUNCTION ${name}(${func.paramType || ''}) IS '${func.comment}';`;
        await executeSql(commentSql);
      } else {
        if (verbose) console.log(`  [DRY RUN] Would create function: ${name}`);
      }
    } catch (error) {
      console.error(`  Failed to create function ${name}:`, error);
      throw error;
    }
  }
}

/**
 * Ensure RLS roles exist and have proper permissions
 */
export async function ensureRlsRoles(
  executeSql: (sql: string) => Promise<void>,
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<void> {
  const { dryRun = false, verbose = false } = options;

  if (!dryRun) {
    try {
      // Create roles if they don't exist
      await executeSql(RLS_ROLES_SQL);
      if (verbose) console.log('  Ensured app_user and internal_api_user roles exist');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  Failed to create roles: ${errorMessage}`);
      // Continue anyway as roles might already exist
    }

    // Grant function permissions
    for (const permissionSql of RLS_FUNCTION_PERMISSIONS) {
      try {
        await executeSql(permissionSql);
        if (verbose) console.log(`  Applied: ${permissionSql}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('does not exist')) {
          if (verbose) console.log(`  Function does not exist (skipping): ${permissionSql}`);
        } else {
          if (verbose) console.log(`  Permission already granted or applied: ${permissionSql}`);
        }
      }
    }

    // Grant table permissions
    for (const permissionSql of RLS_TABLE_PERMISSIONS) {
      try {
        await executeSql(permissionSql);
        if (verbose) console.log(`  Applied: ${permissionSql}`);
      } catch (error) {
        if (verbose) console.log(`  Permission already granted or applied: ${permissionSql}`);
      }
    }
  } else {
    if (verbose) {
      console.log('  [DRY RUN] Would create roles if they don\'t exist');
      console.log('  [DRY RUN] Would apply RLS function permissions');
      console.log('  [DRY RUN] Would apply table permissions');
    }
  }
}

/**
 * Ensure required columns exist on tables based on RLS registry
 */
export async function ensureRequiredColumns(
  tableName: string,
  config: RlsTableConfig,
  introspection: DbIntrospection,
  executeSql: (sql: string) => Promise<void>,
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<{ warnings: string[]; errors: string[] }> {
  const { dryRun = false, verbose = false } = options;
  const warnings: string[] = [];
  const errors: string[] = [];
  const requiredColumns: string[] = [];

  // Check RLS registry requirements
  if (config.orgId) requiredColumns.push('org_id');
  if (config.workspaceId) requiredColumns.push('workspace_id');
  if (config.userId) requiredColumns.push('user_id');

  if (requiredColumns.length === 0) {
    return { warnings, errors };
  }

  try {
    const existingColumns = (await introspection.getTableColumns(tableName)).map(c => c.columnName);

    for (const colName of requiredColumns) {
      if (!existingColumns.includes(colName)) {
        warnings.push(`Table '${tableName}' is missing required column '${colName}'. Attempting to add it.`);
        const addColumnSql = generateAddColumnSQL(tableName, colName);

        if (!dryRun) {
          await executeSql(addColumnSql);
          warnings.push(`Successfully added column '${colName}' to table '${tableName}'.`);
        } else {
          warnings.push(`[DRY RUN] Would execute: ${addColumnSql}`);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error while ensuring columns exist';
    errors.push(`Failed to add columns to '${tableName}': ${errorMessage}`);
  }

  return { warnings, errors };
}

// =============================================================================
// MAIN DEPLOY FUNCTION
// =============================================================================

/**
 * Deploy RLS policies to a database.
 *
 * This is the main entry point for RLS deployment. It handles:
 * 1. Setting up RLS context functions
 * 2. Creating/ensuring roles exist
 * 3. Ensuring required columns exist
 * 4. Deploying RLS policies for all tables in the registry
 *
 * @param registry - The RLS registry defining table configurations
 * @param introspection - Database introspection functions
 * @param executeSql - Function to execute SQL with admin privileges
 * @param options - Deployment options
 * @returns Generation summary with results for each table
 *
 * @example
 * ```typescript
 * import { deployRls, createDbIntrospection } from '@jetdevs/core/rls';
 * import { RLS_REGISTRY } from './rls-registry';
 * import postgres from 'postgres';
 *
 * const sql = postgres(process.env.DATABASE_MIGRATE_URL);
 * const introspection = createDbIntrospection(async (query) => sql.unsafe(query));
 *
 * const summary = await deployRls(
 *   RLS_REGISTRY,
 *   introspection,
 *   async (query) => { await sql.unsafe(query) },
 *   { verbose: true }
 * );
 *
 * console.log(`Deployed ${summary.successfulTables}/${summary.totalTables} tables`);
 * await sql.end();
 * ```
 */
export async function deployRls(
  registry: RlsRegistry,
  introspection: DbIntrospection,
  executeSql: (sql: string) => Promise<void>,
  options: DeployOptions = {}
): Promise<GenerationSummary> {
  const {
    dryRun = false,
    verbose = false,
    tables: targetTableNames,
    skipConfigSetup = false,
    skipRoleSetup = false,
    skipColumnChecks = false,
  } = options;

  const timestamp = new Date();
  const targetTables = targetTableNames || Object.keys(registry);
  const results: PolicyGenerationResult[] = [];
  const overallSQL: string[] = [];

  // STEP 1: Ensure PostgreSQL configuration functions exist
  if (!skipConfigSetup) {
    if (verbose) console.log('Step 1: Ensuring PostgreSQL configuration parameters exist...');
    try {
      await ensureConfigurationFunctions(executeSql, { dryRun, verbose });
      if (verbose) console.log('  Configuration parameters verified');
    } catch (error) {
      console.error('  Failed to ensure configuration parameters:', error);
      if (verbose) console.log('  Continuing with RLS policy generation...');
    }
  }

  // STEP 2: Ensure RLS roles have proper permissions
  if (!skipRoleSetup) {
    if (verbose) console.log('Step 2: Ensuring app_user RLS function permissions...');
    try {
      await ensureRlsRoles(executeSql, { dryRun, verbose });
      if (verbose) console.log('  App user permissions verified');
    } catch (error) {
      console.error('  Failed to ensure app_user permissions:', error);
      if (verbose) console.log('  Continuing with RLS policy generation...');
    }
  }

  // STEP 3: Generate RLS policies
  if (verbose) console.log('Step 3: Generating RLS policies...');

  // Add transaction wrapper for non-dry-run executions
  if (!dryRun) {
    overallSQL.push('BEGIN;');
  }

  for (const tableName of targetTables) {
    const result: PolicyGenerationResult = {
      tableName,
      success: true,
      sqlStatements: [],
      errors: [],
      warnings: [],
    };

    try {
      // Check if table exists
      const allTables = await introspection.getDatabaseTables();
      if (!allTables.includes(tableName)) {
        result.success = false;
        result.errors.push(`Table '${tableName}' does not exist in database`);
        results.push(result);
        continue;
      }

      // Ensure required columns exist
      const config = registry[tableName];
      if (config && !skipColumnChecks) {
        const { warnings: colWarnings, errors: colErrors } = await ensureRequiredColumns(
          tableName,
          config,
          introspection,
          executeSql,
          { dryRun, verbose }
        );
        result.warnings.push(...colWarnings);
        if (colErrors.length > 0) {
          result.success = false;
          result.errors.push(...colErrors);
          results.push(result);
          continue;
        }
      }

      // Generate and execute policy set
      const policySet = await generateTablePolicySet(tableName, registry, introspection);
      const policyResult = await executePolicySet(policySet, executeSql, dryRun);

      result.success = result.success && policyResult.success;
      result.sqlStatements.push(...policyResult.sqlStatements);
      result.errors.push(...policyResult.errors);
      result.warnings.push(...policyResult.warnings);

      overallSQL.push(...policyResult.sqlStatements);

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    results.push(result);
  }

  // Complete transaction wrapper
  if (!dryRun) {
    overallSQL.push('COMMIT;');
  }

  // Calculate summary statistics
  const successfulTables = results.filter(r => r.success).length;
  const failedTables = results.filter(r => !r.success).length;
  const skippedTables = results.filter(r => !r.success && r.errors.some(e => e.includes('does not exist'))).length;

  return {
    timestamp,
    totalTables: targetTables.length,
    successfulTables,
    failedTables,
    skippedTables,
    results,
    overallSQL,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate SQL migration file content from a generation summary
 */
export function generateMigrationSQL(summary: GenerationSummary): string {
  let migration = `-- RLS Policy Migration
-- Generated: ${summary.timestamp.toISOString()}
-- Tables: ${summary.totalTables} (${summary.successfulTables} successful)

`;

  // Add policies by table for better organization
  for (const result of summary.results) {
    if (result.success && result.sqlStatements.length > 0) {
      migration += `-- Policies for table: ${result.tableName}\n`;
      migration += result.sqlStatements.join('\n\n') + '\n\n';
    }
  }

  // Add error summary
  const failedResults = summary.results.filter(r => !r.success);
  if (failedResults.length > 0) {
    migration += `-- ERRORS (${failedResults.length} tables failed):\n`;
    for (const result of failedResults) {
      migration += `-- ${result.tableName}: ${result.errors.join(', ')}\n`;
    }
  }

  return migration;
}

/**
 * Preview policies for a specific table without executing
 */
export async function previewTablePolicies(
  tableName: string,
  registry: RlsRegistry,
  introspection: DbIntrospection
): Promise<string> {
  const policySet = await generateTablePolicySet(tableName, registry, introspection);
  const config = registry[tableName];

  let preview = `-- Policy Preview for table: ${tableName}\n`;
  preview += `-- Isolation Level: ${config?.isolation}\n`;
  preview += `-- Description: ${config?.description}\n\n`;

  // Show what would be dropped
  if (policySet.dropExistingPolicies.length > 0) {
    preview += `-- Drop existing policies:\n`;
    preview += policySet.dropExistingPolicies.join('\n') + '\n\n';
  }

  // Show RLS setting
  preview += `-- RLS Configuration:\n${policySet.enableRLS}\n\n`;

  // Show new policies
  if (policySet.policies.length > 0) {
    preview += `-- New Policies:\n`;
    for (const policy of policySet.policies) {
      preview += generateCreatePolicySQL(tableName, policy) + '\n\n';
    }
  } else {
    preview += `-- No policies needed (${config?.isolation} isolation)\n\n`;
  }

  return preview;
}

/**
 * Validate generated policies against expected patterns
 */
export async function validatePolicyGeneration(
  tableName: string,
  registry: RlsRegistry,
  introspection: DbIntrospection
): Promise<{
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  try {
    const config = registry[tableName];
    if (!config) {
      issues.push('Table not found in RLS registry');
      return { isValid: false, issues, suggestions };
    }

    const policySet = await generateTablePolicySet(tableName, registry, introspection);

    // Validate policy count
    if (config.isolation !== 'public' && policySet.policies.length === 0) {
      issues.push('No policies generated for non-public table');
      suggestions.push('Check if table inherits isolation or needs explicit policies');
    }

    // Validate policy conditions
    for (const policy of policySet.policies) {
      if (policy.role === 'app_user' && !policy.using) {
        issues.push(`Policy ${policy.name} for app_user missing USING clause`);
        suggestions.push('Add appropriate isolation condition based on table configuration');
      }

      if (policy.role === 'app_user' && policy.using && !policy.withCheck) {
        suggestions.push(`Consider adding WITH CHECK clause to policy ${policy.name} for insert/update security`);
      }
    }

    // Validate RLS setting
    if (config.isolation === 'public' && policySet.enableRLS.includes('ENABLE')) {
      issues.push('Public table configured to enable RLS - should be disabled');
    }

    if (config.isolation !== 'public' && policySet.enableRLS.includes('DISABLE')) {
      issues.push('Non-public table configured to disable RLS - should be enabled');
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };

  } catch (error) {
    issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { isValid: false, issues, suggestions };
  }
}

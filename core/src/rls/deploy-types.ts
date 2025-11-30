/**
 * RLS Deploy Types
 *
 * Type definitions for RLS policy deployment and generation.
 */

import type { RlsTableConfig, RlsRegistry } from './types';

// =============================================================================
// POLICY TYPES
// =============================================================================

/**
 * Policy template for generating RLS policies
 */
export interface PolicyTemplate {
  name: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  role: string;
  using?: string;
  withCheck?: string;
}

/**
 * Complete policy set for a table
 */
export interface TablePolicySet {
  tableName: string;
  config: RlsTableConfig;
  enableRLS: string;
  policies: PolicyTemplate[];
  dropExistingPolicies: string[];
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of policy generation for a single table
 */
export interface PolicyGenerationResult {
  tableName: string;
  success: boolean;
  sqlStatements: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Summary of policy generation for all tables
 */
export interface GenerationSummary {
  timestamp: Date;
  totalTables: number;
  successfulTables: number;
  failedTables: number;
  skippedTables: number;
  results: PolicyGenerationResult[];
  overallSQL: string[];
}

// =============================================================================
// DATABASE INTROSPECTION TYPES
// =============================================================================

/**
 * Existing policy information from database
 */
export interface ExistingPolicy {
  policyName: string;
  tableName: string;
  roles: string[];
  cmd: string;
  permissive: string;
  qual: string | null;
  withCheck: string | null;
}

/**
 * Column information from database
 */
export interface TableColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
}

// =============================================================================
// DEPLOY OPTIONS
// =============================================================================

/**
 * Options for RLS deployment
 */
export interface DeployOptions {
  /** Run in dry-run mode (no actual changes) */
  dryRun?: boolean;
  /** Show verbose output */
  verbose?: boolean;
  /** Only deploy to specific tables */
  tables?: string[];
  /** Skip configuration parameter setup */
  skipConfigSetup?: boolean;
  /** Skip role permission setup */
  skipRoleSetup?: boolean;
  /** Skip column checks */
  skipColumnChecks?: boolean;
}

// =============================================================================
// DATABASE CLIENT TYPES
// =============================================================================

/**
 * Minimal database client interface for RLS operations
 */
export interface RlsDbClient {
  /** Execute raw SQL */
  execute(sql: { raw: string } | any): Promise<any>;
}

/**
 * Database connection factory for RLS operations
 */
export interface RlsDbFactory {
  /** Get admin/privileged database client */
  getAdminClient(): Promise<RlsDbClient>;
  /** Execute with admin client and cleanup */
  withAdminClient<T>(fn: (client: RlsDbClient) => Promise<T>): Promise<T>;
  /** Close all connections */
  close(): Promise<void>;
}

// =============================================================================
// INTROSPECTION FUNCTIONS INTERFACE
// =============================================================================

/**
 * Functions for database introspection
 */
export interface DbIntrospection {
  /** Get all tables in public schema */
  getDatabaseTables(): Promise<string[]>;
  /** Check if RLS is enabled on a table */
  isRLSEnabled(tableName: string): Promise<boolean>;
  /** Get all policies for a table */
  getTablePolicies(tableName: string): Promise<ExistingPolicy[]>;
  /** Get all columns for a table */
  getTableColumns(tableName: string): Promise<TableColumn[]>;
}

// =============================================================================
// DEPLOY FUNCTION TYPES
// =============================================================================

/**
 * Dependencies for the deploy function
 */
export interface DeployDeps {
  /** RLS registry to deploy */
  registry: RlsRegistry;
  /** Database introspection functions */
  introspection: DbIntrospection;
  /** Function to execute SQL with admin privileges */
  executeSql: (sql: string) => Promise<void>;
  /** Optional: Permission registry for column analysis */
  permissionRegistry?: {
    modules: Record<string, {
      rlsTable?: string;
      permissions: Record<string, {
        requiresOrg?: boolean;
        requiresWorkspace?: boolean;
      }>;
    }>;
  };
}

/**
 * Column analysis result from permission requirements
 */
export interface ColumnRequirements {
  tablesNeedingOrgId: Set<string>;
  tablesNeedingWorkspaceId: Set<string>;
}

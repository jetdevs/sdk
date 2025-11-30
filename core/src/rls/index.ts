/**
 * RLS Module
 *
 * Row-Level Security configuration, context management, and deployment utilities.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type {
  RlsIsolation,
  RlsPolicy,
  RlsTableConfig,
  RlsRegistry,
  TableValidationResult,
  RlsRegistryStats,
} from './types';

// =============================================================================
// DEPLOY TYPES
// =============================================================================

export type {
  PolicyTemplate,
  TablePolicySet,
  PolicyGenerationResult,
  GenerationSummary,
  ExistingPolicy,
  TableColumn,
  DeployOptions,
  RlsDbClient,
  RlsDbFactory,
  DbIntrospection,
  DeployDeps,
  ColumnRequirements,
} from './deploy-types';

// =============================================================================
// REGISTRY
// =============================================================================

export {
  coreRlsTables,
  createRlsRegistry,
  mergeRlsRegistries,
  getAllTableNames,
  getTablesByIsolation,
  getOrgIsolatedTables,
  getPublicTables,
  getTablesWithRLS,
  getTablesWithOrgId,
  getTablesWithWorkspaceId,
  validateTableConfig,
  validateRegistry,
  getRegistryStats,
} from './registry';

// =============================================================================
// CONTEXT
// =============================================================================

export {
  RLS_ORG_VAR,
  RLS_USER_VAR,
  setRlsContext,
  clearRlsContext,
  withRlsContext,
  hasRlsContext,
  getRlsContext,
} from './context';

// =============================================================================
// MONITOR (Database Introspection)
// =============================================================================

export {
  createDbIntrospection,
  hasColumn,
  getTablesWithRlsEnabled,
  getTablesWithPolicies,
  getRlsStatusSummary,
  // SQL query exports for advanced use
  SQL_GET_TABLES,
  SQL_CHECK_RLS,
  SQL_GET_POLICIES,
  SQL_GET_COLUMNS,
} from './monitor';

// =============================================================================
// POLICY GENERATORS
// =============================================================================

export {
  // Condition generators
  generatePolicyCondition,
  // Policy template generators
  generatePublicPolicies,
  generateOrgPolicies,
  generateWorkspacePolicies,
  generateUserPolicies,
  generatePoliciesForIsolation,
  // SQL generators
  generateEnableRLSSQL,
  generateDisableRLSSQL,
  generateDropPolicySQL,
  generateCreatePolicySQL,
  generateAddColumnSQL,
  // Permission analysis
  analyzePermissionRequirements,
  // Configuration SQL
  RLS_CONTEXT_FUNCTIONS,
  RLS_ROLES_SQL,
  RLS_FUNCTION_PERMISSIONS,
  RLS_TABLE_PERMISSIONS,
} from './policies';

// =============================================================================
// DEPLOY
// =============================================================================

export {
  // Main deploy function
  deployRls,
  // Setup functions
  ensureConfigurationFunctions,
  ensureRlsRoles,
  ensureRequiredColumns,
  // Generation functions
  generateTablePolicySet,
  executePolicySet,
  // Utility functions
  generateMigrationSQL,
  previewTablePolicies,
  validatePolicyGeneration,
} from './deploy';

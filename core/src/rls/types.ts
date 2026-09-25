/**
 * RLS Types
 *
 * Type definitions for Row-Level Security configuration.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * RLS isolation levels.
 * - public: No RLS, accessible to all authenticated users
 * - org: Isolated by organization (most common)
 * - workspace: Isolated by workspace within organization
 * - user: Isolated by individual user
 */
export type RlsIsolation = 'public' | 'org' | 'workspace' | 'user';

/**
 * RLS policy types.
 */
export type RlsPolicy = 'select' | 'insert' | 'update' | 'delete';

/**
 * Per-command policy expressions for org-isolated tables.
 *
 * Each value is a bare SQL boolean expression (no surrounding USING/WITH CHECK).
 * A missing key falls back to the table's default condition
 * (`generatePolicyCondition`, i.e. `customPolicy` or the org_id check).
 */
export interface RlsCommandPolicies {
  /** USING expression for the `FOR SELECT` policy */
  select?: string;
  /** WITH CHECK expression for the `FOR INSERT` policy */
  insert?: string;
  /** USING + WITH CHECK expression for the `FOR UPDATE` policy */
  update?: string;
  /** USING expression for the `FOR DELETE` policy */
  delete?: string;
}

/**
 * Configuration for a single table's RLS policy.
 */
export interface RlsTableConfig {
  /** RLS isolation level */
  isolation: RlsIsolation;
  /** Whether this table has an org_id column */
  orgId: boolean;
  /** Whether this table has a workspace_id column */
  workspaceId: boolean;
  /** Whether this table has a user_id column for user-level isolation */
  userId?: boolean;
  /** Whether this table inherits isolation from a parent table */
  inheritedFrom?: string;
  /** Custom RLS policy SQL if needed */
  customPolicy?: string;
  /**
   * Per-command policies (isolation 'org' only). When set, the generator emits
   * separate `${table}_select` / `_insert` / `_update` / `_delete` policies for
   * app_user instead of the single `${table}_org_policy` FOR ALL policy, so a
   * table can be readable more widely than it is writable (e.g. global rows
   * with org_id NULL readable by every org but writable only by a superuser).
   * Overrides `customPolicy` for org isolation; any missing key falls back to
   * `generatePolicyCondition(config)` (customPolicy or the org_id check).
   * The `${table}_internal_policy` for internal_api_user is emitted unchanged.
   */
  policies?: RlsCommandPolicies;
  /** Description of the table's isolation requirements */
  description: string;
  /** Whether RLS is currently enabled (for migration tracking) */
  rlsEnabled?: boolean;
}

/**
 * Complete RLS registry mapping table names to configs.
 */
export type RlsRegistry = Record<string, RlsTableConfig>;

/**
 * Validation result for table configuration
 */
export interface TableValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Registry statistics
 */
export interface RlsRegistryStats {
  totalTables: number;
  publicTables: number;
  orgTables: number;
  workspaceTables: number;
  userTables: number;
  rlsEnabledTables: number;
  tablesWithOrgId: number;
  tablesWithWorkspaceId: number;
  isolationBreakdown: {
    public: number;
    org: number;
    workspace: number;
    user: number;
  };
}

/**
 * Permission Types
 *
 * TypeScript types for the permission system.
 */

import type { PermissionRegistry, PermissionModule as BasePermissionModule } from './registry';

// =============================================================================
// CORE TYPES (Re-exported from registry)
// =============================================================================

export type {
  PermissionCategory,
  PermissionDefinition,
  PermissionModule,
  PermissionRegistry,
  PermissionSlug,
} from './registry';

// =============================================================================
// PERMISSION CHECKING TYPES
// =============================================================================

/**
 * Permission check configuration for components
 */
export interface PermissionCheckConfig {
  /** Single permission required */
  permission?: string;
  /** Multiple permissions - all required (AND logic) */
  permissions?: string[];
  /** Multiple permissions - any required (OR logic) */
  anyPermissions?: string[];
  /** Module name for context-based checking */
  module?: string;
  /** Fallback component when access denied */
  fallback?: React.ReactNode;
}

/**
 * Module-based permission context
 */
export interface ModulePermissionContext {
  /** Current module being accessed */
  module: string;
  /** Base permission for the module context */
  basePermission?: string;
  /** Additional required permissions */
  additionalPermissions?: string[];
}

/**
 * Permission dependency validation result
 */
export interface PermissionValidationResult {
  /** Whether the permission set is valid */
  isValid: boolean;
  /** Missing dependency permissions */
  missingDependencies: string[];
  /** Invalid permission slugs */
  invalidPermissions: string[];
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

// =============================================================================
// COMPONENT PROP TYPES
// =============================================================================

/**
 * Secure container component props
 */
export interface SecureContainerProps {
  /** Module context for permission checking */
  module?: string;
  /** Single permission required */
  permission?: string;
  /** Multiple permissions - all required */
  permissions?: string[];
  /** Multiple permissions - any required */
  anyPermissions?: string[];
  /** Fallback component when access denied */
  fallback?: React.ReactNode;
  /** Child components */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Secure button component props
 */
export interface SecureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Module context */
  module?: string;
  /** Required permission for button */
  permission?: string;
  /** Action-based permission (e.g., for module:create patterns) */
  action?: 'create' | 'read' | 'update' | 'delete' | 'execute' | 'deploy' | 'publish';
  /** Button content */
  children: React.ReactNode;
}

/**
 * WithPermission component props
 */
export interface WithPermissionProps {
  /** Single permission required */
  permission?: string;
  /** Multiple permissions - all required */
  permissions?: string[];
  /** Multiple permissions - any required */
  anyPermissions?: string[];
  /** Module context for enhanced checking */
  module?: string;
  /** Custom permission checking function */
  customCheck?: (userPermissions: string[]) => boolean;
  /** Fallback when access denied */
  fallback?: React.ReactNode;
  /** Show loading state during permission check */
  loading?: React.ReactNode;
  /** Child components */
  children: React.ReactNode;
}

// =============================================================================
// HOOK TYPES
// =============================================================================

/**
 * Permission check hook return type
 */
export interface UsePermissionResult {
  /** Whether user has the required permission(s) */
  hasPermission: boolean;
  /** Whether permission check is loading */
  loading: boolean;
  /** Error during permission check */
  error?: string;
  /** User's available permissions */
  userPermissions: string[];
}

/**
 * Module permission hook return type
 */
export interface UseModulePermissionResult {
  /** Whether user can access the module */
  canAccessModule: boolean;
  /** Available actions in the module */
  availableActions: string[];
  /** Module configuration */
  moduleConfig: BasePermissionModule | undefined;
  /** Permission checking function for the module */
  checkModulePermission: (action: string) => boolean;
}

// =============================================================================
// EXTENSION TYPES
// =============================================================================

/**
 * Extension permission module definition
 * Used when defining permissions in an extension
 */
export interface ExtensionPermissionModule {
  /** Module identifier - should match extension name */
  name: string;
  /** Human-readable module description */
  description: string;
  /** All permissions in this module */
  permissions: Record<string, {
    slug: string;
    name: string;
    description: string;
    category?: string;
    requiresOrg?: boolean;
    dependencies?: string[];
    critical?: boolean;
  }>;
  /** Modules this module depends on */
  dependencies?: string[];
  /** Secure components that use these permissions */
  secureComponents?: string[];
  /** Primary RLS table for this module's data */
  rlsTable?: string;
}

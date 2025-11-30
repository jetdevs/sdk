/**
 * Permissions Module
 *
 * Core permission system for the SaaS platform.
 */

// Registry
export {
  corePermissions,
  getAllPermissions,
  getPermissionsByCategory,
  getPermissionsByModule,
  getPermissionBySlug,
  isValidPermissionSlug,
  getAllPermissionSlugs,
  getModuleDependencies,
  getOrgRequiredPermissions,
  getCriticalPermissions,
  validatePermissionDependencies,
  getRegistrySummary,
} from './registry';

export type {
  PermissionCategory,
  PermissionDefinition,
  PermissionModule,
  PermissionRegistry,
  PermissionSlug,
} from './registry';

// Merger
export {
  mergePermissions,
  mergePermissionsWithResult,
  validatePermissionNamespacing,
} from './merger';

export type {
  MergeOptions,
  MergeResult,
} from './merger';

// Types
export type {
  PermissionCheckConfig,
  ModulePermissionContext,
  PermissionValidationResult,
  SecureContainerProps,
  SecureButtonProps,
  WithPermissionProps,
  UsePermissionResult,
  UseModulePermissionResult,
  ExtensionPermissionModule,
} from './types';

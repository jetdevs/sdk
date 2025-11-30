/**
 * Permission Merger
 *
 * Merges core permissions with extension permissions while enforcing
 * strict collision rules. Permission collisions are fatal by default.
 */

import type { PermissionModule, PermissionRegistry } from './registry';

// =============================================================================
// TYPES
// =============================================================================

export interface MergeOptions {
  /** Allow extensions to override existing permissions (default: false) */
  allowOverride?: boolean;
  /** Fail on any collision - even with allowOverride (default: true) */
  strict?: boolean;
}

export interface MergeResult {
  /** The merged registry */
  registry: PermissionRegistry;
  /** Permissions that were added */
  added: string[];
  /** Permissions that were overridden (if allowOverride: true) */
  overridden: string[];
  /** Any warnings generated during merge */
  warnings: string[];
}

// =============================================================================
// MERGER
// =============================================================================

/**
 * Merge core permissions with extension permissions.
 *
 * IMPORTANT: Permission collisions are FATAL by default. Extensions cannot
 * override core permissions unless explicitly opted in with `allowOverride: true`.
 *
 * Collision Rules:
 * - Extension adds new permission: ✅ Allowed
 * - Extension redefines core permission: ❌ Error (unless allowOverride: true)
 * - Two extensions define same permission: ❌ Error
 * - Extension defines same module name as core: ⚠️ Merged (permissions within must be unique)
 *
 * @param core - The core permission registry
 * @param extensions - Either an array of PermissionModule[] OR a PermissionRegistry object
 * @param options - Merge options
 * @throws Error when collision detected and strict mode is enabled (default)
 */
export function mergePermissions(
  core: PermissionRegistry,
  extensions: PermissionModule[] | PermissionRegistry,
  options: MergeOptions = {}
): PermissionRegistry {
  const { allowOverride = false, strict = true } = options;
  const merged = structuredClone(core);
  const allPermissionKeys = new Set<string>();

  // Normalize extensions: handle both array and registry object
  const extensionModules: PermissionModule[] = Array.isArray(extensions)
    ? extensions
    : extensions?.modules
      ? Object.values(extensions.modules)
      : [];

  // Collect core permission keys
  for (const module of Object.values(core.modules)) {
    for (const key of Object.keys(module.permissions)) {
      allPermissionKeys.add(key);
    }
  }

  for (const ext of extensionModules) {
    // Check for module collision
    if (merged.modules[ext.name] && !allowOverride) {
      // Module exists - merge permissions but check for key collisions
      for (const [key, perm] of Object.entries(ext.permissions)) {
        if (allPermissionKeys.has(key)) {
          if (strict) {
            throw new Error(
              `Permission collision: "${key}" already exists. ` +
              `Set allowOverride: true to override, or use a unique key.`
            );
          }
          console.warn(`[WARN] Permission "${key}" overridden by extension "${ext.name}"`);
        }
        merged.modules[ext.name].permissions[key] = perm;
        allPermissionKeys.add(key);
      }
    } else {
      // New module - check individual permission keys
      for (const key of Object.keys(ext.permissions)) {
        if (allPermissionKeys.has(key)) {
          if (strict) {
            throw new Error(
              `Permission collision: "${key}" from extension "${ext.name}" ` +
              `conflicts with existing permission.`
            );
          }
        }
        allPermissionKeys.add(key);
      }
      merged.modules[ext.name] = ext;
    }
  }

  // Update metadata
  const allPerms = Object.values(merged.modules).flatMap(m => Object.keys(m.permissions));
  merged.metadata = {
    ...merged.metadata,
    totalModules: Object.keys(merged.modules).length,
    totalPermissions: allPerms.length,
    generated: new Date().toISOString(),
  };

  return merged;
}

/**
 * Merge permissions and return detailed result with tracking.
 * Use this when you need to know what changed during the merge.
 */
export function mergePermissionsWithResult(
  core: PermissionRegistry,
  extensions: PermissionModule[],
  options: MergeOptions = {}
): MergeResult {
  const { allowOverride = false, strict = true } = options;
  const merged = structuredClone(core);
  const allPermissionKeys = new Set<string>();
  const added: string[] = [];
  const overridden: string[] = [];
  const warnings: string[] = [];

  // Collect core permission keys
  for (const module of Object.values(core.modules)) {
    for (const key of Object.keys(module.permissions)) {
      allPermissionKeys.add(key);
    }
  }

  for (const ext of extensions) {
    if (merged.modules[ext.name]) {
      // Module exists - merge permissions
      for (const [key, perm] of Object.entries(ext.permissions)) {
        if (allPermissionKeys.has(key)) {
          if (strict && !allowOverride) {
            throw new Error(
              `Permission collision: "${key}" already exists. ` +
              `Set allowOverride: true to override, or use a unique key.`
            );
          }
          if (allowOverride) {
            overridden.push(key);
            warnings.push(`Permission "${key}" overridden by extension "${ext.name}"`);
          }
        } else {
          added.push(key);
        }
        merged.modules[ext.name].permissions[key] = perm;
        allPermissionKeys.add(key);
      }
    } else {
      // New module
      for (const key of Object.keys(ext.permissions)) {
        if (allPermissionKeys.has(key)) {
          if (strict && !allowOverride) {
            throw new Error(
              `Permission collision: "${key}" from extension "${ext.name}" ` +
              `conflicts with existing permission.`
            );
          }
          if (allowOverride) {
            overridden.push(key);
            warnings.push(`Permission "${key}" overridden by extension "${ext.name}"`);
          }
        } else {
          added.push(key);
        }
        allPermissionKeys.add(key);
      }
      merged.modules[ext.name] = ext;
    }
  }

  // Update metadata
  const allPerms = Object.values(merged.modules).flatMap(m => Object.keys(m.permissions));
  merged.metadata = {
    ...merged.metadata,
    totalModules: Object.keys(merged.modules).length,
    totalPermissions: allPerms.length,
    generated: new Date().toISOString(),
  };

  return {
    registry: merged,
    added,
    overridden,
    warnings,
  };
}

/**
 * Validate that permission names follow namespacing convention.
 * Extensions should namespace permissions with their module name.
 *
 * ✅ GOOD: 'projects:create', 'invoices:generate'
 * ❌ BAD: 'create', 'read', 'admin' (may collide)
 */
export function validatePermissionNamespacing(
  extensions: PermissionModule[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const ext of extensions) {
    for (const key of Object.keys(ext.permissions)) {
      // Permission should be namespaced (contain :)
      if (!key.includes(':')) {
        errors.push(
          `Permission "${key}" in extension "${ext.name}" is not namespaced. ` +
          `Use "${ext.name}:${key}" instead.`
        );
      }
      // Permission should start with module name for clarity
      if (!key.startsWith(`${ext.name}:`)) {
        // This is a warning, not an error - some extensions may share permissions
        console.warn(
          `Permission "${key}" in extension "${ext.name}" doesn't follow naming convention. ` +
          `Consider using "${ext.name}:" prefix.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

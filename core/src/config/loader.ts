/**
 * Extension Loader
 *
 * Loads and composes extensions with core functionality.
 */

import type { SaasConfig, Extension } from './schema';
import { mergePermissions, corePermissions } from '../modules/permissions';
import { createRlsRegistry, coreRlsTables } from '../rls';
import { router, composeRouters } from '../trpc';
import type { PermissionRegistry, PermissionModule } from '../modules/permissions';
import type { RlsRegistry } from '../rls';

// =============================================================================
// TYPES
// =============================================================================

export interface LoadedExtensions {
  /** Merged permission registry */
  permissions: PermissionRegistry;
  /** Merged RLS registry */
  rls: RlsRegistry;
  /** Composed router (extensions only, not core) */
  extensionRouters: Record<string, ReturnType<typeof router>>;
  /** Merged schema objects */
  schema: Record<string, unknown>;
  /** Extension metadata */
  metadata: {
    loaded: string[];
    versions: Record<string, string>;
  };
}

// =============================================================================
// LOADER
// =============================================================================

/**
 * Load and compose all extensions.
 *
 * @example
 * ```ts
 * const loaded = loadExtensions(config);
 *
 * // Use merged permissions
 * const allPermissions = loaded.permissions;
 *
 * // Compose with core router
 * const appRouter = composeRouters(coreRouter, [
 *   ...Object.entries(loaded.extensionRouters).map(([name, router]) => ({ name, router }))
 * ]);
 * ```
 */
export function loadExtensions(config: SaasConfig): LoadedExtensions {
  const extensions = config.extensions || [];

  // Merge permissions (strict mode - collisions are fatal)
  const extensionPermissions = extensions
    .filter(ext => ext.permissions)
    .map(ext => ext.permissions as PermissionModule);
  const permissions = mergePermissions(corePermissions, extensionPermissions, { strict: true });

  // Merge RLS configs
  const extensionRls = extensions.reduce((acc, ext) => {
    if (ext.rls) {
      for (const rlsConfig of ext.rls) {
        acc[rlsConfig.tableName] = rlsConfig;
      }
    }
    return acc;
  }, {} as RlsRegistry);
  const rls = createRlsRegistry(extensionRls);

  // Collect extension routers
  const extensionRouters = extensions.reduce((acc, ext) => {
    if (ext.router) {
      acc[ext.name] = ext.router;
    }
    return acc;
  }, {} as Record<string, ReturnType<typeof router>>);

  // Merge schemas
  const schema = extensions.reduce((acc, ext) => {
    if (ext.schema) {
      Object.assign(acc, ext.schema);
    }
    return acc;
  }, {} as Record<string, unknown>);

  // Build metadata
  const metadata = {
    loaded: extensions.map(ext => ext.name),
    versions: extensions.reduce((acc, ext) => {
      acc[ext.name] = ext.version;
      return acc;
    }, {} as Record<string, string>),
  };

  return {
    permissions,
    rls,
    extensionRouters,
    schema,
    metadata,
  };
}

/**
 * Run extension lifecycle hooks.
 */
export async function runExtensionHooks(
  extensions: Extension[],
  hook: 'onInstall' | 'onEnable' | 'onDisable',
  context: { db: unknown }
): Promise<void> {
  for (const ext of extensions) {
    const hookFn = ext.hooks?.[hook];
    if (hookFn) {
      console.log(`Running ${hook} for extension: ${ext.name}`);
      try {
        await hookFn(context);
      } catch (error) {
        console.error(`Error running ${hook} for ${ext.name}:`, error);
        throw error;
      }
    }
  }
}

/**
 * Run extension seed functions.
 */
export async function runExtensionSeeds(
  extensions: Extension[],
  context: { db: unknown }
): Promise<void> {
  for (const ext of extensions) {
    if (ext.seeds) {
      console.log(`Running seeds for extension: ${ext.name}`);
      try {
        await ext.seeds(context);
      } catch (error) {
        console.error(`Error running seeds for ${ext.name}:`, error);
        throw error;
      }
    }
  }
}

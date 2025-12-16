/**
 * Core Role Seeding
 *
 * Generic function for seeding roles and role-permission mappings.
 * Uses schema injection pattern - apps pass their schema tables.
 */

import { seedLog } from '../../cli';
import type {
    RoleSeedData,
    RoleSeedOptions,
    RoleSeedSchema,
    SeedDatabase,
    SeedResult,
} from './types';
import { createSeedResult } from './types';

/**
 * Seed roles and their permission mappings into the database.
 *
 * @param db - Drizzle database instance
 * @param schema - Object containing roles, permissions, and rolePermissions tables
 * @param roles - Array of role configurations to seed
 * @param options - Seed options
 * @returns Seed result with counts
 *
 * @example
 * ```typescript
 * import { seedRoles } from '@jetdevs/core/db/seeds';
 * import { roles, permissions, rolePermissions } from '@/db/schema';
 * import { DEFAULT_ROLES } from '@/constants/roles';
 *
 * const result = await seedRoles(
 *   db,
 *   { roles, permissions, rolePermissions },
 *   DEFAULT_ROLES,
 *   { defaultOrgId: 1 }
 * );
 * ```
 */
export async function seedRoles(
  db: SeedDatabase,
  schema: RoleSeedSchema,
  rolesData: RoleSeedData[],
  options: RoleSeedOptions = {}
): Promise<SeedResult> {
  const { defaultOrgId = 1, updateExisting = false, verbose = false } = options;
  const result = createSeedResult();

  try {
    if (verbose) {
      seedLog(`Seeding ${rolesData.length} roles...`, 'info');
    }

    // Get existing roles and permissions
    const existingRoles = await db.select().from(schema.roles);
    const existingPermissions = await db.select().from(schema.permissions);
    const existingMappings = await db.select().from(schema.rolePermissions);

    // Create lookup maps
    const permissionBySlug = new Map(
      existingPermissions.map((p: any) => [p.slug, p])
    );
    const roleByNameAndOrg = new Map(
      existingRoles.map((r: any) => [`${r.name}-${r.orgId || 'null'}`, r])
    );
    const existingMappingSet = new Set(
      existingMappings.map((m: any) => `${m.roleId}-${m.permissionId}`)
    );

    // Process each role
    const rolesToInsert: any[] = [];
    const mappingsToInsert: any[] = [];

    for (const roleData of rolesData) {
      // Determine orgId for this role
      const roleOrgId =
        roleData.orgId === null
          ? null
          : roleData.orgId ?? (roleData.isSystemRole || roleData.isGlobalRole ? null : defaultOrgId);

      const roleKey = `${roleData.name}-${roleOrgId || 'null'}`;
      const existingRole = roleByNameAndOrg.get(roleKey);

      let roleId: number;

      if (!existingRole) {
        // Role doesn't exist - mark for insertion
        rolesToInsert.push({
          name: roleData.name,
          description: roleData.description,
          isSystemRole: roleData.isSystemRole,
          isGlobalRole: roleData.isGlobalRole,
          orgId: roleOrgId,
          isActive: true,
        });
        // We'll get the roleId after batch insert
      } else {
        roleId = existingRole.id;
        result.skipped++;

        // Process permission mappings for existing role
        for (const permissionSlug of roleData.permissions) {
          const permission = permissionBySlug.get(permissionSlug);
          if (!permission) {
            if (verbose) {
              seedLog(`Permission not found: ${permissionSlug}`, 'warning');
            }
            continue;
          }

          const mappingKey = `${roleId}-${permission.id}`;
          if (!existingMappingSet.has(mappingKey)) {
            // For system/global roles (roleOrgId === null), keep org_id as null
            // For org-specific roles, use the role's org_id or default
            const mappingOrgId = roleOrgId === null ? null : (roleOrgId ?? defaultOrgId);
            mappingsToInsert.push({
              roleId,
              permissionId: permission.id,
              orgId: mappingOrgId,
            });
          }
        }
      }
    }

    // Batch insert new roles
    if (rolesToInsert.length > 0) {
      const insertedRoles = await db
        .insert(schema.roles)
        .values(rolesToInsert)
        .returning();
      result.inserted = insertedRoles.length;

      if (verbose) {
        seedLog(`Inserted ${insertedRoles.length} new roles`, 'success');
      }

      // Process permission mappings for newly inserted roles
      for (let i = 0; i < insertedRoles.length; i++) {
        const newRole = insertedRoles[i];
        const roleData = rolesData.find(
          (r) =>
            r.name === newRole.name &&
            (r.orgId ?? (r.isSystemRole || r.isGlobalRole ? null : defaultOrgId)) === newRole.orgId
        );

        if (!roleData) continue;

        for (const permissionSlug of roleData.permissions) {
          const permission = permissionBySlug.get(permissionSlug);
          if (!permission) {
            if (verbose) {
              seedLog(`Permission not found: ${permissionSlug}`, 'warning');
            }
            continue;
          }

          // For system/global roles (newRole.orgId === null), keep org_id as null
          // For org-specific roles, use the role's org_id or default
          const mappingOrgId = newRole.orgId === null ? null : (newRole.orgId ?? defaultOrgId);
          mappingsToInsert.push({
            roleId: newRole.id,
            permissionId: permission.id,
            orgId: mappingOrgId,
          });
        }
      }
    }

    // Batch insert permission mappings
    if (mappingsToInsert.length > 0) {
      await db.insert(schema.rolePermissions).values(mappingsToInsert);

      if (verbose) {
        seedLog(
          `Inserted ${mappingsToInsert.length} role-permission mappings`,
          'success'
        );
      }
    }

    if (verbose) {
      seedLog(
        `Role seeding complete: ${result.inserted} roles inserted, ${result.skipped} roles skipped, ${mappingsToInsert.length} mappings created`,
        'success'
      );
    }
  } catch (error) {
    result.success = false;
    result.errors.push(String(error));
    seedLog(`Role seeding failed: ${error}`, 'error');
  }

  return result;
}

/**
 * Get summary of roles and their permission counts.
 *
 * @param db - Drizzle database instance
 * @param schema - Object containing roles and rolePermissions tables
 * @returns Array of role summaries
 */
export async function getRoleSummary(
  db: SeedDatabase,
  schema: Pick<RoleSeedSchema, 'roles' | 'rolePermissions'>
): Promise<
  Array<{
    name: string;
    type: string;
    permissionCount: number;
  }>
> {
  const roles = await db.select().from(schema.roles);
  const mappings = await db.select().from(schema.rolePermissions);

  return roles.map((role: any) => {
    const roleType = role.isSystemRole
      ? 'system'
      : role.isGlobalRole
        ? 'global'
        : 'org';
    const permissionCount = mappings.filter(
      (m: any) => m.roleId === role.id
    ).length;

    return {
      name: role.name,
      type: roleType,
      permissionCount,
    };
  });
}

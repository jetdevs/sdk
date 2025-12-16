'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib';

// =============================================================================
// SVG ICONS - Built-in to avoid lucide-react dependency
// =============================================================================

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("animate-spin", className)}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const AlertCircleIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const MinusIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14" />
  </svg>
);

const InfoIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Permission definition from the registry
 */
export interface PermissionDefinition {
  slug: string;
  name: string;
  description?: string;
}

/**
 * Permission module from the registry
 */
export interface PermissionModule {
  name: string;
  description: string;
  category: string;
  permissions: Record<string, PermissionDefinition>;
}

/**
 * Permission registry structure
 */
export interface PermissionRegistry {
  modules: Record<string, PermissionModule>;
}

/**
 * Database permission with ID
 */
export interface DbPermission {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
}

/**
 * Role with stats for the matrix
 */
export interface RoleWithStatsForMatrix {
  id: number;
  name: string;
  isSystemRole?: boolean;
  isGlobalRole?: boolean;
  orgId?: number | null;
}

/**
 * Role with permissions response
 */
export interface RoleWithPermissions {
  permissions: Array<{ id: number }>;
}

export interface ToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * UI components for the ManagePermissionsMatrix
 */
export interface ManagePermissionsMatrixUIComponents {
  // Dialog components
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  DialogContent: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
  }>;
  DialogHeader: React.ComponentType<{
    children: React.ReactNode;
  }>;
  DialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  DialogDescription: React.ComponentType<{
    children: React.ReactNode;
  }>;
  DialogFooter: React.ComponentType<{
    children: React.ReactNode;
  }>;

  // Form components
  Button: React.ComponentType<{
    type?: 'button' | 'submit';
    variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }>;
  Input: React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
  Badge: React.ComponentType<{
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
    className?: string;
    children?: React.ReactNode;
  }>;
  ScrollArea: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;

  // Tooltip components (optional)
  TooltipProvider?: React.ComponentType<{ children: React.ReactNode }>;
  Tooltip?: React.ComponentType<{ children: React.ReactNode }>;
  TooltipTrigger?: React.ComponentType<{ asChild?: boolean; children: React.ReactNode }>;
  TooltipContent?: React.ComponentType<{
    side?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
    children: React.ReactNode;
  }>;

  // Toast
  toast: ToastInterface;
}

/**
 * API interface for the matrix
 */
export interface ManagePermissionsMatrixApi {
  permission: {
    getAllWithUsage: {
      useQuery: () => { data: DbPermission[] | undefined; isLoading: boolean };
    };
  };
  role: {
    getWithPermissions: {
      useQuery: (
        input: { roleId: number; crossOrgAccess?: boolean; orgId?: number },
        options?: { enabled?: boolean; retry?: boolean; refetchOnMount?: 'always' | boolean; staleTime?: number; cacheTime?: number; refetchOnWindowFocus?: boolean }
      ) => { data: RoleWithPermissions | undefined; isLoading: boolean; error: Error | null };
    };
    assignPermissions: {
      useMutation: () => {
        mutateAsync: (input: {
          roleId: number;
          permissionIds: number[];
          orgId?: number;
          crossOrgAccess?: boolean;
        }) => Promise<void>;
      };
    };
  };
  useUtils: () => {
    role: {
      getAllWithStats: { invalidate: () => Promise<void> };
      getWithPermissions: { invalidate: (input: { roleId: number; crossOrgAccess?: boolean; orgId?: number }) => Promise<void> };
    };
  };
}

/**
 * Configuration for the ManagePermissionsMatrix factory
 */
export interface ManagePermissionsMatrixConfig {
  /** Permission registry containing all modules and permissions */
  registry: PermissionRegistry;
  /** Module names that should only be visible to superusers */
  superuserOnlyModules?: string[];
}

/**
 * Props for the created ManagePermissionsMatrix component
 */
export interface ManagePermissionsMatrixProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  role: RoleWithStatsForMatrix | null;
  orgContext?: number | null;
  forceCrossOrg?: boolean;
  /** Whether current user is a superuser (can edit system roles) */
  isSuperuser?: boolean;
}

/**
 * Factory config interface
 */
export interface ManagePermissionsMatrixFactoryConfig {
  config: ManagePermissionsMatrixConfig;
  api: ManagePermissionsMatrixApi;
  ui: ManagePermissionsMatrixUIComponents;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function areSetsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface ModulePermissions {
  module: PermissionModule;
  moduleName: string;
  permissions: {
    create?: PermissionDefinition;
    read?: PermissionDefinition;
    update?: PermissionDefinition;
    delete?: PermissionDefinition;
    special: PermissionDefinition[];
  };
}

const CRUD_OPS = ['create', 'read', 'update', 'delete'] as const;

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a ManagePermissionsMatrix component.
 *
 * This creates a CRUD matrix UI for permission management with:
 * - Module/permission grouping with expansion
 * - CRUD columns (Create/Read/Update/Delete)
 * - Smart permission inference (checking Update auto-checks Read)
 * - Search and filtering
 * - Changes summary
 * - Selection state indicators
 *
 * @example
 * ```typescript
 * import { createManagePermissionsMatrix } from '@jetdevs/core/ui/admin';
 * import { PERMISSION_REGISTRY } from '@/permissions/registry';
 * import { api } from '@/utils/trpc';
 *
 * const ManagePermissionsMatrix = createManagePermissionsMatrix({
 *   config: {
 *     registry: PERMISSION_REGISTRY,
 *     superuserOnlyModules: ['admin', 'endpoints', 'organization'],
 *   },
 *   api: api as any,
 *   ui: {
 *     Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
 *     Button, Input, Badge, ScrollArea,
 *     TooltipProvider, Tooltip, TooltipTrigger, TooltipContent,
 *     toast,
 *   },
 * });
 * ```
 */
export function createManagePermissionsMatrix(
  factoryConfig: ManagePermissionsMatrixFactoryConfig
) {
  const { config, api, ui } = factoryConfig;
  const {
    registry,
    superuserOnlyModules = [],
  } = config;

  const {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Input,
    Badge,
    ScrollArea,
    TooltipProvider,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    toast,
  } = ui;

  // Check if tooltips are available
  const hasTooltips = TooltipProvider && Tooltip && TooltipTrigger && TooltipContent;

  // =========================================================================
  // MAIN COMPONENT
  // =========================================================================

  function ManagePermissionsMatrix({
    open,
    onClose,
    onSuccess,
    role,
    orgContext,
    forceCrossOrg = true,
    isSuperuser = false,
  }: ManagePermissionsMatrixProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set());
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

    // Fetch all permissions with usage stats
    const { data: allPermissions = [], isLoading: permissionsLoading } = api.permission.getAllWithUsage.useQuery();

    // Determine target org for cross-org/system views
    const targetOrgId = orgContext ?? role?.orgId ?? null;

    // Fetch current role permissions
    const { data: roleWithPermissions, isLoading: roleLoading, error: roleError } = api.role.getWithPermissions.useQuery(
      {
        roleId: role?.id || 0,
        crossOrgAccess: forceCrossOrg || isSuperuser,
        orgId: targetOrgId === null ? undefined : targetOrgId,
      },
      {
        enabled: !!role?.id,
        retry: false,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        staleTime: 0,
        cacheTime: 0,
      }
    );

    const assignPermissionsMutation = api.role.assignPermissions.useMutation();
    const utils = api.useUtils();

    const isSystemRole = role?.isSystemRole || false;
    const isGlobalRole = role?.isGlobalRole || (role?.name === 'Owner' || role?.name === 'Admin');
    const isLoading = permissionsLoading || roleLoading;

    // Permission editing rules
    const canEditPermissions = isSuperuser ? true : !isGlobalRole;
    const canEditSystemRole = isSuperuser;

    // Create a mapping from slug to permission data
    const permissionsBySlug = useMemo(() => {
      const map = new Map<string, DbPermission>();
      allPermissions.forEach(p => map.set(p.slug, p));
      return map;
    }, [allPermissions]);

    // Process modules for matrix display
    const modulePermissions = useMemo((): ModulePermissions[] => {
      const results: ModulePermissions[] = [];

      Object.entries(registry.modules).forEach(([moduleName, module]) => {
        // Skip if module has no permissions
        if (!module.permissions || Object.keys(module.permissions).length === 0) return;

        // Hide superuser-only modules from non-superusers
        if (!isSuperuser && superuserOnlyModules.includes(moduleName)) {
          return;
        }

        const moduleBaseSlug = moduleName.endsWith('s') ? moduleName.slice(0, -1) : moduleName;

        const modulePerms: ModulePermissions = {
          module,
          moduleName,
          permissions: {
            special: []
          }
        };

        // Categorize permissions into CRUD and special
        Object.values(module.permissions).forEach(perm => {
          const crudOp = CRUD_OPS.find(op =>
            perm.slug.endsWith(`:${op}`) ||
            perm.slug.includes(`:${op}:`)
          );

          if (crudOp) {
            const existing = modulePerms.permissions[crudOp];
            const isModuleSlug = perm.slug.startsWith(`${moduleBaseSlug}:`);
            const existingIsModuleSlug = existing?.slug.startsWith(`${moduleBaseSlug}:`);

            if (!existing || (isModuleSlug && !existingIsModuleSlug)) {
              modulePerms.permissions[crudOp] = perm;
            } else {
              modulePerms.permissions.special.push(perm);
            }
          } else {
            modulePerms.permissions.special.push(perm);
          }
        });

        // Only include modules that match search
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          const moduleMatches =
            module.name.toLowerCase().includes(searchLower) ||
            moduleName.toLowerCase().includes(searchLower) ||
            module.description.toLowerCase().includes(searchLower);

          const hasMatchingPermission = Object.values(module.permissions).some(p =>
            p.name.toLowerCase().includes(searchLower) ||
            p.slug.toLowerCase().includes(searchLower) ||
            (p.description && p.description.toLowerCase().includes(searchLower))
          );

          if (!moduleMatches && !hasMatchingPermission) return;
        }

        results.push(modulePerms);
      });

      // Sort modules by category and name
      return results.sort((a, b) => {
        if (a.module.category !== b.module.category) {
          return a.module.category.localeCompare(b.module.category);
        }
        return a.module.name.localeCompare(b.module.name);
      });
    }, [searchTerm, isSuperuser, registry.modules, superuserOnlyModules]);

    // Initialize selected permissions when role data loads
    useEffect(() => {
      if (roleWithPermissions?.permissions && open) {
        const permissionIds = roleWithPermissions.permissions.map(p => p.id);
        setSelectedPermissionIds(new Set<number>(permissionIds));
      }
    }, [roleWithPermissions, open]);

    // Reset state when dialog closes
    useEffect(() => {
      if (!open) {
        setSearchTerm('');
        setSelectedPermissionIds(new Set());
        setExpandedModules(new Set());
      }
    }, [open]);

    // Calculate changes
    const originalPermissionIds = new Set<number>(roleWithPermissions?.permissions?.map(p => p.id) || []);
    const hasChanges = !areSetsEqual(originalPermissionIds, selectedPermissionIds);
    const addedCount = Array.from(selectedPermissionIds).filter(id => !originalPermissionIds.has(id)).length;
    const removedCount = Array.from(originalPermissionIds).filter(id => !selectedPermissionIds.has(id)).length;

    const handleClose = () => {
      if (!isSubmitting) {
        onClose();
      }
    };

    const isPermissionSelected = (slug: string): boolean => {
      const perm = permissionsBySlug.get(slug);
      return perm ? selectedPermissionIds.has(perm.id) : false;
    };

    const togglePermission = (slug: string, selected: boolean) => {
      if ((isSystemRole && !canEditSystemRole) || !canEditPermissions) return;

      const perm = permissionsBySlug.get(slug);
      if (!perm) {
        toast.error(`Permission "${slug}" not found in database. Please refresh and try again.`);
        return;
      }

      setSelectedPermissionIds(prev => {
        const newSet = new Set(prev);
        if (selected) {
          newSet.add(perm.id);
          applyPermissionInference(slug, newSet, true);
        } else {
          newSet.delete(perm.id);
          applyPermissionInference(slug, newSet, false);
        }
        return newSet;
      });
    };

    // Apply smart inference rules for permissions
    const applyPermissionInference = (slug: string, permSet: Set<number>, isAdding: boolean) => {
      const modulePrefix = slug.substring(0, slug.lastIndexOf(':'));

      if (isAdding) {
        // If adding update, ensure read is also selected
        if (slug.endsWith(':update')) {
          const readSlug = `${modulePrefix}:read`;
          const readPerm = permissionsBySlug.get(readSlug);
          if (readPerm) permSet.add(readPerm.id);
        }
        // If adding delete, ensure update and read are also selected
        else if (slug.endsWith(':delete')) {
          const updateSlug = `${modulePrefix}:update`;
          const readSlug = `${modulePrefix}:read`;
          const updatePerm = permissionsBySlug.get(updateSlug);
          const readPerm = permissionsBySlug.get(readSlug);
          if (updatePerm) permSet.add(updatePerm.id);
          if (readPerm) permSet.add(readPerm.id);
        }
      } else {
        // If removing read, also remove update and delete
        if (slug.endsWith(':read')) {
          const updateSlug = `${modulePrefix}:update`;
          const deleteSlug = `${modulePrefix}:delete`;
          const updatePerm = permissionsBySlug.get(updateSlug);
          const deletePerm = permissionsBySlug.get(deleteSlug);
          if (updatePerm) permSet.delete(updatePerm.id);
          if (deletePerm) permSet.delete(deletePerm.id);
        }
        // If removing update, also remove delete
        else if (slug.endsWith(':update')) {
          const deleteSlug = `${modulePrefix}:delete`;
          const deletePerm = permissionsBySlug.get(deleteSlug);
          if (deletePerm) permSet.delete(deletePerm.id);
        }
      }
    };

    const toggleModuleExpansion = (moduleName: string) => {
      setExpandedModules(prev => {
        const newSet = new Set(prev);
        if (!newSet.has(moduleName)) {
          newSet.clear();
          newSet.add(moduleName);
        } else {
          newSet.delete(moduleName);
        }
        return newSet;
      });
    };

    const selectAllModulePermissions = (modulePerms: ModulePermissions) => {
      if ((isSystemRole && !canEditSystemRole) || !canEditPermissions) return;

      setSelectedPermissionIds(prev => {
        const newSet = new Set(prev);

        CRUD_OPS.forEach(op => {
          const perm = modulePerms.permissions[op];
          if (perm) {
            const dbPerm = permissionsBySlug.get(perm.slug);
            if (dbPerm) newSet.add(dbPerm.id);
          }
        });

        modulePerms.permissions.special.forEach(perm => {
          const dbPerm = permissionsBySlug.get(perm.slug);
          if (dbPerm) newSet.add(dbPerm.id);
        });

        return newSet;
      });
    };

    const deselectAllModulePermissions = (modulePerms: ModulePermissions) => {
      if ((isSystemRole && !canEditSystemRole) || !canEditPermissions) return;

      setSelectedPermissionIds(prev => {
        const newSet = new Set(prev);

        CRUD_OPS.forEach(op => {
          const perm = modulePerms.permissions[op];
          if (perm) {
            const dbPerm = permissionsBySlug.get(perm.slug);
            if (dbPerm) newSet.delete(dbPerm.id);
          }
        });

        modulePerms.permissions.special.forEach(perm => {
          const dbPerm = permissionsBySlug.get(perm.slug);
          if (dbPerm) newSet.delete(dbPerm.id);
        });

        return newSet;
      });
    };

    const getModuleSelectionState = (modulePerms: ModulePermissions): 'all' | 'none' | 'partial' => {
      const allPerms = [
        ...CRUD_OPS.map(op => modulePerms.permissions[op]).filter(Boolean),
        ...modulePerms.permissions.special
      ] as PermissionDefinition[];

      const selectedCount = allPerms.filter(p => isPermissionSelected(p.slug)).length;

      if (selectedCount === 0) return 'none';
      if (selectedCount === allPerms.length) return 'all';
      return 'partial';
    };

    const handleSave = async () => {
      if (!role) return;

      setIsSubmitting(true);

      try {
        await assignPermissionsMutation.mutateAsync({
          roleId: role.id,
          permissionIds: Array.from(selectedPermissionIds),
          orgId: targetOrgId === null ? undefined : targetOrgId,
          crossOrgAccess: forceCrossOrg || isSuperuser,
        });

        await Promise.all([
          utils.role.getAllWithStats.invalidate(),
          utils.role.getWithPermissions.invalidate({
            roleId: role.id,
            crossOrgAccess: forceCrossOrg || isSuperuser,
            orgId: targetOrgId === null ? undefined : targetOrgId
          }),
        ]);

        toast.success(`Permissions updated for role "${role.name}"`);

        onSuccess?.();
        onClose();
      } catch (error: unknown) {
        console.error('Error updating permissions:', error);

        let errorMessage = 'Failed to update permissions.';
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        if (errorMessage.includes('not found')) {
          toast.error('Role not found. It may have been deleted.');
        } else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
          toast.error("You don't have permission to manage role permissions.");
        } else {
          toast.error(`Failed to update permissions: ${errorMessage}`);
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!role) return null;

    // Render with or without tooltips
    const renderContent = () => (
      <>
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <ShieldIcon className="w-5 h-5" />
            Manage Permissions - Matrix View
            {isSystemRole && (
              <Badge variant="secondary" className="ml-2">
                <LockIcon className="mr-1 w-3 h-3" />
                System Role
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isSystemRole
              ? `System role "${role.name}" permissions are read-only to maintain system integrity.`
              : isGlobalRole && !isSuperuser
              ? `Global role "${role.name}" permissions can only be modified by Super Users.`
              : `Assign permissions to the "${role.name}" role. Check marks will intelligently cascade (e.g., checking Delete auto-checks Update and Read).`
            }
          </DialogDescription>
        </DialogHeader>

        {roleError ? (
          <div className="flex justify-center items-center py-8">
            <div className="text-center">
              <AlertCircleIcon className="mx-auto mb-2 w-8 h-8 text-red-500" />
              <p className="font-medium text-red-600">Failed to load role permissions</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {roleError.message || 'The role may have been deleted or you may not have access to it.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  onClose();
                  utils.role.getAllWithStats.invalidate();
                }}
              >
                Close and Refresh
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center items-center py-8">
            <LoaderIcon className="w-6 h-6" />
            <span className="ml-2">Loading permissions...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search */}
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 w-4 h-4 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search modules or permissions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10 pl-10"
                    disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Changes Summary */}
            {hasChanges && !isSystemRole && (
              <div className="p-3 rounded-lg border bg-muted/50">
                <div className="flex gap-2 items-center text-sm">
                  <AlertCircleIcon className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">Pending Changes:</span>
                  <span className="text-green-600">+{addedCount} Added</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-red-600">-{removedCount} Removed</span>
                </div>
              </div>
            )}

            {/* Permission Matrix */}
            <div className="rounded-md border" style={{ height: '500px', overflowY: 'auto', overflowX: 'auto' }}>
              <div className="p-4" style={{ minWidth: '600px' }}>
                {/* Header */}
                <div className="sticky top-0 z-10 pb-2 mb-2 border-b bg-background">
                  <div
                    className="text-sm font-medium"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 80px 80px',
                      gap: '16px',
                      alignItems: 'center'
                    }}
                  >
                    <div>Module</div>
                    <div style={{ textAlign: 'center' }}>Create</div>
                    <div style={{ textAlign: 'center' }}>Read</div>
                    <div style={{ textAlign: 'center' }}>Update</div>
                    <div style={{ textAlign: 'center' }}>Delete</div>
                  </div>
                </div>

                {/* Module Rows */}
                <div className="space-y-1">
                  {modulePermissions.map((modulePerms) => {
                    const selectionState = getModuleSelectionState(modulePerms);
                    const hasSpecialPerms = modulePerms.permissions.special.length > 0;
                    const isExpanded = expandedModules.has(modulePerms.moduleName);

                    return (
                      <div key={modulePerms.moduleName} className="space-y-1">
                        {/* Module Row */}
                        <div
                          className="py-2 px-1 rounded hover:bg-muted/50"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 80px 80px 80px 80px',
                            gap: '16px',
                            alignItems: 'center'
                          }}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            const isInteractive = target.closest('button') || target.closest('input');

                            if (!isInteractive) {
                              setExpandedModules(prev => {
                                const newSet = new Set<string>();
                                if (hasSpecialPerms && !isExpanded) {
                                  newSet.add(modulePerms.moduleName);
                                }
                                return newSet;
                              });
                            }
                          }}
                        >
                          {/* Module Name */}
                          <div className="flex gap-2 items-center">
                            <div className="flex-1">
                              <div className="flex gap-2 items-center">
                                <span className="font-medium">{modulePerms.module.name}</span>
                                {hasSpecialPerms && (
                                  <button
                                    onClick={() => toggleModuleExpansion(modulePerms.moduleName)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
                                    disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                                  >
                                    <span>{modulePerms.permissions.special.length}</span>
                                    {isExpanded ? (
                                      <ChevronDownIcon className="w-3 h-3" />
                                    ) : (
                                      <ChevronRightIcon className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {modulePerms.module.description}
                              </div>
                            </div>
                            {/* Selection state indicator */}
                            <button
                              onClick={() => {
                                if (selectionState === 'all') {
                                  deselectAllModulePermissions(modulePerms);
                                } else {
                                  selectAllModulePermissions(modulePerms);
                                }
                              }}
                              disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                              className={cn(
                                'p-1 rounded hover:bg-muted',
                                isSystemRole && 'opacity-50 cursor-not-allowed'
                              )}
                              title={selectionState === 'all' ? 'Deselect all' : 'Select all'}
                            >
                              {selectionState === 'all' && <CheckIcon className="w-4 h-4 text-green-600" />}
                              {selectionState === 'partial' && <MinusIcon className="w-4 h-4 text-amber-600" />}
                              {selectionState === 'none' && <XIcon className="w-4 h-4 text-muted-foreground" />}
                            </button>
                          </div>

                          {/* CRUD Checkboxes */}
                          {CRUD_OPS.map(op => {
                            const perm = modulePerms.permissions[op];
                            const isSelected = perm ? isPermissionSelected(perm.slug) : false;

                            return (
                              <div key={op} className="flex justify-center">
                                {perm ? (
                                  <button
                                    onClick={() => togglePermission(perm.slug, !isSelected)}
                                    disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                                    className={cn(
                                      'w-6 h-6 rounded border-2 flex items-center justify-center transition-colors',
                                      isSelected
                                        ? 'bg-primary border-primary text-primary-foreground'
                                        : 'border-muted-foreground hover:border-primary',
                                      isSystemRole && 'opacity-50 cursor-not-allowed'
                                    )}
                                    title={perm.description || perm.name}
                                  >
                                    {isSelected && <CheckIcon className="w-4 h-4" />}
                                  </button>
                                ) : (
                                  <div className="w-6 h-6" />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Expanded Special Permissions */}
                        {hasSpecialPerms && isExpanded && (
                          <div className="p-3 mt-2 rounded-lg bg-muted/30">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium">Special Permissions</span>
                              <button
                                onClick={() => {
                                  const allSelected = modulePerms.permissions.special.every(p =>
                                    isPermissionSelected(p.slug)
                                  );
                                  modulePerms.permissions.special.forEach(perm => {
                                    togglePermission(perm.slug, !allSelected);
                                  });
                                }}
                                disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                                className={cn(
                                  'text-xs px-2 py-1 rounded hover:bg-muted transition-colors',
                                  isSystemRole && 'opacity-50 cursor-not-allowed'
                                )}
                              >
                                {modulePerms.permissions.special.every(p => isPermissionSelected(p.slug))
                                  ? 'Deselect All'
                                  : 'Select All'}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                              {modulePerms.permissions.special.map(perm => {
                                const isSelected = isPermissionSelected(perm.slug);

                                const checkboxContent = (
                                  <div className="flex gap-2 items-center p-2 rounded cursor-pointer hover:bg-muted/50">
                                    <button
                                      onClick={() => togglePermission(perm.slug, !isSelected)}
                                      disabled={(isSystemRole && !canEditSystemRole) || !canEditPermissions}
                                      className={cn(
                                        'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                                        isSelected
                                          ? 'bg-primary border-primary text-primary-foreground'
                                          : 'border-muted-foreground hover:border-primary',
                                        isSystemRole && 'opacity-50 cursor-not-allowed'
                                      )}
                                    >
                                      {isSelected && <CheckIcon className="w-3 h-3" />}
                                    </button>
                                    <span className="flex flex-1 gap-1 items-center text-sm truncate">
                                      {perm.name}
                                      <InfoIcon className="flex-shrink-0 w-3 h-3 text-muted-foreground" />
                                    </span>
                                  </div>
                                );

                                if (hasTooltips && Tooltip && TooltipTrigger && TooltipContent) {
                                  return (
                                    <Tooltip key={perm.slug}>
                                      <TooltipTrigger asChild>
                                        {checkboxContent}
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="space-y-1">
                                          <p className="font-medium">{perm.name}</p>
                                          {perm.description && (
                                            <p className="text-xs text-muted-foreground">{perm.description}</p>
                                          )}
                                          <p className="text-xs font-mono bg-muted px-1 py-0.5 rounded inline-block">
                                            {perm.slug}
                                          </p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                }

                                return (
                                  <div key={perm.slug} title={`${perm.name}: ${perm.description || perm.slug}`}>
                                    {checkboxContent}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting || !hasChanges || (isSystemRole && !canEditSystemRole) || !canEditPermissions}
          >
            {isSubmitting && <LoaderIcon className="mr-2 w-4 h-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </>
    );

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-h-[90vh]" style={{ maxWidth: '1200px', width: '95vw' }}>
          {hasTooltips && TooltipProvider ? (
            <TooltipProvider>
              {renderContent()}
            </TooltipProvider>
          ) : (
            renderContent()
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return ManagePermissionsMatrix;
}

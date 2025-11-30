'use client';

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
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

const CheckSquareIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const SquareIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Database permission with stats
 */
export interface DbPermission {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  roleCount?: number;
  roles?: Array<{
    roleId: number;
    roleName: string;
    isSystemRole: boolean;
  }>;
}

/**
 * Category with count
 */
export interface CategoryCount {
  category: string | null;
  count: number;
}

/**
 * Role with stats
 */
export interface RoleWithStatsForDialog {
  id: number;
  name: string;
  isSystemRole?: boolean;
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
 * UI components for the ManagePermissionsDialog
 */
export interface ManagePermissionsDialogUIComponents {
  // Dialog components
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  DialogContent: React.ComponentType<{
    className?: string;
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
  Label: React.ComponentType<React.LabelHTMLAttributes<HTMLLabelElement>>;
  Badge: React.ComponentType<{
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
    className?: string;
    children?: React.ReactNode;
  }>;
  ScrollArea: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;

  // Tabs components
  Tabs: React.ComponentType<{
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }>;
  TabsList: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  TabsTrigger: React.ComponentType<{
    value: string;
    children: React.ReactNode;
  }>;
  TabsContent: React.ComponentType<{
    value: string;
    className?: string;
    children: React.ReactNode;
  }>;

  // Toast
  toast: ToastInterface;
}

/**
 * API interface for the dialog
 */
export interface ManagePermissionsDialogApi {
  permission: {
    getAllWithUsage: {
      useQuery: () => { data: DbPermission[] | undefined; isLoading: boolean };
    };
    getCategoriesWithCounts: {
      useQuery: () => { data: CategoryCount[] | undefined };
    };
  };
  role: {
    getWithPermissions: {
      useQuery: (
        input: { roleId: number; crossOrgAccess?: boolean },
        options?: { enabled?: boolean }
      ) => { data: RoleWithPermissions | undefined; isLoading: boolean };
    };
    assignPermissions: {
      useMutation: () => {
        mutateAsync: (input: {
          roleId: number;
          permissionIds: number[];
          crossOrgAccess?: boolean;
        }) => Promise<void>;
      };
    };
  };
  useUtils: () => {
    role: {
      getAllWithStats: { invalidate: () => Promise<void> };
      getWithPermissions: { invalidate: (input: { roleId: number }) => Promise<void> };
    };
  };
}

/**
 * Props for the created ManagePermissionsDialog component
 */
export interface ManagePermissionsDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  role: RoleWithStatsForDialog | null;
  /** Whether current user can edit this role */
  canEditRole?: boolean;
}

/**
 * Factory config interface
 */
export interface ManagePermissionsDialogFactoryConfig {
  api: ManagePermissionsDialogApi;
  ui: ManagePermissionsDialogUIComponents;
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
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a ManagePermissionsDialog component.
 *
 * This creates a simpler permission management dialog with:
 * - Dialog shell with search/filter
 * - Permission grouping by category
 * - Select All / Deselect All per category
 * - Changes summary
 * - Category tabs
 *
 * @example
 * ```typescript
 * import { createManagePermissionsDialog } from '@yobolabs/core/ui/admin';
 * import { api } from '@/utils/trpc';
 *
 * const ManagePermissionsDialog = createManagePermissionsDialog({
 *   api: api as any,
 *   ui: {
 *     Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
 *     Button, Input, Label, Badge, ScrollArea,
 *     Tabs, TabsList, TabsTrigger, TabsContent,
 *     toast,
 *   },
 * });
 * ```
 */
export function createManagePermissionsDialog(
  factoryConfig: ManagePermissionsDialogFactoryConfig
) {
  const { api, ui } = factoryConfig;

  const {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Input,
    Label,
    Badge,
    ScrollArea,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    toast,
  } = ui;

  // =========================================================================
  // PERMISSION CATEGORY SECTION COMPONENT
  // =========================================================================

  interface PermissionCategorySectionProps {
    category: string;
    permissions: DbPermission[];
    selectedPermissions: Set<number>;
    onPermissionToggle: (permissionId: number, checked: boolean) => void;
    onSelectAll: (permissions: DbPermission[]) => void;
    onDeselectAll: (permissions: DbPermission[]) => void;
    canEditRole: boolean;
  }

  function PermissionCategorySection({
    category,
    permissions,
    selectedPermissions,
    onPermissionToggle,
    onSelectAll,
    onDeselectAll,
    canEditRole,
  }: PermissionCategorySectionProps) {
    const selectedCount = permissions.filter(p => selectedPermissions.has(p.id)).length;
    const allSelected = selectedCount === permissions.length;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-medium capitalize">{category}</h4>
            <Badge variant="outline">
              {selectedCount}/{permissions.length}
            </Badge>
          </div>
          {canEditRole && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectAll(permissions)}
                disabled={allSelected}
              >
                <CheckSquareIcon className="h-3 w-3 mr-1" />
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDeselectAll(permissions)}
                disabled={selectedCount === 0}
              >
                <SquareIcon className="h-3 w-3 mr-1" />
                None
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {permissions.map(permission => (
            <div
              key={permission.id}
              className="flex items-start space-x-3 p-3 rounded-lg border bg-card"
            >
              <input
                type="checkbox"
                id={`permission-${permission.id}`}
                checked={selectedPermissions.has(permission.id)}
                onChange={(e) => onPermissionToggle(permission.id, e.target.checked)}
                disabled={!canEditRole}
                className="mt-1 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <Label
                  htmlFor={`permission-${permission.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {permission.name}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {permission.description || 'No description available'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    {permission.slug}
                  </Badge>
                  {permission.roleCount !== undefined && permission.roleCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      <UsersIcon className="h-3 w-3 mr-1" />
                      {permission.roleCount} {permission.roleCount === 1 ? 'role' : 'roles'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN COMPONENT
  // =========================================================================

  function ManagePermissionsDialog({
    open,
    onClose,
    onSuccess,
    role,
    canEditRole = true,
  }: ManagePermissionsDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedPermissions, setSelectedPermissions] = useState<Set<number>>(new Set());

    // Fetch all permissions with usage stats
    const { data: allPermissions = [], isLoading: permissionsLoading } = api.permission.getAllWithUsage.useQuery();

    // Fetch current role permissions
    const { data: roleWithPermissions, isLoading: roleLoading } = api.role.getWithPermissions.useQuery(
      {
        roleId: role?.id || 0,
        crossOrgAccess: true,
      },
      { enabled: !!role?.id }
    );

    // Fetch permission categories
    const { data: categories = [] } = api.permission.getCategoriesWithCounts.useQuery();

    const assignPermissionsMutation = api.role.assignPermissions.useMutation();
    const utils = api.useUtils();

    const isSystemRole = role?.isSystemRole || false;
    const isLoading = permissionsLoading || roleLoading;

    // Initialize selected permissions when role data loads
    useEffect(() => {
      if (roleWithPermissions?.permissions && open) {
        const currentPermissionIds = new Set(
          roleWithPermissions.permissions.map(p => p.id)
        );
        setSelectedPermissions(currentPermissionIds as Set<number>);
      }
    }, [roleWithPermissions, open]);

    // Reset state when dialog closes
    useEffect(() => {
      if (!open) {
        setSearchTerm('');
        setSelectedCategory('all');
        setSelectedPermissions(new Set());
      }
    }, [open]);

    // Filter permissions based on search and category
    const filteredPermissions = useMemo(() => {
      return allPermissions.filter(permission => {
        const matchesSearch =
          permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          permission.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (permission.description && permission.description.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesCategory = selectedCategory === 'all' || (permission.category && permission.category === selectedCategory);

        return matchesSearch && matchesCategory;
      });
    }, [allPermissions, searchTerm, selectedCategory]);

    // Group permissions by category
    const permissionsByCategory = useMemo(() => {
      const grouped: Record<string, DbPermission[]> = {};
      filteredPermissions.forEach(permission => {
        const category = permission.category || 'uncategorized';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category]!.push(permission);
      });
      return grouped;
    }, [filteredPermissions]);

    // Calculate changes
    const originalPermissions = new Set(roleWithPermissions?.permissions?.map(p => p.id) || []);
    const hasChanges = !areSetsEqual(originalPermissions, selectedPermissions);
    const addedPermissions = Array.from(selectedPermissions).filter(id => !originalPermissions.has(id));
    const removedPermissions = Array.from(originalPermissions).filter(id => !selectedPermissions.has(id));

    const handleClose = () => {
      if (!isSubmitting) {
        onClose();
      }
    };

    const handlePermissionToggle = (permissionId: number, checked: boolean) => {
      if (!canEditRole) return;

      setSelectedPermissions(prev => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(permissionId);
        } else {
          newSet.delete(permissionId);
        }
        return newSet;
      });
    };

    const handleSelectAll = (categoryPermissions: DbPermission[]) => {
      if (!canEditRole) return;

      setSelectedPermissions(prev => {
        const newSet = new Set(prev);
        categoryPermissions.forEach(p => newSet.add(p.id));
        return newSet;
      });
    };

    const handleDeselectAll = (categoryPermissions: DbPermission[]) => {
      if (!canEditRole) return;

      setSelectedPermissions(prev => {
        const newSet = new Set(prev);
        categoryPermissions.forEach(p => newSet.delete(p.id));
        return newSet;
      });
    };

    const handleSave = async () => {
      if (!role) return;

      setIsSubmitting(true);

      try {
        await assignPermissionsMutation.mutateAsync({
          roleId: role.id,
          permissionIds: Array.from(selectedPermissions),
          crossOrgAccess: true,
        });

        await Promise.all([
          utils.role.getAllWithStats.invalidate(),
          utils.role.getWithPermissions.invalidate({ roleId: role.id }),
        ]);

        toast.success(`Permissions updated for role "${role.name}"`);

        onSuccess?.();
        onClose();
      } catch (error: unknown) {
        console.error('Error updating permissions:', error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found')) {
          toast.error('Role not found. It may have been deleted.');
        } else {
          toast.error('Failed to update permissions. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!role) return null;

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldIcon className="h-5 w-5" />
              Manage Permissions
              {isSystemRole && (
                <Badge variant="secondary" className="ml-2">
                  <LockIcon className="h-3 w-3 mr-1" />
                  System Role
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {!canEditRole
                ? 'Only Super Users can manage role permissions. You have read-only access.'
                : `Assign permissions to the "${role.name}" role. Users with this role will inherit these permissions.`
              }
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoaderIcon className="h-6 w-6" />
              <span className="ml-2">Loading permissions...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search and Filters */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search permissions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      disabled={!canEditRole}
                    />
                  </div>
                </div>
              </div>

              {/* Changes Summary */}
              {hasChanges && canEditRole && (
                <div className="rounded-lg border p-3 bg-muted/50">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <AlertCircleIcon className="h-4 w-4 text-amber-500" />
                    Pending Changes
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-green-600 font-medium">
                        +{addedPermissions.length} Added
                      </span>
                    </div>
                    <div>
                      <span className="text-red-600 font-medium">
                        -{removedPermissions.length} Removed
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Tabs */}
              <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                <TabsList className="grid w-full grid-cols-auto">
                  <TabsTrigger value="all">
                    All ({filteredPermissions.length})
                  </TabsTrigger>
                  {categories.map(category => (
                    <TabsTrigger key={category.category || 'uncategorized'} value={category.category || 'uncategorized'}>
                      {category.category || 'uncategorized'} ({category.count})
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="all" className="mt-4">
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-6">
                      {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                        <PermissionCategorySection
                          key={category}
                          category={category}
                          permissions={permissions}
                          selectedPermissions={selectedPermissions}
                          onPermissionToggle={handlePermissionToggle}
                          onSelectAll={handleSelectAll}
                          onDeselectAll={handleDeselectAll}
                          canEditRole={canEditRole}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {categories.map(category => {
                  const categoryKey = category.category || 'uncategorized';
                  return (
                    <TabsContent key={categoryKey} value={categoryKey} className="mt-4">
                      <ScrollArea className="h-[400px] pr-4">
                        <PermissionCategorySection
                          category={categoryKey}
                          permissions={permissionsByCategory[categoryKey] || []}
                          selectedPermissions={selectedPermissions}
                          onPermissionToggle={handlePermissionToggle}
                          onSelectAll={handleSelectAll}
                          onDeselectAll={handleDeselectAll}
                          canEditRole={canEditRole}
                        />
                      </ScrollArea>
                    </TabsContent>
                  );
                })}
              </Tabs>
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
              disabled={isSubmitting || !hasChanges || !canEditRole}
            >
              {isSubmitting && <LoaderIcon className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return ManagePermissionsDialog;
}

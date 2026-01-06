'use client';

/**
 * Permission Management Page Factory
 *
 * Creates a drop-in admin page for permission catalogue/registry viewing.
 * Apps provide their tRPC client and UI components via factory.
 *
 * @module @jetdevs/core/ui/admin
 *
 * @example
 * ```typescript
 * import { createPermissionManagementPage } from '@jetdevs/core/ui/admin';
 * import { api } from '@/utils/trpc';
 *
 * export const PermissionManagementPage = createPermissionManagementPage({ api, ui });
 *
 * export default function SystemPermissionsPage() {
 *   return <PermissionManagementPage />;
 * }
 * ```
 */

import * as React from 'react';
import { useState } from 'react';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Role reference within a permission
 */
export interface PermissionRoleRef {
  roleId: number;
  roleName: string;
  isSystemRole: boolean;
}

/**
 * Permission data structure from the API
 */
export interface Permission {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  roleCount: number;
  roles: PermissionRoleRef[];
}

/**
 * Category count data
 */
export interface CategoryCount {
  category: string | null;
  count: number;
}

/**
 * Permission stats data
 */
export interface PermissionStats {
  totalPermissions: number;
  categoryCounts: CategoryCount[];
  mostUsedPermissions: Array<{
    permissionId: number;
    name: string;
    slug: string;
    roleCount: number;
  }>;
}

/**
 * tRPC API interface that the app must provide
 */
export interface PermissionApi {
  permission: {
    getAllWithUsage: {
      useQuery: () => {
        data: Permission[] | undefined;
        isLoading: boolean;
        error: Error | null;
      };
    };
    getCategoriesWithCounts: {
      useQuery: () => {
        data: CategoryCount[] | undefined;
        isLoading: boolean;
      };
    };
    getStats: {
      useQuery: () => {
        data: PermissionStats | undefined;
        isLoading: boolean;
      };
    };
  };
}

/**
 * UI Components that the app must provide
 */
export interface PermissionManagementUIComponents {
  // Layout
  Card: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardHeader: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardTitle: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardDescription: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardContent: React.ComponentType<{ children: React.ReactNode; className?: string }>;

  // Forms
  Button: React.ComponentType<{
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'outline' | 'destructive' | 'ghost';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    disabled?: boolean;
  }>;
  Input: React.ComponentType<{
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
  }>;
  Badge: React.ComponentType<{
    children: React.ReactNode;
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
    className?: string;
  }>;

  // Tabs
  Tabs: React.ComponentType<{
    defaultValue: string;
    className?: string;
    children: React.ReactNode;
  }>;
  TabsList: React.ComponentType<{ children: React.ReactNode }>;
  TabsTrigger: React.ComponentType<{
    value: string;
    className?: string;
    children: React.ReactNode;
  }>;
  TabsContent: React.ComponentType<{
    value: string;
    className?: string;
    children: React.ReactNode;
  }>;

  // Secure component (optional - for permission-based visibility)
  Secure?: {
    Container: React.ComponentType<{
      basePermission: string;
      fallback?: React.ReactNode;
      children: React.ReactNode;
    }>;
  };
}

/**
 * Props for the PermissionManagementPage component
 */
export interface PermissionManagementPageProps {
  title?: string;
  description?: string;
  showAnalytics?: boolean;
}

/**
 * Factory configuration
 */
export interface PermissionManagementPageFactoryConfig {
  api: PermissionApi;
  ui: PermissionManagementUIComponents;
}

// =============================================================================
// ICONS (Built-in SVG to avoid external dependencies)
// =============================================================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="12" x2="12" y1="20" y2="10" />
    <line x1="18" x2="18" y1="20" y2="4" />
    <line x1="6" x2="6" y1="20" y2="16" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a PermissionManagementPage component with injected dependencies
 *
 * @param config - Factory configuration with tRPC api and UI components
 * @returns A React component for permission management
 */
export function createPermissionManagementPage(config: PermissionManagementPageFactoryConfig) {
  const { api, ui } = config;
  const {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Button,
    Input,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Secure,
  } = ui;

  // Wrapper for secure content - falls back to direct render if Secure not provided
  const SecureWrapper = Secure?.Container || (({ children }: { children: React.ReactNode }) => <>{children}</>);

  return function PermissionManagementPage({
    title = 'System Permission Registry',
    description = 'View and analyze all platform permissions and their role assignments across organizations',
    showAnalytics = true,
  }: PermissionManagementPageProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Fetch permissions with usage statistics
    const { data: permissions, isLoading: permissionsLoading } = api.permission.getAllWithUsage.useQuery();
    const { data: categories } = api.permission.getCategoriesWithCounts.useQuery();
    const { data: stats } = api.permission.getStats.useQuery();

    // Filter permissions based on search and category
    const filteredPermissions = permissions?.filter((permission) => {
      const matchesSearch =
        permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        permission.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        permission.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || permission.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    // Export functionality
    const handleExport = () => {
      if (!permissions) return;

      const csvContent = [
        ['Slug', 'Name', 'Category', 'Description', 'Role Count', 'Roles'],
        ...permissions.map((p) => [
          p.slug,
          p.name,
          p.category || '',
          p.description || '',
          p.roleCount.toString(),
          p.roles.map((r) => r.roleName).join('; '),
        ]),
      ]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `permissions-catalogue-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    };

    if (permissionsLoading) {
      return (
        <div className="space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground mt-2">{description}</p>
          </div>
          <Button onClick={handleExport} variant="outline" className="gap-2">
            <DownloadIcon className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Tabs defaultValue="permissions" className="space-y-6">
          <TabsList>
            <TabsTrigger value="permissions" className="gap-2">
              <ShieldIcon className="h-4 w-4" />
              Permissions
            </TabsTrigger>
            {showAnalytics && (
              <TabsTrigger value="analytics" className="gap-2">
                <ChartIcon className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="permissions" className="space-y-6">
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search permissions by name, slug, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-input bg-background rounded-md"
              >
                <option value="all">All Categories</option>
                {categories?.map((cat) => (
                  <option key={cat.category || ''} value={cat.category || ''}>
                    {cat.category} ({cat.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Permissions Grid */}
            <div className="grid gap-4">
              {filteredPermissions?.map((permission) => (
                <SecureWrapper
                  key={permission.id}
                  basePermission="role"
                  fallback={
                    <Card className="hover:shadow-md transition-shadow opacity-50">
                      <CardContent className="py-8 text-center">
                        <LockIcon className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Permission details restricted</p>
                      </CardContent>
                    </Card>
                  }
                >
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{permission.name}</CardTitle>
                          <CardDescription className="font-mono text-sm">
                            {permission.slug}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Badge
                            variant="secondary"
                            className="bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                          >
                            {permission.category}
                          </Badge>
                          <Badge variant="outline" className="gap-1">
                            <UsersIcon className="h-3 w-3" />
                            {permission.roleCount} roles
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {permission.description && (
                        <p className="text-sm text-muted-foreground mb-3">{permission.description}</p>
                      )}
                      {permission.roles.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Used by role:</p>
                          <div className="flex flex-wrap gap-1">
                            {permission.roles.map((role) => (
                              <Badge
                                key={role.roleId}
                                variant={role.isSystemRole ? 'default' : 'outline'}
                                className="text-xs"
                              >
                                {role.roleName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </SecureWrapper>
              ))}
            </div>

            {filteredPermissions?.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">
                    No permissions found matching your search criteria.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {showAnalytics && (
            <TabsContent value="analytics" className="space-y-6">
              <SecureWrapper
                basePermission="role"
                fallback={
                  <Card>
                    <CardContent className="py-12 text-center">
                      <LockIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium mb-2">Analytics Restricted</h3>
                      <p className="text-muted-foreground">
                        You don&apos;t have permission to view permission analytics. Contact your
                        administrator for access.
                      </p>
                    </CardContent>
                  </Card>
                }
              >
                {stats && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Total Permissions */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Permissions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{stats.totalPermissions}</div>
                        <p className="text-xs text-muted-foreground">
                          Active permissions in the system
                        </p>
                      </CardContent>
                    </Card>

                    {/* Categories Breakdown */}
                    <Card className="md:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Permissions by Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          {stats.categoryCounts.map((cat) => (
                            <div
                              key={cat.category}
                              className="flex justify-between items-center p-2 bg-muted rounded"
                            >
                              <span className="text-sm">{cat.category}</span>
                              <Badge variant="secondary">{cat.count}</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Most Used Permissions */}
                    <Card className="md:col-span-3">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Most Used Permissions</CardTitle>
                        <CardDescription>Permissions assigned to the most roles</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {stats.mostUsedPermissions.slice(0, 10).map((perm) => (
                            <div
                              key={perm.permissionId}
                              className="flex justify-between items-center py-2 border-b last:border-0"
                            >
                              <div>
                                <span className="font-medium text-sm">{perm.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({perm.slug})
                                </span>
                              </div>
                              <Badge variant="outline">{perm.roleCount} roles</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </SecureWrapper>
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  };
}

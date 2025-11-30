'use client';

/**
 * Theme Management Page Factory
 *
 * Creates a drop-in admin page for theme management.
 * Apps provide their tRPC client and UI components via factory.
 *
 * @module @yobolabs/core/ui/admin
 *
 * @example
 * ```typescript
 * // Create the page component with your tRPC client
 * import { createThemeManagementPage } from '@yobolabs/core/ui/admin';
 * import { api } from '@/utils/trpc';
 *
 * export const ThemeManagementPage = createThemeManagementPage({ api });
 *
 * // Use in your route
 * export default function SystemThemesPage() {
 *   return <ThemeManagementPage />;
 * }
 * ```
 */

import * as React from 'react';
import { useState } from 'react';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Theme data structure from the API
 */
export interface Theme {
  id: number;
  uuid: string;
  name: string;
  displayName: string;
  description: string | null;
  cssFile: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Theme form data for create/update
 */
export interface ThemeFormData {
  name: string;
  displayName: string;
  description: string;
  cssFile: string;
  isActive: boolean;
}

/**
 * tRPC API interface that the app must provide
 * This matches the theme router structure from @yobolabs/core/trpc/routers
 */
export interface ThemeApi {
  theme: {
    getAll: {
      useQuery: () => {
        data: Theme[] | undefined;
        isLoading: boolean;
        error: Error | null;
        refetch: () => Promise<any>;
      };
    };
    create: {
      useMutation: (opts?: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
      }) => {
        mutateAsync: (data: Omit<ThemeFormData, 'description'> & { description?: string }) => Promise<Theme>;
        isPending: boolean;
      };
    };
    update: {
      useMutation: (opts?: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
      }) => {
        mutateAsync: (data: { uuid: string } & Partial<ThemeFormData>) => Promise<Theme>;
        isPending: boolean;
      };
    };
    delete: {
      useMutation: (opts?: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
      }) => {
        mutateAsync: (uuid: string) => Promise<void>;
        isPending: boolean;
      };
    };
    toggleActive: {
      useMutation: (opts?: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
      }) => {
        mutateAsync: (uuid: string) => Promise<Theme>;
        isPending: boolean;
      };
    };
  };
}

/**
 * UI Components that the app must provide
 * These are Shadcn-compatible components
 */
export interface ThemeManagementUIComponents {
  // Layout
  Card: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardHeader: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardTitle: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  CardDescription: React.ComponentType<{ children: React.ReactNode }>;
  CardContent: React.ComponentType<{ children: React.ReactNode; className?: string }>;

  // Forms
  Button: React.ComponentType<{
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'outline' | 'destructive' | 'ghost';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    disabled?: boolean;
    type?: 'button' | 'submit';
  }>;
  Input: React.ComponentType<{
    id?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
  }>;
  Label: React.ComponentType<{
    htmlFor?: string;
    children: React.ReactNode;
  }>;
  Badge: React.ComponentType<{
    children: React.ReactNode;
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
    className?: string;
  }>;

  // Dialog
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  DialogContent: React.ComponentType<{ children: React.ReactNode }>;
  DialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  DialogTitle: React.ComponentType<{ children: React.ReactNode }>;
  DialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  DialogFooter: React.ComponentType<{ children: React.ReactNode }>;

  // Skeleton for loading
  Skeleton: React.ComponentType<{ className?: string }>;

  // Toast function
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
}

/**
 * Props for the ThemeManagementPage component
 */
export interface ThemeManagementPageProps {
  title?: string;
  description?: string;
  showStats?: boolean;
}

/**
 * Factory configuration
 */
export interface ThemeManagementPageFactoryConfig {
  api: ThemeApi;
  ui: ThemeManagementUIComponents;
}

// =============================================================================
// ICONS (Built-in SVG to avoid external dependencies)
// =============================================================================

const PaletteIcon = ({ className }: { className?: string }) => (
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
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
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
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

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

const CheckIcon = ({ className }: { className?: string }) => (
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
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
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
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const EditIcon = ({ className }: { className?: string }) => (
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
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
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
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }) => (
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
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a ThemeManagementPage component with injected dependencies
 *
 * @param config - Factory configuration with tRPC api and UI components
 * @returns A React component for theme management
 */
export function createThemeManagementPage(config: ThemeManagementPageFactoryConfig) {
  const { api, ui } = config;
  const {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Button,
    Input,
    Label,
    Badge,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Skeleton,
    toast,
  } = ui;

  return function ThemeManagementPage({
    title = 'System Theme Management',
    description = 'Manage platform themes and visual customizations',
    showStats = true,
  }: ThemeManagementPageProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
    const [formData, setFormData] = useState<ThemeFormData>({
      name: '',
      displayName: '',
      description: '',
      cssFile: '',
      isActive: true,
    });

    // Fetch themes data
    const {
      data: themes = [],
      isLoading,
      error,
      refetch,
    } = api.theme.getAll.useQuery();

    // Mutations
    const createMutation = api.theme.create.useMutation({
      onSuccess: () => {
        toast.success('Theme created successfully');
        refetch();
        setCreateDialogOpen(false);
        resetForm();
      },
      onError: (error) => {
        toast.error(`Failed to create theme: ${error.message}`);
      },
    });

    const updateMutation = api.theme.update.useMutation({
      onSuccess: () => {
        toast.success('Theme updated successfully');
        refetch();
        setEditDialogOpen(false);
        resetForm();
      },
      onError: (error) => {
        toast.error(`Failed to update theme: ${error.message}`);
      },
    });

    const deleteMutation = api.theme.delete.useMutation({
      onSuccess: () => {
        toast.success('Theme deleted successfully');
        refetch();
        setDeleteDialogOpen(false);
      },
      onError: (error) => {
        toast.error(`Failed to delete theme: ${error.message}`);
      },
    });

    const toggleActiveMutation = api.theme.toggleActive.useMutation({
      onSuccess: () => {
        toast.success('Theme status updated');
        refetch();
      },
      onError: (error) => {
        toast.error(`Failed to update theme status: ${error.message}`);
      },
    });

    const resetForm = () => {
      setFormData({
        name: '',
        displayName: '',
        description: '',
        cssFile: '',
        isActive: true,
      });
    };

    // Filter themes
    const filteredThemes = themes.filter(
      (theme) =>
        theme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        theme.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        theme.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreate = () => {
      resetForm();
      setCreateDialogOpen(true);
    };

    const handleEdit = (theme: Theme) => {
      setSelectedTheme(theme);
      setFormData({
        name: theme.name,
        displayName: theme.displayName,
        description: theme.description || '',
        cssFile: theme.cssFile,
        isActive: theme.isActive,
      });
      setEditDialogOpen(true);
    };

    const handleDelete = (theme: Theme) => {
      setSelectedTheme(theme);
      setDeleteDialogOpen(true);
    };

    const handleToggleActive = async (theme: Theme) => {
      await toggleActiveMutation.mutateAsync(theme.uuid);
    };

    const handleSubmitCreate = async () => {
      await createMutation.mutateAsync(formData);
    };

    const handleSubmitEdit = async () => {
      if (selectedTheme) {
        await updateMutation.mutateAsync({
          uuid: selectedTheme.uuid,
          ...formData,
        });
      }
    };

    const handleConfirmDelete = async () => {
      if (selectedTheme) {
        await deleteMutation.mutateAsync(selectedTheme.uuid);
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground mt-2">{description}</p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <PlusIcon className="h-4 w-4" />
            Create Theme
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {/* Stats Cards */}
        {showStats && (
          <>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Themes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{themes.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Active Themes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {themes.filter((t) => t.isActive).length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Default Theme</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-medium">
                      {themes.find((t) => t.isDefault)?.displayName || 'None'}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Custom Themes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {themes.filter((t) => !t.isDefault).length}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-red-600 mb-4">Failed to load themes: {error.message}</p>
              <Button onClick={() => refetch()}>Try Again</Button>
            </CardContent>
          </Card>
        )}

        {/* Themes Grid */}
        {!isLoading && !error && (
          <div className="grid gap-4">
            {filteredThemes.map((theme) => (
              <Card key={theme.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{theme.displayName}</CardTitle>
                        {theme.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        {theme.description || 'No description provided'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={theme.isActive ? 'default' : 'outline'}
                        className={
                          theme.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 gap-1'
                            : 'gap-1'
                        }
                      >
                        {theme.isActive ? (
                          <CheckIcon className="h-3 w-3" />
                        ) : (
                          <XIcon className="h-3 w-3" />
                        )}
                        {theme.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>CSS File:</span>
                        <code className="bg-muted px-2 py-0.5 rounded">{theme.cssFile}</code>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Internal Name:</span>
                        <code className="bg-muted px-2 py-0.5 rounded">{theme.name}</code>
                      </div>
                      <div className="text-muted-foreground">
                        Created: {new Date(theme.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleToggleActive(theme)}
                        disabled={toggleActiveMutation.isPending}
                      >
                        {toggleActiveMutation.isPending ? (
                          <LoaderIcon className="h-3 w-3 animate-spin" />
                        ) : theme.isActive ? (
                          <XIcon className="h-3 w-3" />
                        ) : (
                          <CheckIcon className="h-3 w-3" />
                        )}
                        {theme.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleEdit(theme)}
                      >
                        <EditIcon className="h-3 w-3" />
                        Edit
                      </Button>
                      {!theme.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(theme)}
                        >
                          <TrashIcon className="h-3 w-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredThemes.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <PaletteIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'No themes found matching your search.' : 'No themes available.'}
              </p>
              {!searchTerm && (
                <Button onClick={handleCreate} className="mt-4">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Create First Theme
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Theme Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Theme</DialogTitle>
              <DialogDescription>
                Add a new theme to the platform. The CSS file must be uploaded to /public/themes/
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Internal Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., dark-mode-pro"
                />
                <p className="text-xs text-muted-foreground">
                  System identifier (lowercase, no spaces)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g., Dark Mode Pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="A professional dark theme..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cssFile">CSS Filename</Label>
                <Input
                  id="cssFile"
                  value={formData.cssFile}
                  onChange={(e) => setFormData({ ...formData, cssFile: e.target.value })}
                  placeholder="e.g., dark-mode-pro.css"
                />
                <p className="text-xs text-muted-foreground">
                  Must match the filename in /public/themes/
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Theme'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Theme Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Theme</DialogTitle>
              <DialogDescription>
                Update theme information. Make sure the CSS file exists in /public/themes/
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Internal Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., dark-mode-pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-displayName">Display Name</Label>
                <Input
                  id="edit-displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g., Dark Mode Pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (Optional)</Label>
                <Input
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="A professional dark theme..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cssFile">CSS Filename</Label>
                <Input
                  id="edit-cssFile"
                  value={formData.cssFile}
                  onChange={(e) => setFormData({ ...formData, cssFile: e.target.value })}
                  placeholder="e.g., dark-mode-pro.css"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Theme Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Theme</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this theme? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {selectedTheme && (
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  You are about to delete the theme:
                </p>
                <p className="font-medium mt-2">{selectedTheme.displayName}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Theme'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };
}

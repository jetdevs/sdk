"use client";

/**
 * Themes Data Table Factory
 *
 * Creates a themed data table component for managing themes.
 * Apps inject their UI components and API, and receive a fully functional table.
 *
 * @module @jetdevs/core/features/themes/ui/factories
 *
 * @example
 * ```typescript
 * import { createThemesDataTableFactory } from '@jetdevs/core/features/themes/ui';
 * import * as UI from '@/components/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 *
 * export const ThemesDataTable = createThemesDataTableFactory({
 *   api: {
 *     getAllSystem: api.theme.getAllSystem,
 *     delete: api.theme.delete,
 *     toggleActive: api.theme.toggleActive,
 *     setDefault: api.theme.setDefault,
 *     setGlobal: api.theme.setGlobal,
 *     clearGlobal: api.theme.clearGlobal,
 *     useUtils: api.useUtils,
 *   },
 *   ui: { ...UI, toast },
 * });
 * ```
 */

import * as React from "react";
import {
  useThemesDataTableLogic,
  type ThemeData,
  type ThemeStatusFilter,
} from "../hooks";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Toast interface for notifications
 */
export interface ThemesTableToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Color swatch component props
 */
export interface ColorSwatchProps {
  /** Color value (hex, rgb, etc.) */
  color: string;
  /** Optional size variant */
  size?: "sm" | "md" | "lg";
  /** Optional label */
  label?: string;
}

/**
 * UI components required for ThemesDataTable
 */
export interface ThemesDataTableUIComponents {
  /** Button component */
  Button: React.ComponentType<{
    type?: "button" | "submit";
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon";
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Badge component */
  Badge: React.ComponentType<{
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    children: React.ReactNode;
  }>;
  /** Input component for search */
  Input: React.ComponentType<{
    id?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    className?: string;
    type?: string;
  }>;
  /** Select component for filters */
  Select: React.ComponentType<{
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }>;
  /** Select trigger */
  SelectTrigger: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Select value display */
  SelectValue: React.ComponentType<{
    placeholder?: string;
  }>;
  /** Select content (dropdown) */
  SelectContent: React.ComponentType<{
    children: React.ReactNode;
  }>;
  /** Select item */
  SelectItem: React.ComponentType<{
    value: string;
    children: React.ReactNode;
  }>;
  /** Dropdown menu components */
  DropdownMenu: React.ComponentType<{ children: React.ReactNode }>;
  DropdownMenuTrigger: React.ComponentType<{
    asChild?: boolean;
    children: React.ReactNode;
  }>;
  DropdownMenuContent: React.ComponentType<{
    align?: "start" | "center" | "end";
    children: React.ReactNode;
  }>;
  DropdownMenuItem: React.ComponentType<{
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  DropdownMenuSeparator: React.ComponentType<unknown>;
  /** Table components */
  Table: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  TableHeader: React.ComponentType<{ children: React.ReactNode }>;
  TableBody: React.ComponentType<{ children: React.ReactNode }>;
  TableRow: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  TableHead: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  TableCell: React.ComponentType<{
    className?: string;
    colSpan?: number;
    children: React.ReactNode;
  }>;
  /** Alert dialog components */
  AlertDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  AlertDialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogTitle: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogCancel: React.ComponentType<{
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  AlertDialogAction: React.ComponentType<{
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Optional color swatch component for theme preview */
  ColorSwatch?: React.ComponentType<ColorSwatchProps>;
  /** Toast notifications */
  toast: ThemesTableToastInterface;
}

/**
 * API interface for ThemesDataTable
 */
export interface ThemesDataTableApi {
  /** Get all themes (system/admin view) */
  getAllSystem: {
    useQuery: () => {
      data: ThemeData[] | undefined;
      isLoading: boolean;
      refetch: () => Promise<unknown>;
    };
  };
  /** Delete theme mutation */
  delete: {
    useMutation: () => {
      mutateAsync: (uuid: string) => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Toggle active status mutation */
  toggleActive: {
    useMutation: () => {
      mutateAsync: (uuid: string) => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Set default theme mutation */
  setDefault: {
    useMutation: () => {
      mutateAsync: (uuid: string) => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Set global theme mutation */
  setGlobal: {
    useMutation: () => {
      mutateAsync: (uuid: string) => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Clear global theme mutation */
  clearGlobal: {
    useMutation: () => {
      mutateAsync: () => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Utils for cache invalidation */
  useUtils: () => {
    theme: {
      getAllSystem: {
        invalidate: () => Promise<void>;
      };
      getGlobal?: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * Factory config for ThemesDataTable
 */
export interface ThemesDataTableFactoryConfig {
  /** API interface */
  api: ThemesDataTableApi;
  /** UI components */
  ui: ThemesDataTableUIComponents;
  /** Custom create dialog component (optional) */
  CreateDialog?: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
  }>;
  /** Custom edit dialog component (optional) */
  EditDialog?: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    theme: ThemeData | null;
    onSuccess?: () => void;
  }>;
  /** Initial page size */
  initialPageSize?: number;
}

/**
 * Props for ThemesDataTable component
 */
export interface ThemesDataTableProps {
  /** Additional CSS class name */
  className?: string;
}

// =============================================================================
// ICONS
// =============================================================================

const PaletteIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="13.5" cy="6.5" r=".5" />
    <circle cx="17.5" cy="10.5" r=".5" />
    <circle cx="8.5" cy="7.5" r=".5" />
    <circle cx="6.5" cy="12.5" r=".5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const PlusIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
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

const MoreVerticalIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const PencilIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
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

const TrashIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
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

const CheckIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
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

const XIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
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

const StarIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const GlobeIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const BanIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m4.9 4.9 14.2 14.2" />
  </svg>
);

const LoaderIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`animate-spin ${className}`}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }
  if (diffHours > 0) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  if (diffMins > 0) {
    return diffMins === 1 ? "1 minute ago" : `${diffMins} minutes ago`;
  }
  return "just now";
}

// =============================================================================
// FACTORY IMPLEMENTATION
// =============================================================================

/**
 * Create a ThemesDataTable component
 *
 * Factory function that creates a data table component for theme management.
 * The returned component handles all data fetching, filtering, pagination,
 * and CRUD operations.
 *
 * @param config - Factory configuration with API and UI components
 * @returns ThemesDataTable component
 */
export function createThemesDataTableFactory(
  config: ThemesDataTableFactoryConfig
): React.FC<ThemesDataTableProps> {
  const {
    api,
    ui,
    CreateDialog,
    EditDialog,
    initialPageSize = 20,
  } = config;
  const {
    Button,
    Badge,
    Input,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    toast,
  } = ui;

  return function ThemesDataTable({ className }: ThemesDataTableProps) {
    // API queries and mutations
    const { data: themes = [], isLoading: isQueryLoading, refetch } = api.getAllSystem.useQuery();
    const deleteMutation = api.delete.useMutation();
    const toggleActiveMutation = api.toggleActive.useMutation();
    const setDefaultMutation = api.setDefault.useMutation();
    const setGlobalMutation = api.setGlobal.useMutation();
    const clearGlobalMutation = api.clearGlobal.useMutation();
    const utils = api.useUtils();

    // Use the logic hook
    const logic = useThemesDataTableLogic(
      {
        initialPageSize,
        onDelete: async (uuid) => {
          await deleteMutation.mutateAsync(uuid);
          await utils.theme.getAllSystem.invalidate();
          toast.success("Theme deleted successfully");
        },
        onToggleActive: async (uuid) => {
          await toggleActiveMutation.mutateAsync(uuid);
          await utils.theme.getAllSystem.invalidate();
          toast.success("Theme status updated");
        },
        onSetDefault: async (uuid) => {
          await setDefaultMutation.mutateAsync(uuid);
          await utils.theme.getAllSystem.invalidate();
          toast.success("Default theme updated");
        },
        onSetGlobal: async (uuid) => {
          await setGlobalMutation.mutateAsync(uuid);
          await utils.theme.getAllSystem.invalidate();
          if (utils.theme.getGlobal) {
            await utils.theme.getGlobal.invalidate();
          }
          toast.success("Global theme set - this theme now applies to ALL users");
        },
        onClearGlobal: async () => {
          await clearGlobalMutation.mutateAsync();
          await utils.theme.getAllSystem.invalidate();
          if (utils.theme.getGlobal) {
            await utils.theme.getGlobal.invalidate();
          }
          toast.success("Global theme cleared - users can now choose their own theme");
        },
        onRefresh: async () => {
          await refetch();
        },
      },
      themes as ThemeData[]
    );

    // Status filter options
    const statusOptions: { label: string; value: ThemeStatusFilter }[] = [
      { label: "All Status", value: "all" },
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ];

    // Status badge component
    const StatusBadge = ({ isActive }: { isActive: boolean }) => {
      if (isActive) {
        return (
          <Badge
            variant="default"
            className="bg-green-100 text-green-800 border-green-200"
          >
            <CheckIcon className="mr-1" />
            Active
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <XIcon className="mr-1" />
          Inactive
        </Badge>
      );
    };

    // Default badge component
    const DefaultBadge = ({ isDefault }: { isDefault: boolean }) => {
      if (!isDefault) return null;
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-100 text-yellow-800 border-yellow-200"
        >
          <StarIcon className="mr-1" />
          Default
        </Badge>
      );
    };

    // Global badge component
    const GlobalBadge = ({ isGlobal }: { isGlobal: boolean }) => {
      if (!isGlobal) return null;
      return (
        <Badge
          variant="default"
          className="bg-blue-100 text-blue-800 border-blue-200"
        >
          <GlobeIcon className="mr-1" />
          Global
        </Badge>
      );
    };

    const isLoading = isQueryLoading || logic.isLoading;

    return (
      <>
        <div className={`space-y-4 ${className || ""}`}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            {/* Search and filters */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search themes..."
                value={logic.searchTerm}
                onChange={(e) => logic.setSearchTerm(e.target.value)}
                className="w-64"
              />
              <Select
                value={logic.statusFilter}
                onValueChange={(v) =>
                  logic.setStatusFilter(v as ThemeStatusFilter)
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Create button */}
            <Button onClick={logic.openCreateDialog}>
              <PlusIcon className="mr-2" />
              Create Theme
            </Button>
          </div>

          {/* Result count */}
          <div className="text-sm text-muted-foreground">
            {logic.resultLabel}
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Theme</TableHead>
                  <TableHead>Internal Name</TableHead>
                  <TableHead>CSS File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <LoaderIcon className="mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">
                        Loading themes...
                      </p>
                    </TableCell>
                  </TableRow>
                ) : logic.themes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <PaletteIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium mt-2">No Themes Found</p>
                      <p className="text-sm text-muted-foreground">
                        Get started by creating your first theme.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logic.themes.map((theme) => (
                    <TableRow key={theme.id}>
                      {/* Display Name + Badges */}
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <PaletteIcon className="text-muted-foreground" />
                            <span
                              className="font-medium cursor-pointer hover:underline"
                              onClick={() => logic.openEditDialog(theme)}
                            >
                              {theme.displayName}
                            </span>
                            <GlobalBadge isGlobal={theme.isGlobal} />
                            <DefaultBadge isDefault={theme.isDefault} />
                          </div>
                          {theme.description && (
                            <span className="text-sm text-muted-foreground line-clamp-1 ml-6">
                              {theme.description}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Internal Name */}
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {theme.name}
                        </code>
                      </TableCell>

                      {/* CSS File */}
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {theme.cssFile}
                        </code>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge isActive={theme.isActive} />
                      </TableCell>

                      {/* Last Updated */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {getTimeAgo(theme.updatedAt)}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVerticalIcon />
                              <span className="sr-only">More Options</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => logic.handleToggleActive(theme)}
                              disabled={
                                theme.isDefault && theme.isActive ||
                                logic.isProcessing
                              }
                            >
                              {theme.isActive ? (
                                <>
                                  <XIcon className="mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckIcon className="mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            {!theme.isDefault && theme.isActive && (
                              <DropdownMenuItem
                                onClick={() => logic.handleSetDefault(theme)}
                                disabled={logic.isProcessing}
                              >
                                <StarIcon className="mr-2" />
                                Set as Default
                              </DropdownMenuItem>
                            )}
                            {!theme.isGlobal && theme.isActive && (
                              <DropdownMenuItem
                                onClick={() => logic.handleSetGlobal(theme)}
                                disabled={logic.isProcessing}
                              >
                                <GlobeIcon className="mr-2" />
                                Set as Global Theme
                              </DropdownMenuItem>
                            )}
                            {theme.isGlobal && (
                              <DropdownMenuItem
                                onClick={() => logic.handleClearGlobal()}
                                disabled={logic.isProcessing}
                              >
                                <BanIcon className="mr-2" />
                                Remove Global Status
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => logic.openEditDialog(theme)}
                            >
                              <PencilIcon className="mr-2" />
                              Edit Theme
                            </DropdownMenuItem>
                            {!theme.isDefault && (
                              <DropdownMenuItem
                                onClick={() => logic.openDeleteDialog(theme)}
                                className="text-destructive"
                              >
                                <TrashIcon className="mr-2" />
                                Delete Theme
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {logic.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {logic.pagination.pageIndex + 1} of{" "}
                {logic.pagination.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    logic.setPageIndex(logic.pagination.pageIndex - 1)
                  }
                  disabled={logic.pagination.pageIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    logic.setPageIndex(logic.pagination.pageIndex + 1)
                  }
                  disabled={
                    logic.pagination.pageIndex >=
                    logic.pagination.totalPages - 1
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!logic.selectedThemeForDelete}
          onOpenChange={(open) => !open && logic.closeDeleteDialog()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Theme</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "
                {logic.selectedThemeForDelete?.displayName}"? This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {logic.selectedThemeForDelete && (
              <div className="py-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  You are about to delete:
                </p>
                <div className="bg-muted p-3 rounded-md space-y-1">
                  <p className="font-medium">
                    {logic.selectedThemeForDelete.displayName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Internal name:{" "}
                    <code>{logic.selectedThemeForDelete.name}</code>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    CSS file:{" "}
                    <code>{logic.selectedThemeForDelete.cssFile}</code>
                  </p>
                </div>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={logic.isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  logic.confirmDelete();
                }}
                disabled={logic.isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {logic.isDeleting ? (
                  <>
                    <LoaderIcon className="mr-2" />
                    Deleting...
                  </>
                ) : (
                  "Delete Theme"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Dialog */}
        {CreateDialog && (
          <CreateDialog
            open={logic.createDialogOpen}
            onOpenChange={(open) =>
              open ? logic.openCreateDialog() : logic.closeCreateDialog()
            }
            onSuccess={() => {
              logic.closeCreateDialog();
              logic.refresh();
            }}
          />
        )}

        {/* Edit Dialog */}
        {EditDialog && (
          <EditDialog
            open={!!logic.selectedThemeForEdit}
            onOpenChange={(open) =>
              !open && logic.closeEditDialog()
            }
            theme={logic.selectedThemeForEdit}
            onSuccess={() => {
              logic.closeEditDialog();
              logic.refresh();
            }}
          />
        )}
      </>
    );
  };
}

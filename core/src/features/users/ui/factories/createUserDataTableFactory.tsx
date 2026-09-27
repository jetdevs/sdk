"use client";

/**
 * User Data Table Factory
 *
 * Creates a user data table component for managing users.
 * Apps inject their UI components and API, and receive a fully functional table.
 *
 * @module @jetdevs/core/features/users/ui/factories
 *
 * @example
 * ```typescript
 * import { createUserDataTableFactory } from '@jetdevs/core/features/users/ui';
 * import * as UI from '@/components/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 *
 * export const UserDataTable = createUserDataTableFactory({
 *   api: {
 *     user: {
 *       list: {
 *         useQuery: (input) => api.user.list.useQuery(input),
 *       },
 *       delete: api.user.delete,
 *       useUtils: api.useUtils,
 *     },
 *   },
 *   ui: { ...UI, toast },
 * });
 * ```
 */

import * as React from "react";
import {
  useUserDataTableLogic,
  type UserData,
  type UserDataTableApi,
  type UserStatusFilter,
} from "../hooks/useUserDataTableLogic";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Toast interface for notifications
 */
export interface UserTableToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Column definition for customizable columns
 */
export interface UserTableColumnDef<TData = UserData> {
  /** Unique column identifier */
  id: string;
  /** Column header text */
  header: string;
  /** Accessor key or function */
  accessorKey?: keyof TData;
  /** Custom cell render function */
  cell?: (props: { row: TData }) => React.ReactNode;
  /** Whether the column is sortable */
  sortable?: boolean;
  /** Additional CSS class for the column */
  className?: string;
}

/**
 * UI components required for UserDataTable
 */
export interface UserDataTableUIComponents {
  /** Button component */
  Button: React.ComponentType<{
    type?: "button" | "submit";
    variant?:
      | "default"
      | "destructive"
      | "outline"
      | "secondary"
      | "ghost"
      | "link";
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
  /** Checkbox component */
  Checkbox: React.ComponentType<{
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
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
    onClick?: () => void;
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
  /** Pagination components (optional - will use buttons if not provided) */
  Pagination?: React.ComponentType<{ children: React.ReactNode }>;
  PaginationContent?: React.ComponentType<{ children: React.ReactNode }>;
  PaginationItem?: React.ComponentType<{ children: React.ReactNode }>;
  PaginationPrevious?: React.ComponentType<{
    onClick?: () => void;
    disabled?: boolean;
  }>;
  PaginationNext?: React.ComponentType<{
    onClick?: () => void;
    disabled?: boolean;
  }>;
  /** Toast notifications */
  toast: UserTableToastInterface;
}

/**
 * Extended API interface for UserDataTable with mutations
 */
export interface UserDataTableFactoryApi extends UserDataTableApi {
  user: UserDataTableApi["user"] & {
    /** Delete user mutation */
    delete?: {
      useMutation: () => {
        mutateAsync: (id: number) => Promise<unknown>;
        isPending: boolean;
      };
    };
    /** Utils for cache invalidation */
    useUtils?: () => {
      user: {
        list: {
          invalidate: () => Promise<void>;
        };
      };
    };
  };
}

/**
 * Factory config for UserDataTable
 */
export interface UserDataTableFactoryConfig {
  /** API interface */
  api: UserDataTableFactoryApi;
  /** UI components */
  ui: UserDataTableUIComponents;
  /** Custom columns (optional - uses defaults if not provided) */
  columns?: UserTableColumnDef[];
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
    user: UserData | null;
    onSuccess?: () => void;
  }>;
  /** Initial page size */
  initialPageSize?: number;
  /** Enable row selection */
  enableSelection?: boolean;
  /** Enable bulk actions */
  enableBulkActions?: boolean;
}

/**
 * Props for UserDataTable component
 */
export interface UserDataTableProps {
  /** Organization ID for filtering */
  orgId?: number;
  /** Callback when edit is requested */
  onEditUser?: (user: UserData) => void;
  /** Callback when delete is requested */
  onDeleteUser?: (user: UserData) => void;
  /** Callback when view is requested */
  onViewUser?: (user: UserData) => void;
  /** Additional CSS class name */
  className?: string;
}

// =============================================================================
// ICONS
// =============================================================================

const UserIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
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

const EyeIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
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

const ChevronUpIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const ChevronDownIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="m6 9 6 6 6-6" />
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

/**
 * Get user display name
 */
function getUserDisplayName(user: UserData): string {
  if (user.name) return user.name;
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  return user.email;
}

// =============================================================================
// FACTORY IMPLEMENTATION
// =============================================================================

/**
 * Create a UserDataTable component
 *
 * Factory function that creates a data table component for user management.
 * The returned component handles all data fetching, filtering, pagination,
 * sorting, selection, and CRUD operations.
 *
 * @param config - Factory configuration with API and UI components
 * @returns UserDataTable component
 */
export function createUserDataTableFactory(
  config: UserDataTableFactoryConfig
): React.FC<UserDataTableProps> {
  const {
    api,
    ui,
    columns: customColumns,
    CreateDialog,
    EditDialog,
    initialPageSize = 20,
    enableSelection = true,
    enableBulkActions = false,
  } = config;

  const {
    Button,
    Badge,
    Input,
    Checkbox,
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

  return function UserDataTable({
    orgId,
    onEditUser,
    onDeleteUser,
    onViewUser,
    className,
  }: UserDataTableProps) {
    // Delete mutation (if available)
    const deleteMutation = api.user.delete?.useMutation();
    const utils = api.user.useUtils?.();

    // Deletion state
    const [isDeleting, setIsDeleting] = React.useState(false);

    // Use the logic hook
    const logic = useUserDataTableLogic({
      api,
      initialPageSize,
      orgId,
      onEditUser,
      onDeleteUser,
    });

    // Status filter options
    const statusOptions: { label: string; value: UserStatusFilter }[] = [
      { label: "All Status", value: "all" },
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ];

    // Default columns
    const defaultColumns: UserTableColumnDef[] = [
      {
        id: "name",
        header: "Name",
        sortable: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <UserIcon className="text-muted-foreground" />
            <div className="flex flex-col">
              <span
                className="font-medium cursor-pointer hover:underline"
                onClick={() => {
                  if (onViewUser) {
                    onViewUser(row);
                  } else {
                    logic.openEditDialog(row);
                  }
                }}
              >
                {getUserDisplayName(row)}
              </span>
              <span className="text-sm text-muted-foreground">{row.email}</span>
            </div>
          </div>
        ),
      },
      {
        id: "username",
        header: "Username",
        accessorKey: "username",
        sortable: true,
        cell: ({ row }) => (
          <code className="text-sm bg-muted px-2 py-1 rounded">
            {row.username || "-"}
          </code>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortable: false,
        cell: ({ row }) => <StatusBadge isActive={row.isActive} />,
      },
      {
        id: "createdAt",
        header: "Joined",
        sortable: true,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {getTimeAgo(row.createdAt)}
          </span>
        ),
      },
    ];

    const columns = customColumns || defaultColumns;

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

    // Sort header component
    const SortableHeader = ({
      column,
      children,
    }: {
      column: UserTableColumnDef;
      children: React.ReactNode;
    }) => {
      if (!column.sortable) {
        return <>{children}</>;
      }

      const isActive = logic.sortColumn === column.id;
      const isAsc = isActive && logic.sortDirection === "asc";

      return (
        <button
          className="flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={() => {
            if (isActive) {
              logic.setSorting(column.id, isAsc ? "desc" : "asc");
            } else {
              logic.setSorting(column.id, "asc");
            }
          }}
        >
          {children}
          {isActive && (isAsc ? <ChevronUpIcon /> : <ChevronDownIcon />)}
        </button>
      );
    };

    // Handle delete confirmation
    const handleConfirmDelete = React.useCallback(async () => {
      if (!logic.selectedUserForDelete || !deleteMutation) return;

      setIsDeleting(true);

      try {
        await deleteMutation.mutateAsync(logic.selectedUserForDelete.id);
        if (utils?.user.list.invalidate) {
          await utils.user.list.invalidate();
        }
        toast.success("User deleted successfully");
        logic.closeDeleteDialog();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete user";
        toast.error(message);
      } finally {
        setIsDeleting(false);
      }
    }, [logic.selectedUserForDelete, deleteMutation, utils, toast, logic]);

    const isLoading = logic.isLoading;

    return (
      <>
        <div className={`space-y-4 ${className || ""}`}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            {/* Search and filters */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search users..."
                value={logic.searchQuery}
                onChange={(e) => logic.setSearchQuery(e.target.value)}
                className="w-64"
              />
              <Select
                value={logic.statusFilter}
                onValueChange={(v) =>
                  logic.setStatusFilter(v as UserStatusFilter)
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

            {/* Actions */}
            <div className="flex items-center gap-2">
              {enableBulkActions && logic.selectedRows.size > 0 && (
                <Button
                  variant="outline"
                  onClick={logic.clearSelection}
                  size="sm"
                >
                  Clear ({logic.selectedRows.size})
                </Button>
              )}
              <Button onClick={logic.openCreateDialog}>
                <PlusIcon className="mr-2" />
                Add User
              </Button>
            </div>
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
                  {enableSelection && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={logic.allRowsSelected}
                        onCheckedChange={() => logic.selectAllRows()}
                      />
                    </TableHead>
                  )}
                  {columns.map((column) => (
                    <TableHead key={column.id} className={column.className}>
                      <SortableHeader column={column}>
                        {column.header}
                      </SortableHeader>
                    </TableHead>
                  ))}
                  <TableHead className="text-right w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (enableSelection ? 2 : 1)}
                      className="text-center py-8"
                    >
                      <LoaderIcon className="mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">
                        Loading users...
                      </p>
                    </TableCell>
                  </TableRow>
                ) : logic.users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (enableSelection ? 2 : 1)}
                      className="text-center py-8"
                    >
                      <UserIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium mt-2">No Users Found</p>
                      <p className="text-sm text-muted-foreground">
                        {logic.searchQuery
                          ? "Try adjusting your search or filters."
                          : "Get started by adding your first user."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logic.users.map((user) => (
                    <TableRow key={user.id}>
                      {enableSelection && (
                        <TableCell className="w-12">
                          <Checkbox
                            checked={logic.selectedRows.has(user.id)}
                            onCheckedChange={() =>
                              logic.toggleRowSelection(user.id)
                            }
                          />
                        </TableCell>
                      )}
                      {columns.map((column) => (
                        <TableCell key={column.id} className={column.className}>
                          {column.cell ? (
                            column.cell({ row: user })
                          ) : column.accessorKey ? (
                            <span>
                              {String(user[column.accessorKey] ?? "-")}
                            </span>
                          ) : null}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVerticalIcon />
                              <span className="sr-only">More Options</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onViewUser && (
                              <DropdownMenuItem
                                onClick={() => onViewUser(user)}
                              >
                                <EyeIcon className="mr-2" />
                                View Details
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => logic.openEditDialog(user)}
                            >
                              <PencilIcon className="mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => logic.openDeleteDialog(user)}
                              className="text-destructive"
                            >
                              <TrashIcon className="mr-2" />
                              Delete User
                            </DropdownMenuItem>
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
          {logic.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {logic.page} of {logic.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logic.setPage(logic.page - 1)}
                  disabled={logic.page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logic.setPage(logic.page + 1)}
                  disabled={logic.page >= logic.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!logic.selectedUserForDelete}
          onOpenChange={(open) => !open && logic.closeDeleteDialog()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "
                {logic.selectedUserForDelete
                  ? getUserDisplayName(logic.selectedUserForDelete)
                  : ""}
                "? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {logic.selectedUserForDelete && (
              <div className="py-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  You are about to delete:
                </p>
                <div className="bg-muted p-3 rounded-md space-y-1">
                  <p className="font-medium">
                    {getUserDisplayName(logic.selectedUserForDelete)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Email: {logic.selectedUserForDelete.email}
                  </p>
                  {logic.selectedUserForDelete.username && (
                    <p className="text-sm text-muted-foreground">
                      Username:{" "}
                      <code>{logic.selectedUserForDelete.username}</code>
                    </p>
                  )}
                </div>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDelete();
                }}
                disabled={isDeleting || !deleteMutation}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <LoaderIcon className="mr-2" />
                    Deleting...
                  </>
                ) : (
                  "Delete User"
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
              logic.refetch();
            }}
          />
        )}

        {/* Edit Dialog */}
        {EditDialog && (
          <EditDialog
            open={!!logic.selectedUserForEdit}
            onOpenChange={(open) => !open && logic.closeEditDialog()}
            user={logic.selectedUserForEdit}
            onSuccess={() => {
              logic.closeEditDialog();
              logic.refetch();
            }}
          />
        )}
      </>
    );
  };
}

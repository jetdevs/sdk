"use client";

/**
 * User Data Table Logic Hook
 *
 * Provides business logic for user data table management.
 * Separates logic from UI components following the factory pattern.
 *
 * @module @jetdevs/core/features/users/ui/hooks
 *
 * @example
 * ```typescript
 * const logic = useUserDataTableLogic({
 *   api: {
 *     user: {
 *       list: {
 *         useQuery: (input) => api.user.list.useQuery(input),
 *       },
 *     },
 *   },
 *   initialPageSize: 20,
 *   orgId: 1,
 * });
 * ```
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * User data structure for display in the data table
 */
export interface UserData {
  /** Unique database ID */
  id: number;
  /** First name */
  firstName: string | null;
  /** Last name */
  lastName: string | null;
  /** Full name (computed or stored) */
  name: string | null;
  /** Email address */
  email: string;
  /** Phone number */
  phone: string | null;
  /** Username for login */
  username: string | null;
  /** Whether the user is active */
  isActive: boolean;
  /** When the user was created */
  createdAt: Date;
  /** When the user was last updated */
  updatedAt: Date;
  /** User's roles (optional, depends on API) */
  roles?: Array<{
    id: number;
    name: string;
    orgId?: number;
  }>;
}

/**
 * Pagination state for users list
 */
export interface UsersPaginationState {
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  totalCount: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Sorting state
 */
export interface UsersSortingState {
  /** Column to sort by */
  column: string | null;
  /** Sort direction */
  direction: "asc" | "desc";
}

/**
 * Status filter options
 */
export type UserStatusFilter = "all" | "active" | "inactive";

/**
 * API interface for user data table
 */
export interface UserDataTableApi {
  user: {
    list: {
      useQuery(input: {
        page: number;
        pageSize: number;
        search?: string;
        sortBy?: string;
        sortOrder?: string;
        orgId?: number;
      }): {
        data: { users: UserData[]; total: number } | undefined;
        isLoading: boolean;
        error: Error | null;
        refetch: () => Promise<unknown>;
      };
    };
  };
}

/**
 * Configuration for useUserDataTableLogic hook
 */
export interface UseUserDataTableLogicConfig {
  /** API interface */
  api: UserDataTableApi;
  /** Initial page size */
  initialPageSize?: number;
  /** Organization ID for filtering */
  orgId?: number;
  /** Callback when a user is selected for editing */
  onEditUser?: (user: UserData) => void;
  /** Callback when a user is selected for deletion */
  onDeleteUser?: (user: UserData) => void;
  /** Callback when a user is selected for viewing */
  onViewUser?: (user: UserData) => void;
}

/**
 * Return type for useUserDataTableLogic hook
 */
export interface UserDataTableLogicReturn {
  // Data
  /** List of users (current page) */
  users: UserData[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;

  // Pagination
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** Total count of users */
  totalCount: number;
  /** Set current page */
  setPage: (page: number) => void;
  /** Set page size */
  setPageSize: (size: number) => void;

  // Sorting
  /** Current sort column */
  sortColumn: string | null;
  /** Current sort direction */
  sortDirection: "asc" | "desc";
  /** Set sorting */
  setSorting: (column: string, direction: "asc" | "desc") => void;

  // Search/Filter
  /** Current search query */
  searchQuery: string;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Current status filter */
  statusFilter: UserStatusFilter;
  /** Set status filter */
  setStatusFilter: (filter: UserStatusFilter) => void;

  // Selection
  /** Set of selected user IDs */
  selectedRows: Set<number>;
  /** Toggle selection for a user */
  toggleRowSelection: (userId: number) => void;
  /** Select all users on current page */
  selectAllRows: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Whether all rows on current page are selected */
  allRowsSelected: boolean;
  /** Whether some but not all rows are selected */
  someRowsSelected: boolean;

  // Dialogs
  /** User selected for deletion */
  selectedUserForDelete: UserData | null;
  /** Open delete confirmation dialog */
  openDeleteDialog: (user: UserData) => void;
  /** Close delete confirmation dialog */
  closeDeleteDialog: () => void;
  /** User selected for editing */
  selectedUserForEdit: UserData | null;
  /** Open edit dialog */
  openEditDialog: (user: UserData) => void;
  /** Close edit dialog */
  closeEditDialog: () => void;
  /** Whether create dialog is open */
  createDialogOpen: boolean;
  /** Open create dialog */
  openCreateDialog: () => void;
  /** Close create dialog */
  closeCreateDialog: () => void;

  // Actions
  /** Refresh the users list */
  refetch: () => Promise<void>;

  // Computed
  /** Result label for display (e.g., "Showing 10 of 100 users") */
  resultLabel: string;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for user data table logic
 *
 * Provides all stateful logic needed for a user data table component,
 * including search/filter functionality, pagination, sorting, and selection.
 *
 * @param config - Configuration object
 * @returns User data table state and actions
 */
export function useUserDataTableLogic(
  config: UseUserDataTableLogicConfig
): UserDataTableLogicReturn {
  const {
    api,
    initialPageSize = 20,
    orgId,
    onEditUser,
    onDeleteUser,
  } = config;

  // State
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const [searchQuery, setSearchQueryState] = React.useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<UserStatusFilter>("all");
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "asc"
  );

  // Selection state
  const [selectedRows, setSelectedRows] = React.useState<Set<number>>(
    new Set()
  );

  // Dialog state
  const [selectedUserForDelete, setSelectedUserForDelete] =
    React.useState<UserData | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] =
    React.useState<UserData | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, statusFilter, pageSize]);

  // Query data
  const queryResult = api.user.list.useQuery({
    page,
    pageSize,
    search: debouncedSearchQuery || undefined,
    sortBy: sortColumn || undefined,
    sortOrder: sortColumn ? sortDirection : undefined,
    orgId,
  });

  const { data, isLoading, error, refetch } = queryResult;

  // Extract users and apply client-side status filter if needed
  const allUsers = data?.users ?? [];
  const totalFromApi = data?.total ?? 0;

  // Apply status filter client-side if API doesn't support it
  const users = React.useMemo(() => {
    if (statusFilter === "all") {
      return allUsers;
    }
    const isActive = statusFilter === "active";
    return allUsers.filter((user) => user.isActive === isActive);
  }, [allUsers, statusFilter]);

  // Calculate pagination
  const totalCount = statusFilter === "all" ? totalFromApi : users.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Selection computed values
  const allRowsSelected = React.useMemo(() => {
    if (users.length === 0) return false;
    return users.every((user) => selectedRows.has(user.id));
  }, [users, selectedRows]);

  const someRowsSelected = React.useMemo(() => {
    if (users.length === 0) return false;
    const someSelected = users.some((user) => selectedRows.has(user.id));
    return someSelected && !allRowsSelected;
  }, [users, selectedRows, allRowsSelected]);

  // Result label
  const resultLabel = React.useMemo(() => {
    if (isLoading) return "Loading...";
    if (totalCount === 0) return "0 users";
    if (users.length === totalCount) {
      return `${totalCount} user${totalCount === 1 ? "" : "s"}`;
    }
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalCount);
    return `Showing ${start}-${end} of ${totalCount} users`;
  }, [isLoading, totalCount, users.length, page, pageSize]);

  // Setters
  const setSearchQuery = React.useCallback((query: string) => {
    setSearchQueryState(query);
  }, []);

  const setSorting = React.useCallback(
    (column: string, direction: "asc" | "desc") => {
      setSortColumn(column);
      setSortDirection(direction);
    },
    []
  );

  // Selection actions
  const toggleRowSelection = React.useCallback((userId: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const selectAllRows = React.useCallback(() => {
    if (allRowsSelected) {
      // Deselect all on current page
      setSelectedRows((prev) => {
        const next = new Set(prev);
        users.forEach((user) => next.delete(user.id));
        return next;
      });
    } else {
      // Select all on current page
      setSelectedRows((prev) => {
        const next = new Set(prev);
        users.forEach((user) => next.add(user.id));
        return next;
      });
    }
  }, [allRowsSelected, users]);

  const clearSelection = React.useCallback(() => {
    setSelectedRows(new Set());
  }, []);

  // Dialog actions
  const openDeleteDialog = React.useCallback(
    (user: UserData) => {
      setSelectedUserForDelete(user);
      onDeleteUser?.(user);
    },
    [onDeleteUser]
  );

  const closeDeleteDialog = React.useCallback(() => {
    setSelectedUserForDelete(null);
  }, []);

  const openEditDialog = React.useCallback(
    (user: UserData) => {
      setSelectedUserForEdit(user);
      onEditUser?.(user);
    },
    [onEditUser]
  );

  const closeEditDialog = React.useCallback(() => {
    setSelectedUserForEdit(null);
  }, []);

  const openCreateDialog = React.useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const closeCreateDialog = React.useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  // Refetch wrapper
  const handleRefetch = React.useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    // Data
    users,
    isLoading,
    error,

    // Pagination
    page,
    pageSize,
    totalPages,
    totalCount,
    setPage,
    setPageSize,

    // Sorting
    sortColumn,
    sortDirection,
    setSorting,

    // Search/Filter
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,

    // Selection
    selectedRows,
    toggleRowSelection,
    selectAllRows,
    clearSelection,
    allRowsSelected,
    someRowsSelected,

    // Dialogs
    selectedUserForDelete,
    openDeleteDialog,
    closeDeleteDialog,
    selectedUserForEdit,
    openEditDialog,
    closeEditDialog,
    createDialogOpen,
    openCreateDialog,
    closeCreateDialog,

    // Actions
    refetch: handleRefetch,

    // Computed
    resultLabel,
  };
}

"use client";

/**
 * Themes Data Table Logic Hook
 *
 * Provides business logic for themes data table management.
 * Separates logic from UI components following the factory pattern.
 *
 * @module @jetdevs/core/features/themes/ui/hooks
 *
 * @example
 * ```typescript
 * const logic = useThemesDataTableLogic({
 *   onDelete: async (uuid) => api.theme.delete.mutateAsync(uuid),
 *   onSetDefault: async (uuid) => api.theme.setDefault.mutateAsync(uuid),
 *   onToggleActive: async (uuid) => api.theme.toggleActive.mutateAsync(uuid),
 *   onRefresh: async () => utils.theme.getAllSystem.invalidate(),
 * }, themes);
 * ```
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Theme data structure for display in the data table
 */
export interface ThemeData {
  /** Unique database ID */
  id: number;
  /** UUID for API operations */
  uuid: string;
  /** Internal system name */
  name: string;
  /** User-facing display name */
  displayName: string;
  /** Optional description */
  description: string | null;
  /** CSS filename */
  cssFile: string;
  /** Whether the theme is active and available */
  isActive: boolean;
  /** Whether this is the default theme */
  isDefault: boolean;
  /** Whether this is the global override theme */
  isGlobal: boolean;
  /** When the theme was created */
  createdAt: Date;
  /** When the theme was last updated */
  updatedAt: Date;
}

/**
 * Pagination state for themes list
 */
export interface ThemesPaginationState {
  /** Current page index (0-indexed) */
  pageIndex: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  totalCount: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Status filter options
 */
export type ThemeStatusFilter = "all" | "active" | "inactive";

/**
 * Configuration for useThemesDataTableLogic hook
 */
export interface UseThemesDataTableLogicConfig {
  /** Callback when a theme is deleted */
  onDelete?: (uuid: string) => Promise<void>;
  /** Callback when a theme is set as default */
  onSetDefault?: (uuid: string) => Promise<void>;
  /** Callback when a theme is set as global */
  onSetGlobal?: (uuid: string) => Promise<void>;
  /** Callback when global theme is cleared */
  onClearGlobal?: () => Promise<void>;
  /** Callback when a theme's active status is toggled */
  onToggleActive?: (uuid: string) => Promise<void>;
  /** Callback to refresh the themes list */
  onRefresh?: () => Promise<void>;
  /** Initial page size */
  initialPageSize?: number;
}

/**
 * Return type for useThemesDataTableLogic hook
 */
export interface ThemesDataTableLogicReturn {
  /** List of themes (paginated) */
  themes: ThemeData[];
  /** All themes (filtered, unpaginated) */
  allFilteredThemes: ThemeData[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Pagination state */
  pagination: ThemesPaginationState;
  /** Set current page index */
  setPageIndex: (index: number) => void;
  /** Set page size */
  setPageSize: (size: number) => void;
  /** Current search term */
  searchTerm: string;
  /** Set search term */
  setSearchTerm: (term: string) => void;
  /** Current status filter */
  statusFilter: ThemeStatusFilter;
  /** Set status filter */
  setStatusFilter: (filter: ThemeStatusFilter) => void;
  /** Theme selected for deletion */
  selectedThemeForDelete: ThemeData | null;
  /** Open delete confirmation dialog */
  openDeleteDialog: (theme: ThemeData) => void;
  /** Close delete confirmation dialog */
  closeDeleteDialog: () => void;
  /** Confirm deletion */
  confirmDelete: () => Promise<void>;
  /** Whether deletion is in progress */
  isDeleting: boolean;
  /** Theme selected for editing */
  selectedThemeForEdit: ThemeData | null;
  /** Open edit dialog */
  openEditDialog: (theme: ThemeData) => void;
  /** Close edit dialog */
  closeEditDialog: () => void;
  /** Whether create dialog is open */
  createDialogOpen: boolean;
  /** Open create dialog */
  openCreateDialog: () => void;
  /** Close create dialog */
  closeCreateDialog: () => void;
  /** Set theme as default */
  handleSetDefault: (theme: ThemeData) => Promise<void>;
  /** Set theme as global */
  handleSetGlobal: (theme: ThemeData) => Promise<void>;
  /** Clear global theme */
  handleClearGlobal: () => Promise<void>;
  /** Toggle theme active status */
  handleToggleActive: (theme: ThemeData) => Promise<void>;
  /** Whether a set operation is in progress */
  isProcessing: boolean;
  /** Refresh the themes list */
  refresh: () => Promise<void>;
  /** Result label for display */
  resultLabel: string;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for themes data table logic
 *
 * Provides all stateful logic needed for a themes data table component,
 * including search/filter functionality, pagination, and CRUD operations.
 *
 * @param config - Configuration object
 * @param initialThemes - Initial themes data
 * @returns Themes data table state and actions
 */
export function useThemesDataTableLogic(
  config: UseThemesDataTableLogicConfig,
  initialThemes: ThemeData[] = []
): ThemesDataTableLogicReturn {
  const {
    onDelete,
    onSetDefault,
    onSetGlobal,
    onClearGlobal,
    onToggleActive,
    onRefresh,
    initialPageSize = 20,
  } = config;

  // State
  const [themes, setThemes] = React.useState<ThemeData[]>(initialThemes);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<ThemeStatusFilter>("all");

  // Pagination state
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  // Dialog state
  const [selectedThemeForDelete, setSelectedThemeForDelete] =
    React.useState<ThemeData | null>(null);
  const [selectedThemeForEdit, setSelectedThemeForEdit] =
    React.useState<ThemeData | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  // Operation state
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // Update themes when initialThemes changes
  React.useEffect(() => {
    setThemes(initialThemes);
  }, [initialThemes]);

  // Filter themes based on search and status
  const filteredThemes = React.useMemo(() => {
    let result = themes;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(
        (theme) =>
          theme.name.toLowerCase().includes(searchLower) ||
          theme.displayName.toLowerCase().includes(searchLower) ||
          theme.description?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      const isActive = statusFilter === "active";
      result = result.filter((theme) => theme.isActive === isActive);
    }

    return result;
  }, [themes, searchTerm, statusFilter]);

  // Calculate pagination
  const pagination: ThemesPaginationState = React.useMemo(() => {
    const totalCount = filteredThemes.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    return {
      pageIndex,
      pageSize,
      totalCount,
      totalPages,
    };
  }, [filteredThemes.length, pageIndex, pageSize]);

  // Get paginated themes
  const paginatedThemes = React.useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredThemes.slice(start, start + pageSize);
  }, [filteredThemes, pageIndex, pageSize]);

  // Result label
  const resultLabel = React.useMemo(() => {
    if (filteredThemes.length === 0) return "0 themes";
    if (filteredThemes.length === paginatedThemes.length) {
      return `${paginatedThemes.length} themes`;
    }
    return `Showing ${paginatedThemes.length} of ${filteredThemes.length} themes`;
  }, [filteredThemes.length, paginatedThemes.length]);

  // Reset page when filters change
  React.useEffect(() => {
    setPageIndex(0);
  }, [searchTerm, statusFilter]);

  // Dialog handlers
  const openDeleteDialog = React.useCallback((theme: ThemeData) => {
    setSelectedThemeForDelete(theme);
  }, []);

  const closeDeleteDialog = React.useCallback(() => {
    setSelectedThemeForDelete(null);
  }, []);

  const openEditDialog = React.useCallback((theme: ThemeData) => {
    setSelectedThemeForEdit(theme);
  }, []);

  const closeEditDialog = React.useCallback(() => {
    setSelectedThemeForEdit(null);
  }, []);

  const openCreateDialog = React.useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const closeCreateDialog = React.useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  // Operation handlers
  const confirmDelete = React.useCallback(async () => {
    if (!selectedThemeForDelete || !onDelete) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(selectedThemeForDelete.uuid);
      setSelectedThemeForDelete(null);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete theme";
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedThemeForDelete, onDelete, onRefresh]);

  const handleSetDefault = React.useCallback(
    async (theme: ThemeData) => {
      if (!onSetDefault) return;

      setIsProcessing(true);
      setError(null);

      try {
        await onSetDefault(theme.uuid);
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to set default theme";
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [onSetDefault, onRefresh]
  );

  const handleSetGlobal = React.useCallback(
    async (theme: ThemeData) => {
      if (!onSetGlobal) return;

      setIsProcessing(true);
      setError(null);

      try {
        await onSetGlobal(theme.uuid);
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to set global theme";
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [onSetGlobal, onRefresh]
  );

  const handleClearGlobal = React.useCallback(async () => {
    if (!onClearGlobal) return;

    setIsProcessing(true);
    setError(null);

    try {
      await onClearGlobal();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to clear global theme";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [onClearGlobal, onRefresh]);

  const handleToggleActive = React.useCallback(
    async (theme: ThemeData) => {
      if (!onToggleActive) return;

      setIsProcessing(true);
      setError(null);

      try {
        await onToggleActive(theme.uuid);
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to toggle theme status";
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [onToggleActive, onRefresh]
  );

  const refresh = React.useCallback(async () => {
    if (!onRefresh) return;

    setIsLoading(true);
    setError(null);

    try {
      await onRefresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh themes";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onRefresh]);

  return {
    themes: paginatedThemes,
    allFilteredThemes: filteredThemes,
    isLoading,
    error,
    pagination,
    setPageIndex,
    setPageSize,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    selectedThemeForDelete,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
    isDeleting,
    selectedThemeForEdit,
    openEditDialog,
    closeEditDialog,
    createDialogOpen,
    openCreateDialog,
    closeCreateDialog,
    handleSetDefault,
    handleSetGlobal,
    handleClearGlobal,
    handleToggleActive,
    isProcessing,
    refresh,
    resultLabel,
  };
}

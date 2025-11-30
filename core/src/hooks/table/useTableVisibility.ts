/**
 * Table Column Visibility Hook
 *
 * Manages column visibility state for tables.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseTableVisibilityProps<T> {
  /** All available columns */
  columns: Array<keyof T>;
  /** Initial visibility state */
  initialVisibility?: Partial<Record<keyof T, boolean>>;
  /** Columns that are always visible */
  alwaysVisibleColumns?: Array<keyof T>;
}

export interface UseTableVisibilityReturn<T> {
  /** Current visibility state for all columns */
  columnVisibility: Record<keyof T, boolean>;
  /** Array of currently visible columns */
  visibleColumns: Array<keyof T>;
  /** Array of hidden columns */
  hiddenColumns: Array<keyof T>;
  /** Number of visible columns */
  visibleCount: number;
  /** Update visibility for a column */
  onVisibilityChange: (column: keyof T, isVisible: boolean) => void;
  /** Toggle visibility for a column */
  toggleVisibility: (column: keyof T) => void;
  /** Reset to initial/default visibility */
  resetVisibility: () => void;
  /** Show all columns */
  showAll: () => void;
  /** Hide specific columns */
  hideColumns: (columns: Array<keyof T>) => void;
  /** Check if a column is visible */
  isColumnVisible: (column: keyof T) => boolean;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing table column visibility
 *
 * @example
 * const visibility = useTableVisibility({
 *   columns: ['name', 'email', 'role', 'createdAt'],
 *   initialVisibility: { createdAt: false },
 *   alwaysVisibleColumns: ['name'],
 * });
 *
 * // Column visibility dropdown
 * {visibility.columns.map((column) => (
 *   <DropdownMenuItem
 *     key={column}
 *     onClick={() => visibility.toggleVisibility(column)}
 *   >
 *     <Checkbox checked={visibility.isColumnVisible(column)} />
 *     {column}
 *   </DropdownMenuItem>
 * ))}
 */
export function useTableVisibility<T>({
  columns,
  initialVisibility = {},
  alwaysVisibleColumns = [],
}: UseTableVisibilityProps<T>): UseTableVisibilityReturn<T> {
  const getDefaultVisibility = useCallback((): Record<keyof T, boolean> => {
    const visibility = {} as Record<keyof T, boolean>;
    columns.forEach((column) => {
      visibility[column] = initialVisibility[column] ?? true;
    });
    return visibility;
  }, [columns, initialVisibility]);

  const [columnVisibility, setColumnVisibility] = useState<Record<keyof T, boolean>>(
    getDefaultVisibility
  );

  const handleVisibilityChange = useCallback(
    (column: keyof T, isVisible: boolean) => {
      // Don't allow hiding always-visible columns
      if (!isVisible && alwaysVisibleColumns.includes(column)) {
        return;
      }
      setColumnVisibility((prev) => ({
        ...prev,
        [column]: isVisible,
      }));
    },
    [alwaysVisibleColumns]
  );

  const toggleVisibility = useCallback(
    (column: keyof T) => {
      // Don't allow hiding always-visible columns
      if (alwaysVisibleColumns.includes(column)) {
        return;
      }
      setColumnVisibility((prev) => ({
        ...prev,
        [column]: !prev[column],
      }));
    },
    [alwaysVisibleColumns]
  );

  const resetVisibility = useCallback(() => {
    setColumnVisibility(getDefaultVisibility());
  }, [getDefaultVisibility]);

  const showAll = useCallback(() => {
    const visibility = {} as Record<keyof T, boolean>;
    columns.forEach((column) => {
      visibility[column] = true;
    });
    setColumnVisibility(visibility);
  }, [columns]);

  const hideColumns = useCallback(
    (columnsToHide: Array<keyof T>) => {
      setColumnVisibility((prev) => {
        const next = { ...prev };
        columnsToHide.forEach((column) => {
          // Don't hide always-visible columns
          if (!alwaysVisibleColumns.includes(column)) {
            next[column] = false;
          }
        });
        return next;
      });
    },
    [alwaysVisibleColumns]
  );

  const isColumnVisible = useCallback(
    (column: keyof T) => columnVisibility[column] ?? true,
    [columnVisibility]
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => columnVisibility[column]),
    [columns, columnVisibility]
  );

  const hiddenColumns = useMemo(
    () => columns.filter((column) => !columnVisibility[column]),
    [columns, columnVisibility]
  );

  const visibleCount = visibleColumns.length;

  return {
    columnVisibility,
    visibleColumns,
    hiddenColumns,
    visibleCount,
    onVisibilityChange: handleVisibilityChange,
    toggleVisibility,
    resetVisibility,
    showAll,
    hideColumns,
    isColumnVisible,
  };
}

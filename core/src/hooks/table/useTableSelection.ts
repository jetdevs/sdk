/**
 * Table Selection Hook
 *
 * Manages row selection state for tables.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseTableSelectionProps<T> {
  /** Data array */
  data: T[];
  /** Function to get unique row ID */
  getRowId?: (row: T) => string;
}

export interface UseTableSelectionReturn<T> {
  /** Map of selected row IDs to boolean */
  selectedRows: Record<string, boolean>;
  /** Array of selected items */
  selectedItems: T[];
  /** Whether all visible rows are selected */
  isAllSelected: boolean;
  /** Whether some but not all rows are selected */
  isIndeterminate: boolean;
  /** Number of selected rows */
  selectedCount: number;
  /** Update the selection state */
  onSelectionChange: (selection: Record<string, boolean>) => void;
  /** Toggle all rows */
  toggleAll: () => void;
  /** Toggle a single row */
  toggleRow: (row: T) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select specific rows by ID */
  selectRows: (ids: string[]) => void;
  /** Check if a row is selected */
  isRowSelected: (row: T) => boolean;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing table row selection
 *
 * @example
 * const selection = useTableSelection({
 *   data: users,
 *   getRowId: (user) => user.id,
 * });
 *
 * // In your table
 * <Checkbox
 *   checked={selection.isAllSelected}
 *   indeterminate={selection.isIndeterminate}
 *   onChange={selection.toggleAll}
 * />
 *
 * // Per row
 * <Checkbox
 *   checked={selection.isRowSelected(row)}
 *   onChange={() => selection.toggleRow(row)}
 * />
 */
export function useTableSelection<T>({
  data,
  getRowId = (row: unknown) => (row as { id: string }).id,
}: UseTableSelectionProps<T>): UseTableSelectionReturn<T> {
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const handleSelectionChange = useCallback(
    (selection: Record<string, boolean>) => {
      setSelectedRows(selection);
    },
    []
  );

  const selectedItems = useMemo(
    () => data.filter((item) => selectedRows[getRowId(item)]),
    [data, getRowId, selectedRows]
  );

  const selectedCount = useMemo(
    () => Object.values(selectedRows).filter(Boolean).length,
    [selectedRows]
  );

  const isAllSelected = useMemo(
    () => data.length > 0 && data.every((item) => selectedRows[getRowId(item)]),
    [data, getRowId, selectedRows]
  );

  const isIndeterminate = useMemo(
    () => selectedCount > 0 && !isAllSelected,
    [selectedCount, isAllSelected]
  );

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedRows({});
    } else {
      const newSelection: Record<string, boolean> = {};
      data.forEach((item) => {
        newSelection[getRowId(item)] = true;
      });
      setSelectedRows(newSelection);
    }
  }, [data, getRowId, isAllSelected]);

  const toggleRow = useCallback(
    (row: T) => {
      const id = getRowId(row);
      setSelectedRows((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    },
    [getRowId]
  );

  const clearSelection = useCallback(() => {
    setSelectedRows({});
  }, []);

  const selectRows = useCallback((ids: string[]) => {
    const newSelection: Record<string, boolean> = {};
    ids.forEach((id) => {
      newSelection[id] = true;
    });
    setSelectedRows(newSelection);
  }, []);

  const isRowSelected = useCallback(
    (row: T) => !!selectedRows[getRowId(row)],
    [getRowId, selectedRows]
  );

  return {
    selectedRows,
    selectedItems,
    isAllSelected,
    isIndeterminate,
    selectedCount,
    onSelectionChange: handleSelectionChange,
    toggleAll,
    toggleRow,
    clearSelection,
    selectRows,
    isRowSelected,
  };
}

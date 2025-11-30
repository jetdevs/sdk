/**
 * Table Sort Hook
 *
 * Client-side sorting for tables with support for various data types.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T> {
  /** Column key to sort by */
  key: keyof T;
  /** Sort direction */
  direction: SortDirection;
}

export interface UseTableSortProps<T> {
  /** Data array */
  items: T[];
  /** Initial sort configuration */
  initialSort?: SortConfig<T> | null;
  /** Custom comparator function */
  customComparator?: (a: T, b: T, config: SortConfig<T>) => number;
}

export interface UseTableSortReturn<T> {
  /** Current sort configuration */
  sortConfig: SortConfig<T> | null;
  /** Sorted items */
  sortedItems: T[];
  /** Sort by a column (toggles direction if already sorting by that column) */
  handleSort: (key: keyof T) => void;
  /** Set sort configuration directly */
  setSortConfig: (config: SortConfig<T> | null) => void;
  /** Clear sorting */
  clearSort: () => void;
  /** Check if a column is currently being sorted */
  isSortedBy: (key: keyof T) => boolean;
  /** Get sort direction for a column */
  getSortDirection: (key: keyof T) => SortDirection | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function defaultComparator<T extends Record<string, unknown>>(
  a: T,
  b: T,
  config: SortConfig<T>
): number {
  const { key, direction } = config;
  const aValue = a[key];
  const bValue = b[key];

  // Handle null/undefined
  if (aValue == null && bValue == null) return 0;
  if (aValue == null) return direction === 'asc' ? -1 : 1;
  if (bValue == null) return direction === 'asc' ? 1 : -1;

  // Handle Date objects
  if (aValue instanceof Date && bValue instanceof Date) {
    const diff = aValue.getTime() - bValue.getTime();
    return direction === 'asc' ? diff : -diff;
  }

  // Handle arrays (e.g., tags, roles)
  if (Array.isArray(aValue) && Array.isArray(bValue)) {
    const aStr = aValue
      .map((item: unknown) =>
        typeof item === 'object' && item !== null && 'name' in item
          ? (item as { name: string }).name
          : String(item)
      )
      .join(',');

    const bStr = bValue
      .map((item: unknown) =>
        typeof item === 'object' && item !== null && 'name' in item
          ? (item as { name: string }).name
          : String(item)
      )
      .join(',');

    const comparison = aStr.localeCompare(bStr);
    return direction === 'asc' ? comparison : -comparison;
  }

  // Handle numbers
  if (typeof aValue === 'number' && typeof bValue === 'number') {
    const diff = aValue - bValue;
    return direction === 'asc' ? diff : -diff;
  }

  // Handle booleans
  if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
    const diff = Number(aValue) - Number(bValue);
    return direction === 'asc' ? diff : -diff;
  }

  // Default: string comparison
  const aString = String(aValue);
  const bString = String(bValue);
  const comparison = aString.localeCompare(bString);
  return direction === 'asc' ? comparison : -comparison;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for client-side table sorting
 *
 * @example
 * const { sortConfig, sortedItems, handleSort, getSortDirection } = useTableSort({
 *   items: users,
 *   initialSort: { key: 'name', direction: 'asc' },
 * });
 *
 * // Column header with sort indicator
 * <TableHead onClick={() => handleSort('name')}>
 *   Name
 *   {getSortDirection('name') === 'asc' && <ChevronUp />}
 *   {getSortDirection('name') === 'desc' && <ChevronDown />}
 * </TableHead>
 */
export function useTableSort<T extends Record<string, unknown>>({
  items,
  initialSort = null,
  customComparator,
}: UseTableSortProps<T>): UseTableSortReturn<T> {
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(initialSort);

  const handleSort = useCallback((key: keyof T) => {
    setSortConfig((currentConfig) => {
      if (currentConfig?.key === key) {
        return {
          key,
          direction: currentConfig.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const clearSort = useCallback(() => {
    setSortConfig(null);
  }, []);

  const isSortedBy = useCallback(
    (key: keyof T): boolean => {
      return sortConfig?.key === key;
    },
    [sortConfig]
  );

  const getSortDirection = useCallback(
    (key: keyof T): SortDirection | null => {
      if (sortConfig?.key !== key) return null;
      return sortConfig.direction;
    },
    [sortConfig]
  );

  const sortedItems = useMemo(() => {
    if (!sortConfig) return items;

    const comparator = customComparator || defaultComparator;

    return [...items].sort((a, b) => comparator(a, b, sortConfig));
  }, [items, sortConfig, customComparator]);

  return {
    sortConfig,
    sortedItems,
    handleSort,
    setSortConfig,
    clearSort,
    isSortedBy,
    getSortDirection,
  };
}

/**
 * Table Filter Hook
 *
 * Manages column-based filtering for tables.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseTableFilterProps<T> {
  /** Data array */
  data: T[];
  /** Columns available for filtering */
  columns: Array<keyof T>;
  /** Initial filter values */
  initialFilters?: Partial<Record<keyof T, string>>;
}

export interface UseTableFilterReturn<T> {
  /** Current filter values */
  filters: Partial<Record<keyof T, string>>;
  /** Filtered data */
  filteredData: T[];
  /** Whether any filters are active */
  hasActiveFilters: boolean;
  /** Number of active filters */
  activeFilterCount: number;
  /** Update a single filter */
  onFilterChange: (column: keyof T, value: string) => void;
  /** Set multiple filters at once */
  setFilters: (filters: Partial<Record<keyof T, string>>) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Clear a single filter */
  clearFilter: (column: keyof T) => void;
  /** Get filter value for a column */
  getFilterValue: (column: keyof T) => string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function matchValue(value: unknown, filterValue: string): boolean {
  if (value == null) return false;

  const lowerFilter = filterValue.toLowerCase();

  if (typeof value === 'string') {
    return value.toLowerCase().includes(lowerFilter);
  }

  if (typeof value === 'number') {
    return value.toString().includes(filterValue);
  }

  if (typeof value === 'boolean') {
    return value.toString() === filterValue;
  }

  if (Array.isArray(value)) {
    return value.some((v) =>
      v?.toString().toLowerCase().includes(lowerFilter)
    );
  }

  if (typeof value === 'object') {
    return JSON.stringify(value).toLowerCase().includes(lowerFilter);
  }

  return false;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing table column filters
 *
 * @example
 * const filter = useTableFilter({
 *   data: users,
 *   columns: ['name', 'email', 'role'],
 * });
 *
 * // Filter input
 * <Input
 *   value={filter.getFilterValue('name')}
 *   onChange={(e) => filter.onFilterChange('name', e.target.value)}
 *   placeholder="Filter by name..."
 * />
 *
 * // Clear filters button
 * {filter.hasActiveFilters && (
 *   <Button onClick={filter.clearFilters}>
 *     Clear filters ({filter.activeFilterCount})
 *   </Button>
 * )}
 */
export function useTableFilter<T>({
  data,
  columns,
  initialFilters = {},
}: UseTableFilterProps<T>): UseTableFilterReturn<T> {
  const [filters, setFiltersState] = useState<Partial<Record<keyof T, string>>>(
    initialFilters
  );

  const handleFilterChange = useCallback((column: keyof T, value: string) => {
    setFiltersState((prev) => ({
      ...prev,
      [column]: value,
    }));
  }, []);

  const setFilters = useCallback(
    (newFilters: Partial<Record<keyof T, string>>) => {
      setFiltersState(newFilters);
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  const clearFilter = useCallback((column: keyof T) => {
    setFiltersState((prev) => {
      const next = { ...prev };
      delete next[column];
      return next;
    });
  }, []);

  const getFilterValue = useCallback(
    (column: keyof T): string => {
      return filters[column] || '';
    },
    [filters]
  );

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v && (v as string).trim() !== '').length,
    [filters]
  );

  const hasActiveFilters = activeFilterCount > 0;

  const filteredData = useMemo(() => {
    if (!hasActiveFilters) return data;

    return data.filter((item) => {
      return columns.every((column) => {
        const filterValue = filters[column];
        if (!filterValue || filterValue.trim() === '') return true;
        return matchValue(item[column], filterValue);
      });
    });
  }, [data, columns, filters, hasActiveFilters]);

  return {
    filters,
    filteredData,
    hasActiveFilters,
    activeFilterCount,
    onFilterChange: handleFilterChange,
    setFilters,
    clearFilters,
    clearFilter,
    getFilterValue,
  };
}

/**
 * Table Search Hook
 *
 * Manages global search across multiple columns.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface UseTableSearchProps<T> {
  /** Data array */
  data: T[];
  /** Columns to search in */
  searchableColumns: Array<keyof T>;
  /** Initial search term */
  initialSearchTerm?: string;
  /** Debounce delay in ms (default: 0 for immediate) */
  debounceMs?: number;
}

export interface UseTableSearchReturn<T> {
  /** Current search term */
  searchTerm: string;
  /** Searched/filtered data */
  searchedData: T[];
  /** Whether search is active */
  isSearchActive: boolean;
  /** Number of results */
  resultCount: number;
  /** Update the search term */
  onSearchChange: (term: string) => void;
  /** Clear the search */
  clearSearch: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function matchValue(value: unknown, searchTerm: string): boolean {
  if (value == null) return false;

  const lowerSearch = searchTerm.toLowerCase();

  if (typeof value === 'string') {
    return value.toLowerCase().includes(lowerSearch);
  }

  if (typeof value === 'number') {
    return value.toString().includes(searchTerm);
  }

  if (typeof value === 'boolean') {
    return value.toString() === searchTerm;
  }

  if (Array.isArray(value)) {
    return value.some((v) =>
      v?.toString().toLowerCase().includes(lowerSearch)
    );
  }

  if (typeof value === 'object') {
    return JSON.stringify(value).toLowerCase().includes(lowerSearch);
  }

  return false;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing table global search
 *
 * @example
 * const search = useTableSearch({
 *   data: users,
 *   searchableColumns: ['name', 'email', 'department'],
 * });
 *
 * // Search input
 * <Input
 *   value={search.searchTerm}
 *   onChange={(e) => search.onSearchChange(e.target.value)}
 *   placeholder="Search..."
 * />
 *
 * // Show result count
 * {search.isSearchActive && (
 *   <span>{search.resultCount} results found</span>
 * )}
 */
export function useTableSearch<T>({
  data,
  searchableColumns,
  initialSearchTerm = '',
}: UseTableSearchProps<T>): UseTableSearchReturn<T> {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const isSearchActive = searchTerm.trim() !== '';

  const searchedData = useMemo(() => {
    if (!isSearchActive) return data;

    return data.filter((item) =>
      searchableColumns.some((column) => matchValue(item[column], searchTerm))
    );
  }, [data, searchableColumns, searchTerm, isSearchActive]);

  const resultCount = searchedData.length;

  return {
    searchTerm,
    searchedData,
    isSearchActive,
    resultCount,
    onSearchChange: handleSearchChange,
    clearSearch,
  };
}

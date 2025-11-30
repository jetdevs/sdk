/**
 * Table Pagination & Sorting Hook
 *
 * Base hook for table pagination and sorting state management.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface SortingState {
  id: string;
  desc: boolean;
}

export interface UseTableProps {
  /** Default page size (default: 10) */
  defaultPageSize?: number;
  /** Default current page (default: 1) */
  defaultCurrentPage?: number;
  /** Default sorting state */
  defaultSorting?: SortingState[];
  /** Total number of items */
  total?: number;
}

export interface UseTableReturn {
  pageSize: number;
  currentPage: number;
  sorting: SortingState[];
  totalPages: number;
  onPaginationChange: (page: number, size: number) => void;
  onSortingChange: (sorting: SortingState[]) => void;
  setPageSize: (size: number) => void;
  setCurrentPage: (page: number) => void;
  resetPagination: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing table pagination and sorting state
 *
 * @example
 * const table = useTable({
 *   defaultPageSize: 10,
 *   total: data.length,
 * });
 *
 * // Use with server-side pagination
 * const { data } = api.users.list.useQuery({
 *   page: table.currentPage,
 *   limit: table.pageSize,
 *   sortBy: table.sorting[0]?.id,
 *   sortOrder: table.sorting[0]?.desc ? 'desc' : 'asc',
 * });
 */
export function useTable({
  defaultPageSize = 10,
  defaultCurrentPage = 1,
  defaultSorting = [],
  total = 0,
}: UseTableProps = {}): UseTableReturn {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(defaultCurrentPage);
  const [sorting, setSorting] = useState<SortingState[]>(defaultSorting);

  const handlePaginationChange = useCallback((page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
  }, []);

  const handleSortingChange = useCallback((newSorting: SortingState[]) => {
    setSorting(newSorting);
    // Reset to first page when sorting changes
    setCurrentPage(1);
  }, []);

  const resetPagination = useCallback(() => {
    setCurrentPage(defaultCurrentPage);
    setPageSize(defaultPageSize);
  }, [defaultCurrentPage, defaultPageSize]);

  const totalPages = useMemo(
    () => Math.ceil(total / pageSize) || 1,
    [total, pageSize]
  );

  return {
    pageSize,
    currentPage,
    sorting,
    totalPages,
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    setPageSize,
    setCurrentPage,
    resetPagination,
  };
}

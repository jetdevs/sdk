/**
 * Table State Hook
 *
 * Composed hook that combines all table functionality:
 * pagination, sorting, selection, filtering, search, visibility, and export.
 */

'use client';

import { useMemo } from 'react';
import { useTable, type SortingState } from './useTable';
import { useTableSelection } from './useTableSelection';
import { useTableFilter } from './useTableFilter';
import { useTableSearch } from './useTableSearch';
import { useTableVisibility } from './useTableVisibility';
import { useTableExport } from './useTableExport';

// =============================================================================
// TYPES
// =============================================================================

export interface UseTableStateProps<T> {
  /** Source data */
  data: T[];
  /** All columns */
  columns: Array<keyof T>;
  /** Default page size */
  defaultPageSize?: number;
  /** Default current page */
  defaultCurrentPage?: number;
  /** Default sorting state */
  defaultSorting?: SortingState[];
  /** Initial column filters */
  defaultFilters?: Partial<Record<keyof T, string>>;
  /** Initial search term */
  defaultSearchTerm?: string;
  /** Initial column visibility */
  defaultVisibility?: Partial<Record<keyof T, boolean>>;
  /** Function to get row ID */
  getRowId?: (row: T) => string;
  /** Function to get column header text */
  getColumnHeader?: (column: keyof T) => string;
  /** Function to get cell value as string */
  getColumnValue?: (item: T, column: keyof T) => string;
  /** Columns to include in search */
  searchableColumns?: Array<keyof T>;
  /** Columns available for filtering */
  filterableColumns?: Array<keyof T>;
  /** Total item count (for server-side pagination) */
  total?: number;
  /** Export filename */
  filename?: string;
}

export interface UseTableStateReturn<T> {
  // Data
  /** Processed data for current page */
  data: T[];
  /** Total items after filtering/search */
  totalItems: number;

  // Pagination
  pageSize: number;
  currentPage: number;
  totalPages: number;
  onPaginationChange: (page: number, size: number) => void;

  // Sorting
  sorting: SortingState[];
  onSortingChange: (sorting: SortingState[]) => void;

  // Selection
  selectedRows: Record<string, boolean>;
  selectedItems: T[];
  isAllSelected: boolean;
  isIndeterminate: boolean;
  selectedCount: number;
  onSelectionChange: (selection: Record<string, boolean>) => void;
  toggleAll: () => void;
  toggleRow: (row: T) => void;
  clearSelection: () => void;
  isRowSelected: (row: T) => boolean;

  // Filtering
  filters: Partial<Record<keyof T, string>>;
  hasActiveFilters: boolean;
  onFilterChange: (column: keyof T, value: string) => void;
  clearFilters: () => void;

  // Search
  searchTerm: string;
  isSearchActive: boolean;
  onSearchChange: (term: string) => void;
  clearSearch: () => void;

  // Column Visibility
  columnVisibility: Record<keyof T, boolean>;
  visibleColumns: Array<keyof T>;
  onVisibilityChange: (column: keyof T, isVisible: boolean) => void;
  toggleVisibility: (column: keyof T) => void;
  resetVisibility: () => void;
  isColumnVisible: (column: keyof T) => boolean;

  // Export
  exportToCSV: () => void;
  exportToJSON: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Composed hook combining all table functionality
 *
 * @example
 * const table = useTableState({
 *   data: users,
 *   columns: ['name', 'email', 'role', 'createdAt'],
 *   defaultPageSize: 10,
 *   searchableColumns: ['name', 'email'],
 *   filterableColumns: ['role'],
 *   filename: 'users-export',
 * });
 *
 * // Use in your table component
 * <Table>
 *   <TableHeader>
 *     <Checkbox
 *       checked={table.isAllSelected}
 *       indeterminate={table.isIndeterminate}
 *       onChange={table.toggleAll}
 *     />
 *     {table.visibleColumns.map((column) => (
 *       <TableHead key={column}>{column}</TableHead>
 *     ))}
 *   </TableHeader>
 *   <TableBody>
 *     {table.data.map((row) => (
 *       <TableRow key={table.getRowId(row)}>
 *         <Checkbox
 *           checked={table.isRowSelected(row)}
 *           onChange={() => table.toggleRow(row)}
 *         />
 *         {table.visibleColumns.map((column) => (
 *           <TableCell key={column}>{row[column]}</TableCell>
 *         ))}
 *       </TableRow>
 *     ))}
 *   </TableBody>
 * </Table>
 */
export function useTableState<T>({
  data,
  columns,
  defaultPageSize = 10,
  defaultCurrentPage = 1,
  defaultSorting = [],
  defaultFilters = {},
  defaultSearchTerm = '',
  defaultVisibility = {},
  getRowId = (row: unknown) => (row as { id: string }).id,
  getColumnHeader = (column) => String(column),
  getColumnValue = (item, column) => {
    const value = item[column];
    if (value == null) return '';
    return String(value);
  },
  searchableColumns = columns,
  filterableColumns = columns,
  total,
  filename = 'export',
}: UseTableStateProps<T>): UseTableStateReturn<T> {
  // Filter first
  const filter = useTableFilter({
    data,
    columns: filterableColumns,
    initialFilters: defaultFilters,
  });

  // Then search on filtered data
  const search = useTableSearch({
    data: filter.filteredData,
    searchableColumns,
    initialSearchTerm: defaultSearchTerm,
  });

  // Calculate total based on processed data
  const processedTotal = total ?? search.searchedData.length;

  // Pagination and sorting
  const table = useTable({
    defaultPageSize,
    defaultCurrentPage,
    defaultSorting,
    total: processedTotal,
  });

  // Selection on search results
  const selection = useTableSelection({
    data: search.searchedData,
    getRowId,
  });

  // Column visibility
  const visibility = useTableVisibility({
    columns,
    initialVisibility: defaultVisibility,
  });

  // Export using visible columns and searched data
  const exporter = useTableExport({
    data: search.searchedData,
    columns: visibility.visibleColumns,
    filename,
    getColumnHeader,
    getColumnValue,
  });

  // Paginate the final data
  const paginatedData = useMemo(() => {
    const start = (table.currentPage - 1) * table.pageSize;
    const end = start + table.pageSize;
    return search.searchedData.slice(start, end);
  }, [search.searchedData, table.currentPage, table.pageSize]);

  return {
    // Data
    data: paginatedData,
    totalItems: search.searchedData.length,

    // Pagination
    pageSize: table.pageSize,
    currentPage: table.currentPage,
    totalPages: table.totalPages,
    onPaginationChange: table.onPaginationChange,

    // Sorting
    sorting: table.sorting,
    onSortingChange: table.onSortingChange,

    // Selection
    selectedRows: selection.selectedRows,
    selectedItems: selection.selectedItems,
    isAllSelected: selection.isAllSelected,
    isIndeterminate: selection.isIndeterminate,
    selectedCount: selection.selectedCount,
    onSelectionChange: selection.onSelectionChange,
    toggleAll: selection.toggleAll,
    toggleRow: selection.toggleRow,
    clearSelection: selection.clearSelection,
    isRowSelected: selection.isRowSelected,

    // Filtering
    filters: filter.filters,
    hasActiveFilters: filter.hasActiveFilters,
    onFilterChange: filter.onFilterChange,
    clearFilters: filter.clearFilters,

    // Search
    searchTerm: search.searchTerm,
    isSearchActive: search.isSearchActive,
    onSearchChange: search.onSearchChange,
    clearSearch: search.clearSearch,

    // Column Visibility
    columnVisibility: visibility.columnVisibility,
    visibleColumns: visibility.visibleColumns,
    onVisibilityChange: visibility.onVisibilityChange,
    toggleVisibility: visibility.toggleVisibility,
    resetVisibility: visibility.resetVisibility,
    isColumnVisible: visibility.isColumnVisible,

    // Export
    exportToCSV: exporter.exportToCSV,
    exportToJSON: exporter.exportToJSON,
  };
}

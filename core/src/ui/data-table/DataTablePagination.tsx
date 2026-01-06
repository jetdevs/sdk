'use client';

import type { Table } from '@tanstack/react-table';
import * as React from 'react';

// =============================================================================
// UI COMPONENT TYPES
// =============================================================================

/**
 * UI components that must be injected to create a DataTablePagination.
 */
export interface PaginationUIComponents {
  Button: React.ComponentType<{
    variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }>;
  ChevronLeftIcon: React.ComponentType<{ className?: string }>;
  ChevronRightIcon: React.ComponentType<{ className?: string }>;
  ChevronsLeftIcon: React.ComponentType<{ className?: string }>;
  ChevronsRightIcon: React.ComponentType<{ className?: string }>;
}

// =============================================================================
// TYPES
// =============================================================================

export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  showSelectedCount?: boolean;
  className?: string;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a DataTablePagination component with injected UI dependencies.
 *
 * @param ui - UI components to use for rendering (Button, icons)
 * @returns A DataTablePagination component
 *
 * @example
 * ```typescript
 * import { createDataTablePagination } from '@jetdevs/core/ui/data-table';
 * import { Button } from '@/components/ui/button';
 * import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
 *
 * export const DataTablePagination = createDataTablePagination({
 *   Button,
 *   ChevronLeftIcon: ChevronLeft,
 *   ChevronRightIcon: ChevronRight,
 *   ChevronsLeftIcon: ChevronsLeft,
 *   ChevronsRightIcon: ChevronsRight,
 * });
 * ```
 */
export function createDataTablePagination(ui: PaginationUIComponents) {
  const { Button, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } = ui;

  /**
   * A pagination component for data tables using @tanstack/react-table.
   *
   * @example
   * ```tsx
   * <DataTablePagination table={table} pageSizeOptions={[10, 20, 50]} />
   * ```
   */
  function DataTablePagination<TData>({
    table,
    pageSizeOptions = [10, 20, 30, 40, 50],
    showSelectedCount = true,
    className,
  }: DataTablePaginationProps<TData>) {
    return (
      <div className={`flex items-center justify-between px-2 ${className || ''}`}>
        <div className="flex-1 text-sm text-muted-foreground">
          {showSelectedCount && (
            <>
              {table.getFilteredSelectedRowModel().rows.length} of{' '}
              {table.getFilteredRowModel().rows.length} row(s) selected.
            </>
          )}
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <select
              value={`${table.getState().pagination.pageSize}`}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="h-8 w-[70px] rounded-md border border-input bg-background px-2 text-sm"
            >
              {pageSizeOptions.map((pageSize) => (
                <option key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return DataTablePagination;
}

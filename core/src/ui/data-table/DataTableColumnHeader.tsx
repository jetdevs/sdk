'use client';

import type { Column } from '@tanstack/react-table';
import * as React from 'react';
import { getAlignHeaderClass } from './column-meta';

// =============================================================================
// UI COMPONENT TYPES
// =============================================================================

/**
 * UI components that must be injected to create a DataTableColumnHeader.
 */
export interface ColumnHeaderUIComponents {
  Button: React.ComponentType<{
    variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
    className?: string;
    onClick?: () => void;
    children?: React.ReactNode;
  }>;
  ArrowDownIcon: React.ComponentType<{ className?: string }>;
  ArrowUpIcon: React.ComponentType<{ className?: string }>;
  ChevronsUpDownIcon: React.ComponentType<{ className?: string }>;
}

// =============================================================================
// TYPES
// =============================================================================

export interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a DataTableColumnHeader component with injected UI dependencies.
 *
 * @param ui - UI components to use for rendering (Button, icons)
 * @returns A DataTableColumnHeader component
 *
 * @example
 * ```typescript
 * import { createDataTableColumnHeader } from '@jetdevs/core/ui/data-table';
 * import { Button } from '@/components/ui/button';
 * import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
 *
 * export const DataTableColumnHeader = createDataTableColumnHeader({
 *   Button,
 *   ArrowDownIcon: ArrowDown,
 *   ArrowUpIcon: ArrowUp,
 *   ChevronsUpDownIcon: ChevronsUpDown,
 * });
 * ```
 */
export function createDataTableColumnHeader(ui: ColumnHeaderUIComponents) {
  const { Button, ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } = ui;

  /**
   * A sortable column header component for data tables.
   *
   * @example
   * ```tsx
   * const columns = [
   *   {
   *     accessorKey: 'name',
   *     header: ({ column }) => (
   *       <DataTableColumnHeader column={column} title="Name" />
   *     ),
   *   },
   * ];
   * ```
   */
  function DataTableColumnHeader<TData, TValue>({
    column,
    title,
    className,
  }: DataTableColumnHeaderProps<TData, TValue>) {
    // Pull alignment from column meta (`meta.align: 'left' | 'center' | 'right'`).
    // For right-aligned columns we drop the negative left margin and push the
    // button to the right of the cell so the sort affordance hugs the value.
    const align = column.columnDef.meta?.align;
    const alignJustify = getAlignHeaderClass(align);

    if (!column.getCanSort()) {
      // Non-sortable: render a block element so `text-right` etc. flow from
      // the parent <th> className.
      return <span className={`block font-medium ${className || ''}`}>{title}</span>;
    }

    const sorted = column.getIsSorted();

    const buttonClass = [
      align === 'right' || align === 'center' ? '' : '-ml-3',
      'h-8 data-[state=open]:bg-accent',
      alignJustify,
      className || '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Button
        variant="ghost"
        className={buttonClass}
        onClick={() => column.toggleSorting(sorted === 'asc')}
      >
        <span className="mr-2 font-medium">{title}</span>
        {sorted === 'desc' ? (
          <ArrowDownIcon className="h-4 w-4" />
        ) : sorted === 'asc' ? (
          <ArrowUpIcon className="h-4 w-4" />
        ) : (
          <ChevronsUpDownIcon className="h-4 w-4 opacity-50" />
        )}
      </Button>
    );
  }

  return DataTableColumnHeader;
}

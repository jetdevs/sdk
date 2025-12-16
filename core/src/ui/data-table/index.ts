/**
 * Data Table Components - Factory Pattern
 *
 * This module provides factory functions to create data table components
 * with injected UI dependencies. Apps provide their own Shadcn or custom
 * UI components to the factories.
 *
 * @example
 * ```typescript
 * // In your app's components/data-table/index.ts
 * import { createBaseListTable, createDataTableColumnHeader, createDataTablePagination } from '@jetdevs/core/ui/data-table';
 * import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
 * import { Button } from '@/components/ui/button';
 * import { Input } from '@/components/ui/input';
 * import { DropdownMenu, ... } from '@/components/ui/dropdown-menu';
 * import { Search, RefreshCw, X, Columns3, ChevronLeft, ChevronRight, ... } from 'lucide-react';
 *
 * export const BaseListTable = createBaseListTable({
 *   Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
 *   Button, Input,
 *   DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
 *   DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
 *   SearchIcon: Search, RefreshIcon: RefreshCw, ClearIcon: X,
 *   ColumnsIcon: Columns3, ChevronLeftIcon: ChevronLeft, ChevronRightIcon: ChevronRight,
 *   ChevronsLeftIcon: ChevronsLeft, ChevronsRightIcon: ChevronsRight,
 * });
 *
 * export const DataTableColumnHeader = createDataTableColumnHeader({
 *   Button, ArrowDownIcon: ArrowDown, ArrowUpIcon: ArrowUp, ChevronsUpDownIcon: ChevronsUpDown,
 * });
 *
 * export const DataTablePagination = createDataTablePagination({
 *   Button, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon,
 * });
 * ```
 */

// Factory functions
export { createBaseListTable } from './BaseListTable';
export { createDataTableColumnHeader } from './DataTableColumnHeader';
export { createDataTablePagination } from './DataTablePagination';
export { createDataTableWithToolbar } from './DataTableWithToolbar';

// Type exports - UI component interfaces
export type { DataTableUIComponents } from './BaseListTable';
export type { ColumnHeaderUIComponents } from './DataTableColumnHeader';
export type { PaginationUIComponents } from './DataTablePagination';
export type { DataTableWithToolbarUIComponents } from './DataTableWithToolbar';

// Type exports - Props interfaces
export type {
    BaseListTableProps, ListToolbarProps,
    PaginationConfig, StatusOption
} from './BaseListTable';

export type { DataTableColumnHeaderProps } from './DataTableColumnHeader';
export type { DataTablePaginationProps } from './DataTablePagination';

// DataTableWithToolbar types
export type {
    BulkAction,
    DataTableWithToolbarConfig, DataTableWithToolbarFactoryConfig, DataTableWithToolbarProps, FilterColumnConfig, ToastInterface
} from './DataTableWithToolbar';


'use client';

import {
    ColumnDef,
    ColumnFiltersState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    RowSelectionState,
    SortingState,
    useReactTable,
    VisibilityState
} from '@tanstack/react-table';
import * as React from 'react';
import { useState } from 'react';

// =============================================================================
// SVG ICONS - Built-in to avoid lucide-react dependency in this component
// =============================================================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const SettingsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const ToggleLeftIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="12" x="2" y="6" rx="6" ry="6" />
    <circle cx="8" cy="12" r="2" />
  </svg>
);

const ToggleRightIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="12" x="2" y="6" rx="6" ry="6" />
    <circle cx="16" cy="12" r="2" />
  </svg>
);

const ChevronLeftIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ChevronsLeftIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m11 17-5-5 5-5" />
    <path d="m18 17-5-5 5-5" />
  </svg>
);

const ChevronsRightIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 17 5-5-5-5" />
    <path d="m13 17 5-5-5-5" />
  </svg>
);

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface ToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * UI components required for the DataTableWithToolbar
 */
export interface DataTableWithToolbarUIComponents {
  // Table components
  Table: React.ComponentType<React.HTMLAttributes<HTMLTableElement>>;
  TableHeader: React.ComponentType<React.HTMLAttributes<HTMLTableSectionElement>>;
  TableBody: React.ComponentType<React.HTMLAttributes<HTMLTableSectionElement>>;
  TableRow: React.ComponentType<React.HTMLAttributes<HTMLTableRowElement> & { 'data-state'?: string }>;
  TableHead: React.ComponentType<React.ThHTMLAttributes<HTMLTableCellElement>>;
  TableCell: React.ComponentType<React.TdHTMLAttributes<HTMLTableCellElement>>;

  // Form components
  Button: React.ComponentType<{
    variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
    asChild?: boolean;
  }>;
  Input: React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
  Badge: React.ComponentType<{
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
    className?: string;
    children?: React.ReactNode;
  }>;

  // Select components
  Select: React.ComponentType<{
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode
  }>;
  SelectTrigger: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  SelectValue: React.ComponentType<{ placeholder?: string }>;
  SelectContent: React.ComponentType<{ side?: 'top' | 'bottom'; children: React.ReactNode }>;
  SelectItem: React.ComponentType<{ value: string; children: React.ReactNode }>;

  // Dropdown components
  DropdownMenu: React.ComponentType<{ children: React.ReactNode }>;
  DropdownMenuTrigger: React.ComponentType<{ asChild?: boolean; children: React.ReactNode }>;
  DropdownMenuContent: React.ComponentType<{
    align?: 'start' | 'end' | 'center';
    className?: string;
    children: React.ReactNode;
  }>;
  DropdownMenuLabel: React.ComponentType<{ children: React.ReactNode }>;
  DropdownMenuSeparator: React.ComponentType<Record<string, never>>;
  DropdownMenuItem: React.ComponentType<{
    onClick?: () => void;
    children: React.ReactNode;
  }>;
  DropdownMenuCheckboxItem: React.ComponentType<{
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    className?: string;
    children: React.ReactNode;
  }>;

  // Toast
  toast: ToastInterface;
}

/**
 * Filter column configuration
 */
export interface FilterColumnConfig {
  columnId: string;
  label: string;
  options: Array<{ label: string; value: string }>;
}

/**
 * Bulk action configuration
 */
export interface BulkAction<TData> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'outline' | 'destructive';
  /** Return true if action should be disabled for this selection */
  isDisabled?: (selectedRows: TData[]) => boolean;
  /** Handler called when action is clicked */
  onAction: (selectedRows: TData[]) => void;
}

/**
 * Configuration for the DataTableWithToolbar factory
 */
export interface DataTableWithToolbarConfig<TData> {
  /** Entity name (used for export filenames and empty state) */
  entityName: string;
  /** Column filters configuration */
  filterColumns?: FilterColumnConfig[];
  /** Enable CSV/JSON export */
  enableExport?: boolean;
  /** Enable table density control */
  enableDensity?: boolean;
  /** Enable column visibility toggle */
  enableColumnVisibility?: boolean;
  /** Enable row selection */
  enableRowSelection?: boolean;
  /** Bulk actions (shown when rows are selected) */
  bulkActions?: BulkAction<TData>[];
  /** Custom render for bulk selection info */
  renderSelectionInfo?: (selectedRows: TData[]) => React.ReactNode;
  /** Page size options */
  pageSizeOptions?: number[];
  /** Default page size */
  defaultPageSize?: number;
  /** Initial column visibility state (e.g., { columnId: false } to hide a column by default) */
  initialColumnVisibility?: VisibilityState;
}

/**
 * Props for the created DataTableWithToolbar component
 */
export interface DataTableWithToolbarProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  isLoading?: boolean;
  onRefresh?: () => void;
  /** For rendering a bulk delete dialog or other external components */
  renderDialog?: (props: {
    selectedRows: TData[];
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
  }) => React.ReactNode;
}

/**
 * Factory config interface (combines config and UI dependencies)
 */
export interface DataTableWithToolbarFactoryConfig<TData> {
  config: DataTableWithToolbarConfig<TData>;
  ui: DataTableWithToolbarUIComponents;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a DataTableWithToolbar component.
 *
 * This creates a full-featured data table with:
 * - Global search with debounce
 * - Column-specific filters
 * - Column visibility toggle
 * - Table density control (compact/comfortable/spacious)
 * - CSV/JSON export
 * - Row selection
 * - Bulk actions bar
 * - Pagination with page size selection
 * - Loading skeleton
 *
 * @example
 * ```typescript
 * import { createDataTableWithToolbar } from '@jetdevs/core/ui/data-table';
 *
 * const RoleDataTable = createDataTableWithToolbar({
 *   config: {
 *     entityName: 'roles',
 *     filterColumns: [
 *       { columnId: 'isActive', label: 'Status', options: [...] },
 *       { columnId: 'isSystemRole', label: 'Type', options: [...] },
 *     ],
 *     enableExport: true,
 *     enableDensity: true,
 *     enableColumnVisibility: true,
 *     enableRowSelection: true,
 *     bulkActions: [
 *       { id: 'activate', label: 'Activate', onAction: (rows) => { ... } },
 *       { id: 'delete', label: 'Delete', variant: 'destructive', onAction: (rows) => { ... } },
 *     ],
 *   },
 *   ui: {
 *     Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
 *     Button, Input, Badge,
 *     Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
 *     DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
 *     DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuCheckboxItem,
 *     toast,
 *   },
 * });
 * ```
 */
export function createDataTableWithToolbar<TData>(
  factoryConfig: DataTableWithToolbarFactoryConfig<TData>
) {
  const { config, ui } = factoryConfig;
  const {
    entityName,
    filterColumns = [],
    enableExport = true,
    enableDensity = true,
    enableColumnVisibility = true,
    enableRowSelection = true,
    bulkActions = [],
    renderSelectionInfo,
    pageSizeOptions = [10, 20, 30, 40, 50],
    defaultPageSize = 10,
    initialColumnVisibility = {},
  } = config;

  const {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Button,
    Input,
    Badge,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    toast,
  } = ui;

  // =========================================================================
  // SKELETON COMPONENT
  // =========================================================================

  function TableSkeleton({ columnCount }: { columnCount: number }) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-10 w-64 bg-muted animate-pulse rounded-md" />
            {filterColumns.map((_, i) => (
              <div key={i} className="h-10 w-32 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="rounded-md border">
          <div className="p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 py-4">
                {Array.from({ length: columnCount }).map((_, j) => (
                  <div key={j} className="h-4 w-20 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN COMPONENT
  // =========================================================================

  function DataTableWithToolbar({
    data,
    columns,
    isLoading,
    onRefresh,
    renderDialog,
  }: DataTableWithToolbarProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility);
    const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogAction, setDialogAction] = useState<string | null>(null);

    const table = useReactTable({
      data,
      columns,
      state: {
        sorting,
        columnFilters,
        globalFilter,
        rowSelection,
        columnVisibility,
      },
      enableRowSelection,
      onRowSelectionChange: setRowSelection,
      onSortingChange: setSorting,
      onColumnFiltersChange: setColumnFilters,
      onGlobalFilterChange: setGlobalFilter,
      onColumnVisibilityChange: setColumnVisibility,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      initialState: {
        pagination: {
          pageSize: defaultPageSize,
        },
      },
    });

    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedData = selectedRows.map(row => row.original);
    const hasSelection = selectedRows.length > 0;

    // Export functions
    const exportToCSV = () => {
      const headers = table.getVisibleFlatColumns()
        .filter(col => col.id !== 'select' && col.id !== 'actions')
        .map(col => col.id);

      const csvData = table.getFilteredRowModel().rows.map(row => {
        const rowData: Record<string, unknown> = {};
        headers.forEach(header => {
          const cell = row.getValue(header);
          rowData[header] = typeof cell === 'object' ? JSON.stringify(cell) : cell;
        });
        return rowData;
      });

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${entityName}-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast.success(`${entityName} exported to CSV`);
    };

    const exportToJSON = () => {
      const exportData = table.getFilteredRowModel().rows.map(row => row.original);
      const jsonContent = JSON.stringify(exportData, null, 2);

      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${entityName}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();

      toast.success(`${entityName} exported to JSON`);
    };

    // Clear all filters
    const clearFilters = () => {
      setGlobalFilter('');
      setColumnFilters([]);
      table.resetColumnFilters();
    };

    const hasActiveFilters = globalFilter || columnFilters.length > 0;

    // Density classes
    const getDensityClasses = () => {
      switch (density) {
        case 'compact':
          return 'text-xs';
        case 'spacious':
          return 'text-base py-4';
        default:
          return 'text-sm py-2';
      }
    };

    // Handle bulk action click
    const handleBulkAction = (action: BulkAction<TData>) => {
      if (action.id === 'delete') {
        // For delete, use the dialog pattern
        setDialogAction(action.id);
        setDialogOpen(true);
      } else {
        // For other actions, call directly
        action.onAction(selectedData);
        setRowSelection({});
      }
    };

    const handleDialogConfirm = () => {
      const action = bulkActions.find(a => a.id === dialogAction);
      if (action) {
        action.onAction(selectedData);
      }
      setRowSelection({});
      setDialogOpen(false);
      setDialogAction(null);
    };

    const handleDialogClose = () => {
      setDialogOpen(false);
      setDialogAction(null);
    };

    if (isLoading) {
      return <TableSkeleton columnCount={columns.length} />;
    }

    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Search */}
            <div className="relative">
              <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${entityName}...`}
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(String(event.target.value))}
                className="pl-8 max-w-sm"
              />
            </div>

            {/* Column Filters */}
            {filterColumns.map((filterConfig) => (
              <Select
                key={filterConfig.columnId}
                value={(table.getColumn(filterConfig.columnId)?.getFilterValue() as string) ?? 'all'}
                onValueChange={(value) =>
                  table.getColumn(filterConfig.columnId)?.setFilterValue(
                    value === 'all' ? undefined : value === 'true' ? true : value === 'false' ? false : value
                  )
                }
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder={filterConfig.label} />
                </SelectTrigger>
                <SelectContent>
                  {filterConfig.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-2 lg:px-3"
              >
                <XIcon className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Results Count */}
            <div className="text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length} of {data.length} {entityName}
            </div>

            {/* Refresh */}
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-8 w-8 p-0"
              >
                <RefreshIcon className="h-4 w-4" />
              </Button>
            )}

            {/* Export */}
            {enableExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <DownloadIcon className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportToCSV}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToJSON}>
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Column Visibility & Density */}
            {(enableColumnVisibility || enableDensity) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <SettingsIcon className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  {enableColumnVisibility && (
                    <>
                      <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {table
                        .getAllColumns()
                        .filter(
                          (column) =>
                            typeof column.accessorFn !== 'undefined' && column.getCanHide()
                        )
                        .map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize"
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                          >
                            {column.id}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </>
                  )}
                  {enableDensity && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Table Density</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setDensity('compact')}>
                        {density === 'compact' && '* '}Compact
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDensity('comfortable')}>
                        {density === 'comfortable' && '* '}Comfortable
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDensity('spacious')}>
                        {density === 'spacious' && '* '}Spacious
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {hasSelection && bulkActions.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">
                {selectedRows.length} selected
              </Badge>
              {renderSelectionInfo ? (
                renderSelectionInfo(selectedData)
              ) : null}
            </div>
            <div className="flex items-center space-x-2">
              {bulkActions.map((action) => {
                const isDisabled = action.isDisabled?.(selectedData) ?? false;
                return (
                  <Button
                    key={action.id}
                    variant={action.variant || 'outline'}
                    size="sm"
                    onClick={() => handleBulkAction(action)}
                    disabled={isDisabled}
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRowSelection({})}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className={getDensityClasses()}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={getDensityClasses()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={getDensityClasses()}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No {entityName} found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={String(table.getState().pagination.pageSize)} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-6 lg:space-x-8">
            <div className="flex w-[100px] items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
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

        {/* External Dialog (e.g., for bulk delete confirmation) */}
        {renderDialog && renderDialog({
          selectedRows: selectedData,
          isOpen: dialogOpen,
          onClose: handleDialogClose,
          onConfirm: handleDialogConfirm,
        })}
      </div>
    );
  }

  return DataTableWithToolbar;
}

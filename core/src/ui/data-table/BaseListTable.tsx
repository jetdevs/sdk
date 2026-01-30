'use client';

import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
    VisibilityState,
} from '@tanstack/react-table';
import * as React from 'react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib';

// =============================================================================
// UI COMPONENT TYPES - Types for injected UI components
// =============================================================================

/**
 * UI components that must be injected to create a BaseListTable.
 * Apps provide their own Shadcn or custom UI components.
 */
export interface DataTableUIComponents {
  // Table components
  Table: React.ComponentType<React.HTMLAttributes<HTMLTableElement>>;
  TableHeader: React.ComponentType<React.HTMLAttributes<HTMLTableSectionElement>>;
  TableBody: React.ComponentType<React.HTMLAttributes<HTMLTableSectionElement>>;
  TableRow: React.ComponentType<React.HTMLAttributes<HTMLTableRowElement> & { 'data-state'?: string }>;
  TableHead: React.ComponentType<React.ThHTMLAttributes<HTMLTableCellElement>>;
  TableCell: React.ComponentType<React.TdHTMLAttributes<HTMLTableCellElement>>;

  // Form/Input components
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
  DropdownMenuCheckboxItem: React.ComponentType<{
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    className?: string;
    children: React.ReactNode;
  }>;

  // Icons - can be any component that renders an icon
  SearchIcon: React.ComponentType<{ className?: string }>;
  RefreshIcon: React.ComponentType<{ className?: string }>;
  ClearIcon: React.ComponentType<{ className?: string }>;
  ColumnsIcon: React.ComponentType<{ className?: string }>;
  ChevronLeftIcon: React.ComponentType<{ className?: string }>;
  ChevronRightIcon: React.ComponentType<{ className?: string }>;
  ChevronsLeftIcon: React.ComponentType<{ className?: string }>;
  ChevronsRightIcon: React.ComponentType<{ className?: string }>;
}

// =============================================================================
// DATA TABLE TYPES
// =============================================================================

export type StatusOption = { label: string; value: string };

export interface ListToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  statusFilter?: {
    value: string;
    onChange: (value: string) => void;
    options: StatusOption[];
  };
  rightContent?: React.ReactNode;
  onRefresh?: () => void;
  resultLabel?: string;
  columnVisibilityControl?: React.ReactNode;
  layout?: 'single-row' | 'two-row';
}

export interface PaginationConfig {
  pageIndex: number;
  pageSize: number;
  totalCount?: number;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export interface BaseListTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  isLoading?: boolean;
  search?: ListToolbarProps['search'];
  statusFilter?: ListToolbarProps['statusFilter'];
  onRefresh?: () => void;
  resultLabel?: string;
  rightContent?: React.ReactNode;
  emptyState?: { title: string; subtitle?: string; icon?: React.ReactNode };
  density?: 'compact' | 'comfortable' | 'spacious';
  pagination?: PaginationConfig;
  enableColumnVisibility?: boolean;
  defaultVisibleColumns?: string[];
  getRowProps?: (row: TData) => React.HTMLAttributes<HTMLTableRowElement>;
  toolbarLayout?: 'single-row' | 'two-row';
  enableStickyActions?: boolean;
  /** Custom select component for status filter (apps can pass their own styled Select) */
  SelectComponent?: React.ComponentType<{
    value: string;
    onValueChange: (value: string) => void;
    options: StatusOption[];
    placeholder?: string;
    className?: string;
  }>;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a BaseListTable component with injected UI dependencies.
 *
 * @param ui - UI components to use for rendering (Table, Button, Input, etc.)
 * @returns A BaseListTable component
 *
 * @example
 * ```typescript
 * import { createBaseListTable } from '@jetdevs/core/ui/data-table';
 * import {
 *   Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
 * } from '@/components/ui/table';
 * import { Button } from '@/components/ui/button';
 * import { Input } from '@/components/ui/input';
 * import {
 *   DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
 *   DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
 * } from '@/components/ui/dropdown-menu';
 * import { Search, RefreshCw, X, Columns3, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
 *
 * export const BaseListTable = createBaseListTable({
 *   Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
 *   Button, Input,
 *   DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
 *   DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
 *   SearchIcon: Search,
 *   RefreshIcon: RefreshCw,
 *   ClearIcon: X,
 *   ColumnsIcon: Columns3,
 *   ChevronLeftIcon: ChevronLeft,
 *   ChevronRightIcon: ChevronRight,
 *   ChevronsLeftIcon: ChevronsLeft,
 *   ChevronsRightIcon: ChevronsRight,
 * });
 * ```
 */
export function createBaseListTable(ui: DataTableUIComponents) {
  const {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Button,
    Input,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
    SearchIcon,
    RefreshIcon,
    ClearIcon,
    ColumnsIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsLeftIcon,
    ChevronsRightIcon,
  } = ui;

  // =============================================================================
  // LIST TOOLBAR COMPONENT
  // =============================================================================

  function ListToolbar({
    search,
    statusFilter,
    rightContent,
    onRefresh,
    resultLabel,
    columnVisibilityControl,
    layout = 'single-row',
    SelectComponent,
  }: ListToolbarProps & {
    SelectComponent?: BaseListTableProps<unknown>['SelectComponent'];
  }) {
    const showClear = !!(search?.value || (statusFilter && statusFilter.value && statusFilter.value !== 'all'));

    // Render status filter - use custom SelectComponent if provided, otherwise use native select
    const renderStatusFilter = () => {
      if (!statusFilter) return null;

      if (SelectComponent) {
        return (
          <SelectComponent
            value={statusFilter.value}
            onValueChange={statusFilter.onChange}
            options={statusFilter.options}
            placeholder="Status"
            className="w-[140px]"
          />
        );
      }

      // Fallback to native select for portability
      return (
        <select
          value={statusFilter.value}
          onChange={(e) => statusFilter.onChange(e.target.value)}
          className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
        >
          {statusFilter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    };

    if (layout === 'two-row') {
      return (
        <div className="sticky top-0.5 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 pb-3 mb-3 -mx-6 px-6 space-y-3">
          {/* Row 1: Filters */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {search && (
                <div className="relative">
                  <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search.value}
                    onChange={(e) => search.onChange(e.target.value)}
                    placeholder={search.placeholder || 'Search...'}
                    className="pl-8 w-80 bg-background border"
                  />
                </div>
              )}
              {renderStatusFilter()}
              {showClear && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    search?.onChange('');
                    statusFilter?.onChange('all');
                  }}
                  className="h-8 px-2"
                >
                  <ClearIcon className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
          </div>

          {/* Row 2: Actions */}
          <div className="flex items-center justify-between gap-2">
            {resultLabel && <div className="text-sm text-muted-foreground">{resultLabel}</div>}
            <div className="flex items-center gap-2">
              {columnVisibilityControl}
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 w-8 p-0">
                  <RefreshIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Single-row layout (default)
    return (
      <div className="sticky top-0.5 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 flex items-center justify-between pb-3 mb-3 -mx-6 px-6">
        <div className="flex items-center gap-2">
          {search && (
            <div className="relative">
              <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder || 'Search...'}
                className="pl-8 w-80 bg-background border"
              />
            </div>
          )}
          {renderStatusFilter()}
          {showClear && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                search?.onChange('');
                statusFilter?.onChange('all');
              }}
              className="h-8 px-2"
            >
              <ClearIcon className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {resultLabel && <div className="text-sm text-muted-foreground hidden md:block">{resultLabel}</div>}
          {columnVisibilityControl}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 w-8 p-0">
              <RefreshIcon className="h-4 w-4" />
            </Button>
          )}
          {rightContent}
        </div>
      </div>
    );
  }

  // =============================================================================
  // BASE LIST TABLE COMPONENT
  // =============================================================================

  /**
   * A feature-rich, reusable data table component.
   *
   * Features:
   * - Search and filter toolbar
   * - Column visibility control
   * - Sorting
   * - Pagination
   * - Loading states
   * - Empty states
   * - Sticky columns
   * - Density options
   *
   * @example
   * ```tsx
   * <BaseListTable
   *   data={users}
   *   columns={columns}
   *   search={{ value: search, onChange: setSearch, placeholder: "Search users..." }}
   *   pagination={{ pageIndex, pageSize, totalCount, onPageChange, onPageSizeChange }}
   *   emptyState={{ title: "No users found" }}
   * />
   * ```
   */
  function BaseListTable<TData>({
    data,
    columns,
    isLoading,
    search,
    statusFilter,
    onRefresh,
    resultLabel,
    rightContent,
    emptyState,
    density = 'comfortable',
    pagination,
    enableColumnVisibility = true,
    defaultVisibleColumns,
    getRowProps,
    toolbarLayout = 'single-row',
    enableStickyActions = true,
    SelectComponent,
  }: BaseListTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
      if (!defaultVisibleColumns) return {};

      const visibility: VisibilityState = {};
      columns.forEach((col) => {
        if ('id' in col && col.id) {
          visibility[col.id] = defaultVisibleColumns.includes(col.id);
        } else if ('accessorKey' in col && typeof col.accessorKey === 'string') {
          visibility[col.accessorKey] = defaultVisibleColumns.includes(col.accessorKey);
        }
      });
      return visibility;
    });

    // Horizontal scroll detection - use a simple ref approach
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });

    React.useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const updateScrollState = () => {
        setScrollState({
          canScrollLeft: el.scrollLeft > 0,
          canScrollRight: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
        });
      };

      updateScrollState();
      el.addEventListener('scroll', updateScrollState);
      window.addEventListener('resize', updateScrollState);

      return () => {
        el.removeEventListener('scroll', updateScrollState);
        window.removeEventListener('resize', updateScrollState);
      };
    }, [data]);

    const table = useReactTable({
      data,
      columns,
      state: {
        sorting,
        columnVisibility,
        ...(pagination && {
          pagination: {
            pageIndex: pagination.pageIndex,
            pageSize: pagination.pageSize,
          },
        }),
      },
      onSortingChange: setSorting,
      onColumnVisibilityChange: setColumnVisibility,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
      manualPagination: pagination?.onPageChange !== undefined,
      pageCount: pagination?.totalCount ? Math.ceil(pagination.totalCount / pagination.pageSize) : undefined,
    });

    const densityClasses = useMemo(() => {
      switch (density) {
        case 'compact':
          return 'text-xs';
        case 'spacious':
          return 'text-base py-4';
        default:
          return 'text-sm py-2';
      }
    }, [density]);

    // Column visibility dropdown
    const columnVisibilityDropdown = enableColumnVisibility ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <ColumnsIcon className="h-4 w-4 mr-2" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => {
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id.replace(/_/g, ' ')}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

    // Determine if the first and last columns should be sticky
    const headerGroup = table.getHeaderGroups()[0];
    const lastColumnIndex = headerGroup ? headerGroup.headers.length - 1 : -1;
    const shouldUseStickyActions = enableStickyActions && lastColumnIndex >= 0;

    return (
      <div className="space-y-3">
        <ListToolbar
          search={search}
          statusFilter={statusFilter}
          onRefresh={onRefresh}
          rightContent={rightContent}
          resultLabel={resultLabel}
          columnVisibilityControl={columnVisibilityDropdown}
          layout={toolbarLayout}
          SelectComponent={SelectComponent}
        />

        <div className="rounded-md border relative">
          {/* Left scroll indicator */}
          {shouldUseStickyActions && scrollState.canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
          )}

          {/* Right scroll indicator */}
          {shouldUseStickyActions && scrollState.canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
          )}

          <div ref={scrollRef} className="overflow-x-auto" style={{ scrollBehavior: 'smooth' }}>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hGroup) => (
                  <TableRow key={hGroup.id}>
                    {hGroup.headers.map((header, index) => {
                      const isFirstColumn = shouldUseStickyActions && index === 0;
                      const isLastColumn = shouldUseStickyActions && index === lastColumnIndex;
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            densityClasses,
                            isFirstColumn && 'sticky left-0 bg-background shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)] z-20',
                            isLastColumn && 'sticky right-0 bg-background shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.1)] z-20'
                          )}
                        >
                          {header.isPlaceholder ? null : (flexRender(header.column.columnDef.header, header.getContext()) as React.ReactNode)}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(pagination?.pageSize || 5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={columns.length} className="h-12">
                        <div className="h-3 w-full bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => {
                    const rowProps = getRowProps ? getRowProps(row.original) : {};
                    return (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        className={densityClasses}
                        {...rowProps}
                      >
                        {row.getVisibleCells().map((cell, index) => {
                          const isFirstColumn = shouldUseStickyActions && index === 0;
                          const isLastColumn = shouldUseStickyActions && index === lastColumnIndex;
                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                densityClasses,
                                isFirstColumn &&
                                  'sticky left-0 bg-background shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)] z-20',
                                isLastColumn &&
                                  'sticky right-0 bg-background shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.1)] z-20'
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext()) as React.ReactNode}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      {emptyState ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          {emptyState.icon}
                          <div className="font-medium text-foreground">{emptyState.title}</div>
                          {emptyState.subtitle && <div className="text-sm">{emptyState.subtitle}</div>}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No items found.</div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination Controls */}
        {pagination && (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {pagination.totalCount !== undefined ? (
                  <>
                    Showing {Math.min(pagination.pageIndex * pagination.pageSize + 1, pagination.totalCount)} to{' '}
                    {Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.totalCount)} of{' '}
                    {pagination.totalCount} results
                  </>
                ) : (
                  <>Page {pagination.pageIndex + 1}</>
                )}
              </p>
              {pagination.onPageSizeChange && (
                <select
                  value={String(pagination.pageSize)}
                  onChange={(e) => pagination.onPageSizeChange!(Number(e.target.value))}
                  className="h-8 w-[100px] rounded-md border border-input bg-background px-2 text-sm"
                >
                  {(pagination.pageSizeOptions || [10, 20, 50, 100]).map((size) => (
                    <option key={size} value={String(size)}>
                      {size} rows
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange?.(0)}
                disabled={pagination.pageIndex === 0 || !pagination.onPageChange}
                className="h-8 w-8 p-0"
              >
                <ChevronsLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange?.(pagination.pageIndex - 1)}
                disabled={pagination.pageIndex === 0 || !pagination.onPageChange}
                className="h-8 w-8 p-0"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1">
                <span className="text-sm">
                  Page {pagination.pageIndex + 1}
                  {pagination.totalCount !== undefined && ` of ${Math.ceil(pagination.totalCount / pagination.pageSize)}`}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange?.(pagination.pageIndex + 1)}
                disabled={
                  !pagination.onPageChange ||
                  (pagination.totalCount !== undefined &&
                    pagination.pageIndex >= Math.ceil(pagination.totalCount / pagination.pageSize) - 1)
                }
                className="h-8 w-8 p-0"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  pagination.onPageChange?.(
                    pagination.totalCount
                      ? Math.ceil(pagination.totalCount / pagination.pageSize) - 1
                      : pagination.pageIndex + 1
                  )
                }
                disabled={
                  !pagination.onPageChange ||
                  (pagination.totalCount !== undefined &&
                    pagination.pageIndex >= Math.ceil(pagination.totalCount / pagination.pageSize) - 1)
                }
                className="h-8 w-8 p-0"
              >
                <ChevronsRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return BaseListTable;
}

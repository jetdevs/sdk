'use client';

/**
 * The standard list toolbar — ONE fixed shape for every list page.
 *
 *   [ chips: All · <status> · <status> ]                       (only with 2+ choices)
 *   [ 🔍 Search <things>…                        ⚲ ]   [⫼ Columns] [≣ ▦]
 *     ⚲ only with filters · ⫼ only with hideable columns (icon-only on phones)
 *     · ≣▦ only with a grid view, desktop
 *
 * What is deliberately NOT here (and cannot be added per page): a refresh
 * button, separate filter selects, an item count. Extra filters (source,
 * space, type…) go INSIDE the search box's filter menu. The page-size select
 * stays in the table footer. Columns are HIDDEN, never deleted: the Columns
 * menu brings back any column the page hides by default.
 *
 * Opt-in: `BaseListTable` / `DataTableWithToolbar` render this only when the
 * consumer passes `standardToolbar`; without it their toolbars are unchanged.
 *
 * Brand-agnostic and theme-token only (`bg-muted`, `text-foreground`,
 * `ring-ring`…) — every app's theme recolours it. All user-facing words come
 * in through props (English defaults) so apps translate them.
 */

import * as React from 'react';
import { cn } from '../../lib';
import type { Column, Table } from '@tanstack/react-table';
import { FilterIcon, getColumnLabel } from './mobile';
import { useCoreLabels } from '../labels';
import type { StatusOption } from './BaseListTable';

// =============================================================================
// TYPES
// =============================================================================

/** One group in the search box's filter menu (e.g. "Source": All · Yours · Built-in). */
export interface StandardToolbarFilter {
  id: string;
  /** Group heading in the menu (shown when there are 2+ groups). */
  label: string;
  value: string;
  options: StatusOption[];
  onChange: (value: string) => void;
  /** The option that means "no filter". Default `'all'`. */
  emptyValue?: string;
}

/** The chip row — the list's statuses (or its one primary facet). */
export interface StandardToolbarChips {
  value: string;
  onChange: (value: string) => void;
  /** Include the "All" option first. The row hides itself with < 2 real choices. */
  options: StatusOption[];
  /** Accessible name of the row (e.g. "Filter by status"). */
  label?: string;
  /** The option that means "no filter". Default `'all'`. */
  emptyValue?: string;
}

export type StandardToolbarView = 'list' | 'grid';

/** One entry in the Columns menu. The list tables build these from their column visibility. */
export interface StandardToolbarColumn {
  id: string;
  label: string;
  visible: boolean;
  onToggle: (visible: boolean) => void;
}

export interface StandardToolbarConfig {
  search?: {
    value: string;
    onChange: (value: string) => void;
    /** "Search <things>…" */
    placeholder?: string;
  };
  /** Filter groups, drawn as ONE menu inside the search box. */
  filters?: StandardToolbarFilter[];
  /** Accessible name of the in-box filter button. Default "Filters". */
  filterLabel?: string;
  chips?: StandardToolbarChips;
  /** List / grid toggle (desktop only). Pass only where a grid view exists. */
  view?: {
    value: StandardToolbarView;
    onChange: (value: StandardToolbarView) => void;
    listLabel?: string;
    gridLabel?: string;
  };
  /**
   * The Columns menu (show / hide columns). `BaseListTable` and
   * `DataTableWithToolbar` fill this from the table's hideable columns unless
   * `enableColumnVisibility` is false; pass `false` to turn it off for one page.
   * Hidden when there is nothing to toggle.
   */
  columns?: StandardToolbarColumn[] | false;
  /** Button text / accessible name of the Columns menu. Default "Columns". */
  columnsLabel?: string;
  /** Prefix for data-testids (`<id>-search`, `<id>-filter`, `<id>-chips`, `<id>-columns`). */
  testId?: string;
}

/** Injected menu primitives (the same ones the table factories already take). */
export interface StandardToolbarUIComponents {
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
  SearchIcon?: React.ComponentType<{ className?: string }>;
}

// =============================================================================
// HELPERS (exported for tests)
// =============================================================================

/** Chips show only when there are at least two real (non-"All") choices. */
export function shouldShowChips(chips: StandardToolbarChips | undefined): boolean {
  if (!chips) return false;
  const empty = chips.emptyValue ?? 'all';
  return chips.options.filter((o) => o.value !== empty).length >= 2;
}

/** True when any in-box filter is set to something other than its empty value. */
export function hasActiveFilter(filters: StandardToolbarFilter[] | undefined): boolean {
  return !!filters?.some((f) => f.value !== (f.emptyValue ?? 'all'));
}

/**
 * The Columns-menu entries for a TanStack table: every column that can hide and
 * is a real field (has an accessor or a `meta.label`) — so selection / actions
 * columns never show up. Labels: `meta.label` → string header → humanized id.
 */
export function getToolbarColumns<TData>(
  table: Table<TData>,
  headerLabels?: Record<string, string>,
): StandardToolbarColumn[] {
  return table
    .getAllLeafColumns()
    .filter(
      (column: Column<TData, unknown>) =>
        column.getCanHide() &&
        (typeof column.accessorFn !== 'undefined' || !!column.columnDef.meta?.label),
    )
    .map((column) => ({
      id: column.id,
      label: getColumnLabel(column, headerLabels),
      visible: column.getIsVisible(),
      onToggle: (visible: boolean) => column.toggleVisibility(visible),
    }));
}

// =============================================================================
// ICONS — inline so core needs no icon library
// =============================================================================

const DefaultSearchIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const ListIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M3 12h.01" /><path d="M3 18h.01" /><path d="M3 6h.01" />
    <path d="M8 12h13" /><path d="M8 18h13" /><path d="M8 6h13" />
  </svg>
);

const GridIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

const ColumnsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" />
  </svg>
);

// =============================================================================
// FACTORY
// =============================================================================

export function createStandardListToolbar(ui: StandardToolbarUIComponents) {
  const {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
  } = ui;
  const SearchIcon = ui.SearchIcon ?? DefaultSearchIcon;

  function StandardListToolbar({
    search,
    filters,
    filterLabel: filterLabelProp,
    chips,
    view,
    columns,
    columnsLabel: columnsLabelProp,
    testId,
  }: StandardToolbarConfig) {
    const labels = useCoreLabels();
    const filterLabel = filterLabelProp ?? labels.common.filters;
    const columnsLabel = columnsLabelProp ?? labels.common.columns;
    const hasFilters = !!filters && filters.some((f) => f.options.length > 0);
    const filterOn = hasActiveFilter(filters);
    const showChips = shouldShowChips(chips);
    const id = (part: string) => (testId ? `${testId}-${part}` : `list-${part}`);

    const chipRow = showChips && chips ? (
      <div className="no-scrollbar min-w-0 overflow-x-auto" data-testid={id('chips')}>
        <div className="flex w-max items-center gap-1" role="toolbar" aria-label={chips.label}>
          {chips.options.map((opt) => {
            const active = chips.value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                data-state={active ? 'on' : 'off'}
                onClick={() => chips.onChange(opt.value)}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors max-md:h-8',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-foreground/[0.12] text-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

    const searchBox = search ? (
      <div className="relative w-full min-w-0 md:w-80" data-testid={id('search')}>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder ?? labels.standardToolbar.searchPlaceholder}
          aria-label={search.placeholder ?? labels.standardToolbar.searchLabel}
          className={cn(
            'h-9 w-full rounded-lg bg-muted pl-9 text-sm text-foreground placeholder:text-muted-foreground',
            'focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            hasFilters ? 'pr-10' : 'pr-3',
          )}
        />
        {hasFilters && filters && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:bg-accent',
                  filterOn ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={filterLabel}
                data-active={filterOn ? 'true' : 'false'}
                data-testid={id('filter')}
              >
                <FilterIcon className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {filters.map((group, gi) => (
                <React.Fragment key={group.id}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  {filters.length > 1 && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
                  {group.options.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={group.value === opt.value}
                      onCheckedChange={() => group.onChange(opt.value)}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    ) : null;

    const columnsMenu = columns && columns.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm text-muted-foreground transition-colors md:w-auto md:px-2.5',
              'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            aria-label={columnsLabel}
            data-testid={id('columns')}
          >
            <ColumnsIcon className="h-4 w-4" />
            <span className="hidden md:inline">{columnsLabel}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
          <DropdownMenuLabel>{columnsLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((col) => (
            <DropdownMenuCheckboxItem key={col.id} checked={col.visible} onCheckedChange={(v) => col.onToggle(!!v)}>
              {col.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

    const viewToggle = view ? (
      <div className="hidden shrink-0 rounded-md bg-muted p-0.5 md:flex" data-testid="list-view-toggle">
        {(
          [
            ['list', view.listLabel ?? labels.standardToolbar.listView, ListIcon],
            ['grid', view.gridLabel ?? labels.standardToolbar.gridView, GridIcon],
          ] as const
        ).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            className={cn(
              'rounded-md p-1.5 transition-colors',
              view.value === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => view.onChange(mode)}
            aria-label={label}
            aria-pressed={view.value === mode}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    ) : null;

    if (!chipRow && !searchBox && !viewToggle && !columnsMenu) return null;

    return (
      <div className="space-y-3" data-slot="standard-list-toolbar" data-testid="list-toolbar">
        {chipRow}
        {(searchBox || viewToggle || columnsMenu) && (
          <div className="flex items-center gap-3">
            {searchBox}
            {(columnsMenu || viewToggle) && (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {columnsMenu}
                {viewToggle}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return StandardListToolbar;
}


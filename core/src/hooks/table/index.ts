/**
 * Table Hooks Module
 *
 * React hooks for table state management.
 */

// =============================================================================
// INDIVIDUAL HOOKS
// =============================================================================

export { useTable } from './useTable';
export type { SortingState, UseTableProps, UseTableReturn } from './useTable';

export { useTableSelection } from './useTableSelection';
export type {
  UseTableSelectionProps,
  UseTableSelectionReturn,
} from './useTableSelection';

export { useTableFilter } from './useTableFilter';
export type { UseTableFilterProps, UseTableFilterReturn } from './useTableFilter';

export { useTableSearch } from './useTableSearch';
export type { UseTableSearchProps, UseTableSearchReturn } from './useTableSearch';

export { useTableVisibility } from './useTableVisibility';
export type {
  UseTableVisibilityProps,
  UseTableVisibilityReturn,
} from './useTableVisibility';

export { useTableExport } from './useTableExport';
export type { UseTableExportProps, UseTableExportReturn } from './useTableExport';

export { useTableSort } from './useTableSort';
export type {
  SortDirection,
  SortConfig,
  UseTableSortProps,
  UseTableSortReturn,
} from './useTableSort';

// =============================================================================
// COMPOSED HOOK
// =============================================================================

export { useTableState } from './useTableState';
export type { UseTableStateProps, UseTableStateReturn } from './useTableState';

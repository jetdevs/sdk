/**
 * React Hooks Module
 *
 * Shared React hooks for the core package.
 */

// =============================================================================
// AUTH HOOKS
// =============================================================================

export {
  // Factory functions for creating auth hooks
  createUseAuthSession,
  createUsePermission,
  createUsePermissions,
  createUseCurrentUser,
  // SSE utilities
  usePermissionSSE,
  createUsePermissionCheck,
  createUsePermissionConnectionStatus,
  // Auth utilities
  AuthUtils,
} from './auth';

export type {
  // Auth session types
  AuthSessionData,
  UseAuthSessionResult,
  UsePermissionsResult,
  UseCurrentUserResult,
  // Permission check types
  PermissionCheckOptions,
  SSEPermissionMessage,
  UsePermissionCheckResult,
} from './auth';

// =============================================================================
// UTILITY HOOKS
// =============================================================================

export {
  useIsClient,
  useModalState,
  useHorizontalScroll,
  useDebounce,
  useMediaQuery,
  BREAKPOINT_QUERIES,
  useViewToggle,
} from './utility';

export type {
  ModalState,
  UseModalStateReturn,
  ScrollState,
  UseHorizontalScrollReturn,
  ViewMode,
  UseViewToggleReturn,
} from './utility';

// =============================================================================
// TABLE HOOKS
// =============================================================================

export {
  // Individual hooks
  useTable,
  useTableSelection,
  useTableFilter,
  useTableSearch,
  useTableVisibility,
  useTableExport,
  useTableSort,
  // Composed hook
  useTableState,
} from './table';

export type {
  // Table types
  SortingState,
  UseTableProps,
  UseTableReturn,
  // Selection types
  UseTableSelectionProps,
  UseTableSelectionReturn,
  // Filter types
  UseTableFilterProps,
  UseTableFilterReturn,
  // Search types
  UseTableSearchProps,
  UseTableSearchReturn,
  // Visibility types
  UseTableVisibilityProps,
  UseTableVisibilityReturn,
  // Export types
  UseTableExportProps,
  UseTableExportReturn,
  // Sort types
  SortDirection,
  SortConfig,
  UseTableSortProps,
  UseTableSortReturn,
  // Composed state types
  UseTableStateProps,
  UseTableStateReturn,
} from './table';

'use client';

/**
 * Core UI labels — every user-facing word that @jetdevs/core renders itself.
 *
 * Core ships English defaults (byte-identical to the text it rendered before
 * labels existed). An app translates them by wrapping its tree once:
 *
 * ```tsx
 * import { CoreLabelsProvider } from '@jetdevs/core/ui/labels';
 *
 * <CoreLabelsProvider labels={{
 *   common: { cancel: t('cancel') },
 *   pagination: { pageOf: (page, total) => t('pageOf', { page, total }) },
 * }}>
 *   {children}
 * </CoreLabelsProvider>
 * ```
 *
 * Anything not provided falls back to English. Nested providers merge over
 * their parent. Without a provider, components render exactly as before.
 *
 * Interpolated text is a function so word order stays with the translation.
 *
 * The context lives on `globalThis` under a `Symbol.for` key: core builds each
 * entry point (`ui`, `ui/data-table`, `ui/admin`, `features/*`) as its own
 * bundle, so a module-level context would be a different object per entry and
 * a provider imported from one path would not reach components from another.
 */

import * as React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface CoreLabels {
  /** Words shared by several components. */
  common: {
    cancel: string;
    clear: string;
    done: string;
    close: string;
    next: string;
    back: string;
    /** Filters button (screen-reader text), filter sheet title, filter menu name. */
    filters: string;
    /** Status filter placeholder / sheet field (BaseListTable). */
    status: string;
    /** Columns button / menu (BaseListTable, standard toolbar). */
    columns: string;
    /** Accessible name of the background-refetch spinner. */
    loading: string;
    active: string;
    inactive: string;
    deleting: string;
  };
  /** DataTableWithToolbar. */
  dataTable: {
    searchPlaceholder: (entityName: string) => string;
    noResults: (entityName: string) => string;
    resultCount: (shown: number, total: number, entityName: string) => string;
    export: string;
    exportOptions: string;
    exportCsv: string;
    exportJson: string;
    view: string;
    toggleColumns: string;
    tableDensity: string;
    densityCompact: string;
    densityComfortable: string;
    densitySpacious: string;
    selected: (count: number) => string;
    clearSelection: string;
  };
  /** BaseListTable. */
  listTable: {
    searchPlaceholder: string;
    toggleColumns: string;
    noItems: string;
  };
  /** Pagination text of DataTableWithToolbar, BaseListTable and DataTablePagination. */
  pagination: {
    rowsPerPage: string;
    /** "Page 2 of 5" */
    pageOf: (page: number, pageCount: number) => string;
    /** "Page 2" (total unknown) */
    page: (page: number) => string;
    /** "Showing 11 to 20 of 42 results" */
    showing: (from: number, to: number, total: number) => string;
    /** Page-size option, "20 rows" */
    pageSizeOption: (size: number) => string;
    /** "3 of 42 row(s) selected." */
    rowsSelected: (selected: number, total: number) => string;
    firstPage: string;
    previousPage: string;
    nextPage: string;
    lastPage: string;
    /** Short screen-reader text on BaseListTable phone pager. */
    previousPageShort: string;
    nextPageShort: string;
  };
  /** StandardListToolbar defaults (props still win). */
  standardToolbar: {
    searchPlaceholder: string;
    searchLabel: string;
    listView: string;
    gridView: string;
  };
  /** OrgSwitcher (createOrgSwitcherFactory). */
  orgSwitcher: {
    title: string;
    searchPlaceholder: string;
    noResults: string;
    selectOrganization: string;
    organization: string;
    organizationWithId: (id: number) => string;
    switchFailed: string;
  };
  /** DeleteUserDialog (createDeleteUserDialogFactory). */
  deleteUser: {
    title: string;
    description: string;
    userDetails: string;
    name: string;
    email: string;
    status: string;
    created: string;
    activeRoleAssignments: string;
    roleImpact: (roleCount: number, orgCount: number) => string;
    moreRoles: (count: number) => string;
    warningLabel: string;
    warning: string;
    confirm: string;
    deleted: (userName: string) => string;
  };
  /** DeleteRoleDialog (RoleDialogs). */
  deleteRole: {
    title: string;
    systemRole: string;
    /** "Are you sure you want to delete the role" … "<name>" … "?" */
    confirmBefore: string;
    confirmAfter: string;
    systemRoleNote: string;
    cannotBeUndone: string;
    impactAssessment: string;
    usersAffected: string;
    permissions: string;
    userCount: (count: number) => string;
    permissionCount: (count: number) => string;
    usersAssigned: (count: number) => string;
    usersLosePermissions: string;
    whatHappens: string;
    consequences: string[];
    protectionTitle: string;
    protectionBody: string;
    cannotDelete: string;
    confirm: string;
    deleted: (roleName: string) => string;
    errorSystemRole: string;
    errorNotFound: string;
    errorInUse: string;
    errorGeneric: string;
  };
  /** BulkDeleteDialog (RoleDialogs). */
  bulkDeleteRoles: {
    title: string;
    description: (count: number) => string;
    systemRolesTitle: string;
    systemRolesSkipped: (count: number) => string;
    rolesToDelete: (count: number) => string;
    usersAffected: string;
    permissionsRemoved: string;
    noneDeletable: string;
    confirm: (count: number) => string;
  };
  /** CreateRoleDialog (RoleDialogs). */
  createRole: {
    title: string;
    description: string;
    stepBasic: string;
    stepReview: string;
    nameLabel: string;
    namePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    activeLabel: string;
    activeHint: string;
    reviewTitle: string;
    reviewName: string;
    reviewDescription: string;
    reviewStatus: string;
    noDescription: string;
    nextStepsTitle: string;
    nextSteps: string[];
    submit: string;
    errorNameRequired: string;
    errorNameTooShort: string;
    errorNameTooLong: string;
    errorNameInvalid: string;
    errorDescriptionTooLong: string;
    created: (roleName: string | undefined) => string;
    errorDuplicate: string;
    errorGeneric: string;
  };
}

/** Deep-partial: objects recurse; functions and arrays are replaced whole. */
export type CoreLabelsOverrides = {
  [K in keyof CoreLabels]?: {
    [P in keyof CoreLabels[K]]?: CoreLabels[K][P];
  };
};

// =============================================================================
// ENGLISH DEFAULTS
// =============================================================================

export const defaultCoreLabels: CoreLabels = {
  common: {
    cancel: 'Cancel',
    clear: 'Clear',
    done: 'Done',
    close: 'Close',
    next: 'Next',
    back: 'Back',
    filters: 'Filters',
    status: 'Status',
    columns: 'Columns',
    loading: 'Loading',
    active: 'Active',
    inactive: 'Inactive',
    deleting: 'Deleting...',
  },
  dataTable: {
    searchPlaceholder: (entityName) => `Search ${entityName}...`,
    noResults: (entityName) => `No ${entityName} found.`,
    resultCount: (shown, total, entityName) => `${shown} of ${total} ${entityName}`,
    export: 'Export',
    exportOptions: 'Export Options',
    exportCsv: 'Export as CSV',
    exportJson: 'Export as JSON',
    view: 'View',
    toggleColumns: 'Toggle Columns',
    tableDensity: 'Table Density',
    densityCompact: 'Compact',
    densityComfortable: 'Comfortable',
    densitySpacious: 'Spacious',
    selected: (count) => `${count} selected`,
    clearSelection: 'Clear Selection',
  },
  listTable: {
    searchPlaceholder: 'Search...',
    toggleColumns: 'Toggle columns',
    noItems: 'No items found.',
  },
  pagination: {
    rowsPerPage: 'Rows per page',
    pageOf: (page, pageCount) => `Page ${page} of ${pageCount}`,
    page: (page) => `Page ${page}`,
    showing: (from, to, total) => `Showing ${from} to ${to} of ${total} results`,
    pageSizeOption: (size) => `${size} rows`,
    rowsSelected: (selected, total) => `${selected} of ${total} row(s) selected.`,
    firstPage: 'Go to first page',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    lastPage: 'Go to last page',
    previousPageShort: 'Previous page',
    nextPageShort: 'Next page',
  },
  standardToolbar: {
    searchPlaceholder: 'Search…',
    searchLabel: 'Search',
    listView: 'List view',
    gridView: 'Grid view',
  },
  orgSwitcher: {
    title: 'Switch Organization',
    searchPlaceholder: 'Search...',
    noResults: 'No organizations found',
    selectOrganization: 'Select Organization',
    organization: 'Organization',
    organizationWithId: (id) => `Organization ${id}`,
    switchFailed: 'Failed to switch organization',
  },
  deleteUser: {
    title: 'Delete User',
    description:
      'This action cannot be undone. This will permanently delete the user account and remove all associated data.',
    userDetails: 'User Details',
    name: 'Name:',
    email: 'Email:',
    status: 'Status:',
    created: 'Created:',
    activeRoleAssignments: 'Active Role Assignments',
    roleImpact: (roleCount, orgCount) =>
      `This user has ${roleCount} active role assignment(s) across ${orgCount} org(s). Deleting this user will remove all role assignments.`,
    moreRoles: (count) => `... and ${count} more`,
    warningLabel: 'Warning:',
    warning:
      'This action is permanent and cannot be undone. The user will be completely removed from the system.',
    confirm: 'Delete User',
    deleted: (userName) => `User "${userName}" has been deleted successfully`,
  },
  deleteRole: {
    title: 'Delete Role',
    systemRole: 'System Role',
    confirmBefore: 'Are you sure you want to delete the role',
    confirmAfter: '?',
    systemRoleNote: 'System roles cannot be deleted as they are required for system functionality.',
    cannotBeUndone: 'This action cannot be undone.',
    impactAssessment: 'Impact Assessment',
    usersAffected: 'Users affected:',
    permissions: 'Permissions:',
    userCount: (count) => `${count} ${count === 1 ? 'user' : 'users'}`,
    permissionCount: (count) => `${count} ${count === 1 ? 'permission' : 'permissions'}`,
    usersAssigned: (count) =>
      `Warning: ${count} ${count === 1 ? 'user is' : 'users are'} currently assigned to this role.`,
    usersLosePermissions: 'These users will lose all permissions associated with this role.',
    whatHappens: 'What happens when you delete this role:',
    consequences: [
      'The role will be permanently deleted from the database',
      'Users will lose access to permissions from this role',
      'Role assignments will be removed',
      'This action cannot be undone',
    ],
    protectionTitle: 'System Role Protection',
    protectionBody:
      "This role is protected because it's essential for system functionality. System roles cannot be deleted to maintain platform integrity.",
    cannotDelete: 'Cannot Delete',
    confirm: 'Delete Role',
    deleted: (roleName) => `Role "${roleName}" has been deleted successfully`,
    errorSystemRole: 'Cannot delete system roles',
    errorNotFound: 'Role not found. It may have already been deleted.',
    errorInUse: 'Cannot delete role. Users are still assigned to this role.',
    errorGeneric: 'Failed to delete role. Please try again.',
  },
  bulkDeleteRoles: {
    title: 'Confirm Bulk Delete',
    description: (count) => `You are about to delete ${count} role(s). This action cannot be undone.`,
    systemRolesTitle: 'System Roles Cannot Be Deleted',
    systemRolesSkipped: (count) => `The following ${count} system role(s) will be skipped:`,
    rolesToDelete: (count) => `Roles to Delete (${count})`,
    usersAffected: 'Users Affected',
    permissionsRemoved: 'Permissions Removed',
    noneDeletable: 'No roles can be deleted. All selected roles are system roles.',
    confirm: (count) => `Delete ${count} Role(s)`,
  },
  createRole: {
    title: 'Create New Role',
    description: 'Create a new role to organize user permissions and access levels.',
    stepBasic: 'Basic Information',
    stepReview: 'Review & Create',
    nameLabel: 'Role Name *',
    namePlaceholder: 'e.g., Content Manager, Support Agent',
    descriptionLabel: 'Description',
    descriptionPlaceholder: "Describe the role's purpose and responsibilities...",
    activeLabel: 'Active Status',
    activeHint: 'Active roles can be assigned to users',
    reviewTitle: 'Review Role Details',
    reviewName: 'Name:',
    reviewDescription: 'Description:',
    reviewStatus: 'Status:',
    noDescription: 'No description provided',
    nextStepsTitle: 'Next Steps After Creation:',
    nextSteps: [
      'Assign permissions to define what this role can do',
      'Add users to this role to grant them access',
      'Configure role-specific settings as needed',
    ],
    submit: 'Create Role',
    errorNameRequired: 'Role name is required',
    errorNameTooShort: 'Role name must be at least 2 characters',
    errorNameTooLong: 'Role name must be less than 100 characters',
    errorNameInvalid: 'Role name can only contain letters, numbers, spaces, hyphens, and underscores',
    errorDescriptionTooLong: 'Description must be less than 500 characters',
    created: (roleName) => `Role "${roleName || 'New role'}" created successfully`,
    errorDuplicate: 'A role with this name already exists',
    errorGeneric: 'Failed to create role. Please try again.',
  },
};

// =============================================================================
// MERGE
// =============================================================================

/**
 * Merge overrides over a full label set. Only defined values win; unknown
 * sections/keys are ignored. Pure — never mutates `base`.
 */
export function mergeCoreLabels(base: CoreLabels, overrides?: CoreLabelsOverrides | null): CoreLabels {
  if (!overrides) return base;
  const out = { ...base } as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(overrides) as Array<keyof CoreLabels>) {
    const patch = overrides[section] as Record<string, unknown> | undefined;
    const current = base[section] as unknown as Record<string, unknown> | undefined;
    if (!patch || !current) continue;
    const merged: Record<string, unknown> = { ...current };
    for (const key of Object.keys(patch)) {
      if (!(key in current)) continue;
      const value = patch[key];
      if (value !== undefined && value !== null) merged[key] = value;
    }
    out[section] = merged;
  }
  return out as unknown as CoreLabels;
}

// =============================================================================
// CONTEXT (one instance across every core bundle)
// =============================================================================

const CONTEXT_KEY = Symbol.for('@jetdevs/core/core-labels-context');

function getSharedContext(): React.Context<CoreLabels> {
  const g = globalThis as unknown as Record<symbol, React.Context<CoreLabels> | undefined>;
  let ctx = g[CONTEXT_KEY];
  if (!ctx) {
    ctx = React.createContext<CoreLabels>(defaultCoreLabels);
    ctx.displayName = 'CoreLabelsContext';
    g[CONTEXT_KEY] = ctx;
  }
  return ctx;
}

const CoreLabelsContext = getSharedContext();

export interface CoreLabelsProviderProps {
  /** Partial labels; anything missing falls back to the parent / English. */
  labels?: CoreLabelsOverrides | null;
  children?: React.ReactNode;
}

export function CoreLabelsProvider({ labels, children }: CoreLabelsProviderProps) {
  const parent = React.useContext(CoreLabelsContext);
  const value = React.useMemo(() => mergeCoreLabels(parent, labels), [parent, labels]);
  return <CoreLabelsContext.Provider value={value}>{children}</CoreLabelsContext.Provider>;
}

/** Resolved labels for core components (English when no provider is mounted). */
export function useCoreLabels(): CoreLabels {
  return React.useContext(CoreLabelsContext);
}

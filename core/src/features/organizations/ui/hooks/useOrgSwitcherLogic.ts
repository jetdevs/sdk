"use client";

/**
 * Organization Switcher Logic Hook
 *
 * Provides stateful logic for organization switching UI components.
 * Handles search/filter functionality and organization selection.
 *
 * @module @jetdevs/core/features/organizations/ui/hooks
 *
 * @example
 * ```typescript
 * const logic = useOrgSwitcherLogic({
 *   currentOrgId: session.user.currentOrgId,
 *   organizations: userOrgs,
 *   onOrgSwitch: (orgId) => switchOrgMutation.mutateAsync({ orgId }),
 *   isLoading: isLoadingOrgs,
 * });
 * ```
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Organization data structure for the switcher
 * Named differently from users/OrgData to avoid conflicts
 */
export interface SwitcherOrgData {
  /** Organization ID */
  id: number;
  /** Organization display name */
  name: string;
  /** Organization URL slug */
  slug?: string;
  /** Custom domain if configured */
  customDomain?: string | null;
  /** Roles assigned to the user in this organization */
  roles?: string[];
  /** Count of roles in this organization */
  roleCount?: number;
}

/**
 * Configuration for useOrgSwitcherLogic hook
 */
export interface UseOrgSwitcherLogicConfig {
  /** Currently selected organization ID */
  currentOrgId: number | null;
  /** List of organizations the user has access to */
  organizations: SwitcherOrgData[];
  /** Callback when user switches organization */
  onOrgSwitch: (orgId: number) => void | Promise<void>;
  /** Whether organizations are being loaded */
  isLoading?: boolean;
  /** Whether the switch operation is in progress */
  isSwitching?: boolean;
  /** Whether to show only other organizations (exclude current) in filtered list */
  excludeCurrentFromFiltered?: boolean;
}

/**
 * Return type for useOrgSwitcherLogic hook
 */
export interface OrgSwitcherLogicReturn {
  /** Currently selected organization */
  currentOrg: SwitcherOrgData | undefined;
  /** All organizations */
  organizations: SwitcherOrgData[];
  /** Filtered organizations based on search query */
  filteredOrgs: SwitcherOrgData[];
  /** Whether organizations are loading */
  isLoading: boolean;
  /** Whether a switch operation is in progress */
  isSwitching: boolean;
  /** Current search query */
  searchQuery: string;
  /** Update search query */
  setSearchQuery: (query: string) => void;
  /** Handle organization switch */
  handleOrgSwitch: (orgId: number) => void;
  /** Whether there are multiple organizations to switch between */
  hasMultipleOrgs: boolean;
  /** Whether the dropdown should be shown (has orgs to switch to) */
  showDropdown: boolean;
  /** Clear search query */
  clearSearch: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for organization switcher logic
 *
 * Provides all stateful logic needed for an organization switcher component,
 * including search/filter functionality and selection handling.
 *
 * @param config - Configuration object
 * @returns Organization switcher state and actions
 *
 * @example
 * ```typescript
 * const {
 *   currentOrg,
 *   filteredOrgs,
 *   searchQuery,
 *   setSearchQuery,
 *   handleOrgSwitch,
 *   hasMultipleOrgs,
 * } = useOrgSwitcherLogic({
 *   currentOrgId: 1,
 *   organizations: [
 *     { id: 1, name: 'Org A' },
 *     { id: 2, name: 'Org B' },
 *   ],
 *   onOrgSwitch: async (orgId) => {
 *     await switchOrg(orgId);
 *   },
 * });
 * ```
 */
export function useOrgSwitcherLogic(
  config: UseOrgSwitcherLogicConfig
): OrgSwitcherLogicReturn {
  const {
    currentOrgId,
    organizations,
    onOrgSwitch,
    isLoading = false,
    isSwitching = false,
    excludeCurrentFromFiltered = true,
  } = config;

  const [searchQuery, setSearchQuery] = React.useState("");

  // Find current organization
  const currentOrg = React.useMemo(
    () => organizations.find((org) => org.id === currentOrgId),
    [organizations, currentOrgId]
  );

  // Filter organizations based on search query
  const filteredOrgs = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // Start with all orgs or exclude current based on config
    let orgs = excludeCurrentFromFiltered
      ? organizations.filter((org) => org.id !== currentOrgId)
      : organizations;

    // Apply search filter if query exists
    if (query) {
      orgs = orgs.filter(
        (org) =>
          org.name.toLowerCase().includes(query) ||
          org.slug?.toLowerCase().includes(query) ||
          org.customDomain?.toLowerCase().includes(query)
      );
    }

    // Sort alphabetically by name
    return orgs.sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, currentOrgId, searchQuery, excludeCurrentFromFiltered]);

  // Determine if there are multiple organizations
  const hasMultipleOrgs = organizations.length > 1;

  // Show dropdown if there are organizations to switch to
  const showDropdown = filteredOrgs.length > 0 || hasMultipleOrgs;

  // Handle organization switch
  const handleOrgSwitch = React.useCallback(
    (orgId: number) => {
      if (orgId === currentOrgId) return;
      onOrgSwitch(orgId);
    },
    [currentOrgId, onOrgSwitch]
  );

  // Clear search query
  const clearSearch = React.useCallback(() => {
    setSearchQuery("");
  }, []);

  return {
    currentOrg,
    organizations,
    filteredOrgs,
    isLoading,
    isSwitching,
    searchQuery,
    setSearchQuery,
    handleOrgSwitch,
    hasMultipleOrgs,
    showDropdown,
    clearSearch,
  };
}

"use client";

/**
 * Organization Switcher Factory
 *
 * Provides factory function for creating organization switcher components.
 * Apps create switcher components using the factory that accepts their tRPC client and UI components.
 *
 * @module @jetdevs/core/features/organizations/ui/factories
 *
 * @example
 * ```typescript
 * // Create org switcher component
 * import { createOrgSwitcherFactory } from '@jetdevs/core/features/organizations';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const OrgSwitcher = createOrgSwitcherFactory({
 *   api: {
 *     getUserOrganizations: api.userOrg.getUserOrganizations,
 *     switchOrg: api.userOrg.switchOrg,
 *   },
 *   ui: { ...UI, toast },
 *   hooks: {
 *     useSession: () => useSession(),
 *     useRouter: () => useRouter(),
 *   },
 * });
 * ```
 */

import * as React from "react";
import {
  useOrgSwitcherLogic,
  type SwitcherOrgData,
} from "../hooks/useOrgSwitcherLogic";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Toast interface for notifications
 */
export interface OrgSwitcherToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * UI components required for OrgSwitcher
 */
export interface OrgSwitcherUIComponents {
  /** Dropdown menu root */
  DropdownMenu: React.ComponentType<{ children: React.ReactNode }>;
  /** Dropdown trigger wrapper */
  DropdownMenuTrigger: React.ComponentType<{
    asChild?: boolean;
    children: React.ReactNode;
  }>;
  /** Dropdown content container */
  DropdownMenuContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dropdown menu item */
  DropdownMenuItem: React.ComponentType<{
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  /** Dropdown menu label */
  DropdownMenuLabel: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dropdown menu separator */
  DropdownMenuSeparator: React.ComponentType<{ className?: string }>;
  /** Button component */
  Button: React.ComponentType<{
    variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
    size?: "default" | "sm" | "lg" | "icon";
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
  }>;
  /** Input for search functionality (optional) */
  Input?: React.ComponentType<{
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    className?: string;
  }>;
  /** Toast notifications */
  toast: OrgSwitcherToastInterface;
}

/**
 * API interface for OrgSwitcher - injected by consuming app
 */
export interface OrgSwitcherApi {
  /** Query hook for getting user's organizations */
  getUserOrganizations: {
    useQuery: (
      input?: undefined,
      options?: { enabled?: boolean; staleTime?: number }
    ) => {
      data: SwitcherOrgData[] | undefined;
      isLoading: boolean;
    };
  };
  /** Mutation hook for switching organization */
  switchOrg: {
    useMutation: () => {
      mutateAsync: (input: { orgId: number }) => Promise<{
        success: boolean;
        org: { name: string };
        error?: string;
      }>;
      isPending: boolean;
    };
  };
  /** Utils for cache invalidation (optional) */
  useUtils?: () => {
    invalidate: () => Promise<void>;
  };
}

/**
 * Hooks interface for framework-specific functionality
 */
export interface OrgSwitcherHooks {
  /** Session hook - returns current user session */
  useSession: () => {
    data: {
      user?: {
        currentOrgId?: number | null;
        currentOrg?: { name: string } | null;
        roles?: Array<{ name: string }>;
      };
    } | null;
    update: () => Promise<unknown>;
  };
  /** Router hook for navigation */
  useRouter: () => {
    push: (path: string) => void;
    back: () => void;
  };
}

/**
 * Factory configuration for OrgSwitcher
 */
export interface OrgSwitcherFactoryConfig {
  /** API hooks for data fetching */
  api: OrgSwitcherApi;
  /** UI components */
  ui: OrgSwitcherUIComponents;
  /** Framework hooks */
  hooks: OrgSwitcherHooks;
  /** Function to check if role is a system role (optional) */
  isPlatformSystemRole?: (roleName: string) => boolean;
  /** Custom domain detection helper (optional) */
  isCustomDomainOrg?: (org: SwitcherOrgData) => boolean;
  /** Path to navigate after successful switch (default: '/dashboard') */
  redirectPath?: string;
  /** Whether to show search input for large org lists */
  showSearch?: boolean;
  /** Minimum orgs before showing search (default: 5) */
  searchThreshold?: number;
}

/**
 * Props for OrgSwitcher component
 */
export interface OrgSwitcherProps {
  /** Additional class name */
  className?: string;
  /** Callback after successful org switch */
  onSwitchSuccess?: (org: { id: number; name: string }) => void;
  /** Callback on switch error */
  onSwitchError?: (error: Error) => void;
}

// =============================================================================
// ICONS
// =============================================================================

const Building2Icon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </svg>
);

const ChevronDownIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const SearchIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const GlobeIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

// =============================================================================
// FACTORY IMPLEMENTATION
// =============================================================================

/**
 * Create an OrgSwitcher component
 *
 * @param config - Factory configuration with API, UI components, and hooks
 * @returns OrgSwitcher component
 *
 * @example
 * ```typescript
 * const OrgSwitcher = createOrgSwitcherFactory({
 *   api: {
 *     getUserOrganizations: api.userOrg.getUserOrganizations,
 *     switchOrg: api.userOrg.switchOrg,
 *   },
 *   ui: {
 *     DropdownMenu,
 *     DropdownMenuTrigger,
 *     DropdownMenuContent,
 *     DropdownMenuItem,
 *     DropdownMenuLabel,
 *     DropdownMenuSeparator,
 *     Button,
 *     Input,
 *     toast,
 *   },
 *   hooks: {
 *     useSession: () => useSession(),
 *     useRouter: () => useRouter(),
 *   },
 * });
 * ```
 */
export function createOrgSwitcherFactory(config: OrgSwitcherFactoryConfig) {
  const {
    api,
    ui,
    hooks,
    isPlatformSystemRole,
    isCustomDomainOrg,
    redirectPath = "/dashboard",
    showSearch = true,
    searchThreshold = 5,
  } = config;

  const {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    Button,
    Input,
    toast,
  } = ui;

  return function OrgSwitcher({
    className,
    onSwitchSuccess,
    onSwitchError,
  }: OrgSwitcherProps) {
    const { data: session, update: updateSession } = hooks.useSession();
    const router = hooks.useRouter();

    // Get user's organizations
    const { data: userOrgs, isLoading: isLoadingOrgs } =
      api.getUserOrganizations.useQuery(undefined, {
        enabled: !!session?.user,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      });

    // Switch mutation
    const switchOrgMutation = api.switchOrg.useMutation();

    // Utils for cache invalidation (optional)
    const utils = api.useUtils?.();

    // Check if user has system role
    const hasSystemRole = React.useMemo(() => {
      if (!isPlatformSystemRole || !session?.user?.roles) return false;
      return session.user.roles.some((role) =>
        isPlatformSystemRole(role.name)
      );
    }, [session?.user?.roles]);

    // Get current org ID from session
    const currentOrgId = session?.user?.currentOrgId ?? null;

    // Normalize organizations data
    const normalizedOrgs: SwitcherOrgData[] = React.useMemo(() => {
      if (!userOrgs) return [];

      return userOrgs
        .map((org: any) => {
          const rawId = org.id ?? org.orgId;
          const rawName = org.name ?? org.orgName ?? "";
          const idNum = Number(rawId);
          const name =
            String(rawName).trim() ||
            (Number.isFinite(idNum) ? `Organization ${idNum}` : "Organization");

          // Normalize roles
          let roles: string[] = [];
          if (Array.isArray(org.roles)) {
            roles = org.roles
              .map((r: any) =>
                typeof r === "string" ? r : r?.name ?? r?.roleName ?? ""
              )
              .filter(Boolean);
          }

          const roleCount = Number.isFinite(Number(org.roleCount))
            ? Number(org.roleCount)
            : roles.length;

          return {
            id: idNum,
            name,
            slug: org.slug,
            customDomain: org.customDomain,
            roles,
            roleCount,
          };
        })
        .filter((o: SwitcherOrgData) => Number.isFinite(o.id));
    }, [userOrgs]);

    // Use the logic hook
    const {
      currentOrg,
      filteredOrgs,
      searchQuery,
      setSearchQuery,
      handleOrgSwitch: onOrgSelect,
      hasMultipleOrgs,
      isLoading,
    } = useOrgSwitcherLogic({
      currentOrgId,
      organizations: normalizedOrgs,
      onOrgSwitch: async (orgId) => {
        try {
          const result = await switchOrgMutation.mutateAsync({ orgId });

          if (result.success) {
            // Refresh session
            await updateSession();

            // Invalidate cache if available
            if (utils?.invalidate) {
              await utils.invalidate();
            }

            // Brief delay for session propagation
            await new Promise((resolve) => setTimeout(resolve, 100));

            toast.success(`Switched to ${result.org.name}`);

            onSwitchSuccess?.({ id: orgId, name: result.org.name });

            // Navigate to redirect path
            router.push(redirectPath);
          } else {
            const errorMsg = result.error || "Failed to switch organization";
            toast.error(errorMsg);
            onSwitchError?.(new Error(errorMsg));
          }
        } catch (error) {
          console.error("Error switching org:", error);
          toast.error("Failed to switch organization");
          onSwitchError?.(
            error instanceof Error ? error : new Error("Unknown error")
          );
        }
      },
      isLoading: isLoadingOrgs,
      isSwitching: switchOrgMutation.isPending,
    });

    // Don't render if no session or loading
    if (!session?.user || isLoading) {
      return null;
    }

    // Get display org (current or first available)
    const displayOrg =
      currentOrg || (normalizedOrgs.length > 0 ? normalizedOrgs[0] : null);

    // System role with single org - show text only
    if (hasSystemRole && normalizedOrgs.length <= 1) {
      const orgName =
        displayOrg?.name || session?.user?.currentOrg?.name || "Organization";
      return (
        <div className={`flex items-center gap-2 px-3 py-2 text-sm ${className || ""}`}>
          <Building2Icon className="h-4 w-4 text-muted-foreground" />
          <span
            className="font-medium truncate max-w-[12rem]"
            title={orgName}
          >
            {orgName}
          </span>
        </div>
      );
    }

    // No organizations
    if (normalizedOrgs.length === 0) {
      return null;
    }

    // Single organization (non-system) - show text only
    if (!hasSystemRole && normalizedOrgs.length === 1) {
      return (
        <div className={`flex items-center gap-2 px-3 py-2 text-sm ${className || ""}`}>
          <Building2Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {displayOrg?.name || "Organization"}
          </span>
        </div>
      );
    }

    // Show search if enabled and above threshold
    const shouldShowSearch =
      showSearch && Input && normalizedOrgs.length >= searchThreshold;

    // Multiple organizations - show dropdown
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`h-9 w-full justify-between ${className || ""}`}
            disabled={switchOrgMutation.isPending}
          >
            <div className="flex items-center gap-2 flex-1 truncate">
              <Building2Icon className="h-4 w-4 shrink-0" />
              <span className="truncate" title={displayOrg?.name}>
                {displayOrg?.name || "Select Organization"}
              </span>
              {displayOrg?.customDomain && isCustomDomainOrg?.(displayOrg) && (
                <GlobeIcon className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <ChevronDownIcon className="h-4 w-4 shrink-0 ml-2 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[240px] max-h-[400px] overflow-y-auto">
          <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Search input */}
          {shouldShowSearch && (
            <>
              <div className="px-2 pb-2">
                <div className="relative">
                  <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search organizations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8"
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Organization list */}
          {filteredOrgs.length === 0 ? (
            <div className="px-2 py-4 text-sm text-center text-muted-foreground">
              No organizations found
            </div>
          ) : (
            filteredOrgs.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => onOrgSelect(org.id)}
                className="cursor-pointer"
                disabled={switchOrgMutation.isPending}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{org.name}</span>
                      {org.customDomain && isCustomDomainOrg?.(org) && (
                        <GlobeIcon className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    {org.roles && org.roles.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {org.roleCount ?? org.roles.length}{" "}
                        {(org.roleCount ?? org.roles.length) === 1
                          ? "role"
                          : "roles"}
                        : {org.roles.slice(0, 2).join(", ")}
                        {org.roles.length > 2 &&
                          ` +${org.roles.length - 2} more`}
                      </div>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
}

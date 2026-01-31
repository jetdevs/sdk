/**
 * Organizations UI Module
 *
 * Client-side organization management components.
 * Provides logic hooks and factory functions for organization UI.
 *
 * @module @jetdevs/core/features/organizations/ui
 *
 * @example
 * ```typescript
 * // Using the logic hook directly
 * import { useOrgSwitcherLogic } from '@jetdevs/core/features/organizations';
 *
 * const { currentOrg, filteredOrgs, handleOrgSwitch } = useOrgSwitcherLogic({
 *   currentOrgId: session.user.currentOrgId,
 *   organizations: userOrgs,
 *   onOrgSwitch: (orgId) => switchOrg(orgId),
 * });
 *
 * // Using the factory to create a component
 * import { createOrgSwitcherFactory } from '@jetdevs/core/features/organizations';
 *
 * export const OrgSwitcher = createOrgSwitcherFactory({
 *   api: { getUserOrganizations, switchOrg },
 *   ui: { DropdownMenu, Button, toast },
 *   hooks: { useSession, useRouter },
 * });
 * ```
 */

// Export hooks
export {
  useOrgSwitcherLogic,
  type SwitcherOrgData,
  type UseOrgSwitcherLogicConfig,
  type OrgSwitcherLogicReturn,
} from "./hooks";

// Export factories
export {
  createOrgSwitcherFactory,
  type OrgSwitcherToastInterface,
  type OrgSwitcherUIComponents,
  type OrgSwitcherApi,
  type OrgSwitcherHooks,
  type OrgSwitcherFactoryConfig,
  type OrgSwitcherProps,
} from "./factories";

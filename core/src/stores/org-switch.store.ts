/**
 * Organization Switch Store
 *
 * Zustand store for managing organization switching UI state.
 * Provides loading state and target org info during transitions.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Org switch store state
 */
export interface OrgSwitchState {
  isSwitching: boolean;
  targetOrgName: string | null;
}

/**
 * Org switch store actions
 */
export interface OrgSwitchActions {
  startSwitch: (orgName: string) => void;
  endSwitch: () => void;
}

/**
 * Full org switch store type
 */
export type OrgSwitchStore = OrgSwitchState & OrgSwitchActions;

// =============================================================================
// STORE FACTORY
// =============================================================================

/**
 * Create an org switch store with optional configuration
 */
export function createOrgSwitchStore(options?: {
  name?: string;
}): UseBoundStore<StoreApi<OrgSwitchStore>> {
  const { name = 'org-switch-store' } = options ?? {};

  return create<OrgSwitchStore>()((set) => ({
    // Initial state
    isSwitching: false,
    targetOrgName: null,

    // Actions
    startSwitch: (orgName: string) =>
      set({ isSwitching: true, targetOrgName: orgName }),

    endSwitch: () =>
      set({ isSwitching: false, targetOrgName: null }),
  }));
}

// =============================================================================
// DEFAULT STORE INSTANCE
// =============================================================================

/**
 * Default org switch store instance
 */
export const useOrgSwitchStore: UseBoundStore<StoreApi<OrgSwitchStore>> = createOrgSwitchStore();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if org switch is in progress
 */
export const isOrgSwitching = () => useOrgSwitchStore.getState().isSwitching;

/**
 * Get target org name during switch
 */
export const getTargetOrgName = () => useOrgSwitchStore.getState().targetOrgName;

/**
 * Start org switch
 */
export const startOrgSwitch = (orgName: string) =>
  useOrgSwitchStore.getState().startSwitch(orgName);

/**
 * End org switch
 */
export const endOrgSwitch = () =>
  useOrgSwitchStore.getState().endSwitch();

/**
 * UI Store
 *
 * Zustand store for UI state management (sidebar, theme, etc.)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UIState, UIActions, UIStore } from './types';

// =============================================================================
// STORE FACTORY
// =============================================================================

/**
 * Create a UI store with optional configuration
 */
export function createUIStore(options?: {
  name?: string;
  defaultSidebarOpen?: boolean;
  defaultTheme?: 'light' | 'dark' | 'system';
}) {
  const {
    name = 'ui-store',
    defaultSidebarOpen = true,
    defaultTheme = 'system',
  } = options ?? {};

  return create<UIStore>()(
    persist(
      (set) => ({
        // Initial state
        sidebarOpen: defaultSidebarOpen,
        theme: defaultTheme,

        // Actions
        toggleSidebar: () =>
          set((state) => ({ sidebarOpen: !state.sidebarOpen })),

        setSidebarOpen: (open) =>
          set(() => ({ sidebarOpen: open })),

        setTheme: (theme) =>
          set(() => ({ theme })),
      }),
      {
        name,
        partialize: (state) => ({
          sidebarOpen: state.sidebarOpen,
          theme: state.theme,
        }),
      }
    )
  );
}

// =============================================================================
// DEFAULT STORE INSTANCE
// =============================================================================

/**
 * Default UI store instance
 */
export const useUIStore = createUIStore();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get current sidebar state
 */
export const isSidebarOpen = () => useUIStore.getState().sidebarOpen;

/**
 * Get current theme
 */
export const getTheme = () => useUIStore.getState().theme;

/**
 * Toggle sidebar
 */
export const toggleSidebar = () => useUIStore.getState().toggleSidebar();

/**
 * Set theme
 */
export const setTheme = (theme: 'light' | 'dark' | 'system') =>
  useUIStore.getState().setTheme(theme);

// =============================================================================
// TYPES RE-EXPORT
// =============================================================================

export type { UIState, UIActions, UIStore };

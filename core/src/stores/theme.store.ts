/**
 * Theme Store
 *
 * Zustand store for user theme preferences (custom CSS themes).
 * This is separate from the light/dark mode theme which is handled by ThemeProvider.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoreApi, UseBoundStore } from 'zustand';

// =============================================================================
// TYPES
// =============================================================================

export interface ThemeState {
  /** Current custom theme name (e.g., 'default', 'midnight', 'sunrise') */
  theme: string;
}

export interface ThemeActions {
  /** Set the current theme */
  setTheme: (theme: string) => void;
  /** Initialize theme from server (called on login) */
  initializeFromServer: (serverTheme: string | undefined) => void;
}

export type ThemeStore = ThemeState & ThemeActions;

// =============================================================================
// STORE FACTORY
// =============================================================================

/**
 * Create a theme store with optional configuration
 */
export function createThemeStore(options?: {
  name?: string;
  defaultTheme?: string;
}): UseBoundStore<StoreApi<ThemeStore>> {
  const { name = 'theme-preference', defaultTheme = 'default' } = options ?? {};

  return create<ThemeStore>()(
    persist(
      (set, get) => ({
        theme: defaultTheme,

        setTheme: (theme) => {
          set({ theme });
        },

        initializeFromServer: (serverTheme) => {
          // This should only be called on initial login when there's no localStorage value
          // Don't override if user has already selected a theme locally
          const currentTheme = get().theme;
          if (serverTheme && currentTheme === defaultTheme) {
            set({ theme: serverTheme });
          }
        },
      }),
      {
        name,
        // Only persist the theme field
        partialize: (state) => ({ theme: state.theme }),
      }
    )
  );
}

// =============================================================================
// DEFAULT STORE INSTANCE
// =============================================================================

/**
 * Default theme store instance
 */
export const useThemeStore = createThemeStore();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the current theme
 */
export const getThemePreference = () => useThemeStore.getState().theme;

/**
 * Set the theme
 */
export const setThemePreference = (theme: string) =>
  useThemeStore.getState().setTheme(theme);

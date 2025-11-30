/**
 * User Theme Provider
 *
 * Provider that applies custom CSS themes based on the theme store.
 * This is separate from light/dark mode - it handles custom theme stylesheets.
 */

'use client';

import * as React from 'react';
import { useEffect } from 'react';
import { applyTheme, registerGlobalApplyTheme } from '../lib/theme-manager';

// =============================================================================
// TYPES
// =============================================================================

export interface UserThemeProviderProps {
  children: React.ReactNode;
  /** Current theme name from store or props */
  theme: string;
  /** Base path for theme CSS files */
  themePath?: string;
  /** Data attribute for theme tracking */
  dataAttribute?: string;
  /** CSS file extension */
  extension?: string;
}

// Extend Window type
declare global {
  interface Window {
    __applyTheme?: (theme: string) => void;
  }
}

// =============================================================================
// PROVIDER
// =============================================================================

/**
 * User Theme Provider Component
 *
 * Applies custom CSS themes based on the provided theme prop.
 * Typically used with the theme store.
 *
 * @example
 * // With the theme store
 * function App() {
 *   const { theme } = useThemeStore();
 *
 *   return (
 *     <UserThemeProvider theme={theme}>
 *       <YourApp />
 *     </UserThemeProvider>
 *   );
 * }
 */
export function UserThemeProvider({
  children,
  theme,
  themePath = '/themes',
  dataAttribute = 'data-user-theme',
  extension = '.css',
}: UserThemeProviderProps) {
  // Register the global applyTheme function on mount
  useEffect(() => {
    registerGlobalApplyTheme({ themePath, dataAttribute, extension });
  }, [themePath, dataAttribute, extension]);

  // Apply theme when it changes
  useEffect(() => {
    // Use the global function if available, otherwise use direct function
    if (window.__applyTheme) {
      window.__applyTheme(theme);
    } else {
      applyTheme(theme, { themePath, dataAttribute, extension });
    }
  }, [theme, themePath, dataAttribute, extension]);

  return <>{children}</>;
}

// =============================================================================
// HOOK VERSION
// =============================================================================

/**
 * Hook to apply a user theme without the provider component
 *
 * @example
 * function ThemeSwitcher() {
 *   const { theme } = useThemeStore();
 *   useUserTheme(theme);
 *   return <div>Current theme: {theme}</div>;
 * }
 */
export function useUserTheme(
  theme: string,
  options?: {
    themePath?: string;
    dataAttribute?: string;
    extension?: string;
  }
): void {
  const {
    themePath = '/themes',
    dataAttribute = 'data-user-theme',
    extension = '.css',
  } = options ?? {};

  useEffect(() => {
    registerGlobalApplyTheme({ themePath, dataAttribute, extension });
  }, [themePath, dataAttribute, extension]);

  useEffect(() => {
    if (window.__applyTheme) {
      window.__applyTheme(theme);
    } else {
      applyTheme(theme, { themePath, dataAttribute, extension });
    }
  }, [theme, themePath, dataAttribute, extension]);
}

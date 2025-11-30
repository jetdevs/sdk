/**
 * Theme Provider
 *
 * Context provider for light/dark mode theme management.
 * This handles the system-level theme (light/dark/system).
 */

'use client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  /** Current theme setting */
  theme: ThemeMode;
  /** Set the theme */
  setTheme: (theme: ThemeMode) => void;
  /** Actual resolved theme (light or dark) */
  actualTheme: 'light' | 'dark';
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Default theme if none is stored */
  defaultTheme?: ThemeMode;
  /** localStorage key for persistence */
  storageKey?: string;
  /** HTML attribute to set on documentElement */
  attribute?: 'class' | 'data-theme';
  /** Disable transitions during theme change */
  disableTransitions?: boolean;
}

// =============================================================================
// CONTEXT
// =============================================================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access theme context
 *
 * @example
 * function ThemeButton() {
 *   const { theme, setTheme, actualTheme } = useTheme();
 *
 *   return (
 *     <button onClick={() => setTheme(actualTheme === 'light' ? 'dark' : 'light')}>
 *       Current: {actualTheme}
 *     </button>
 *   );
 * }
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDOM(
  theme: 'light' | 'dark',
  attribute: 'class' | 'data-theme',
  disableTransitions: boolean
): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Optionally disable transitions
  if (disableTransitions) {
    root.style.setProperty('--transition-duration', '0ms');
  }

  if (attribute === 'class') {
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  } else {
    root.setAttribute('data-theme', theme);
  }

  // Re-enable transitions
  if (disableTransitions) {
    // Use requestAnimationFrame to ensure the class has been applied
    requestAnimationFrame(() => {
      root.style.removeProperty('--transition-duration');
    });
  }
}

// =============================================================================
// PROVIDER
// =============================================================================

/**
 * Theme Provider Component
 *
 * @example
 * // In your app layout
 * <ThemeProvider defaultTheme="system" attribute="class">
 *   <App />
 * </ThemeProvider>
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'theme',
  attribute = 'class',
  disableTransitions = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(storageKey) as ThemeMode | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored);
    }
  }, [storageKey]);

  // Apply theme when it changes
  useEffect(() => {
    if (!mounted) return;

    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
    setActualTheme(resolvedTheme);
    applyThemeToDOM(resolvedTheme, attribute, disableTransitions);
  }, [theme, mounted, attribute, disableTransitions]);

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      setActualTheme(newTheme);
      applyThemeToDOM(newTheme, attribute, disableTransitions);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted, attribute, disableTransitions]);

  const setTheme = useCallback(
    (newTheme: ThemeMode) => {
      localStorage.setItem(storageKey, newTheme);
      setThemeState(newTheme);
    },
    [storageKey]
  );

  const value: ThemeContextValue = {
    theme,
    setTheme,
    actualTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

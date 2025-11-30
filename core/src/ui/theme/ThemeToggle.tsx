/**
 * Theme Toggle Component
 *
 * A simple theme toggle button that switches between light and dark modes.
 * Uses the SDK's ThemeProvider context.
 *
 * @module @yobolabs/core/ui/theme
 *
 * @example
 * ```tsx
 * import { ThemeToggle } from '@yobolabs/core/ui/theme';
 *
 * function Header() {
 *   return (
 *     <header>
 *       <ThemeToggle className="p-2 rounded hover:bg-gray-100" />
 *     </header>
 *   );
 * }
 * ```
 */

'use client';

import * as React from 'react';
import { useTheme } from '../../providers/ThemeProvider';

// =============================================================================
// TYPES
// =============================================================================

export interface ThemeToggleProps {
  /** Additional CSS classes */
  className?: string;
  /** Custom icon for light mode (shown when dark mode is active) */
  lightIcon?: React.ReactNode;
  /** Custom icon for dark mode (shown when light mode is active) */
  darkIcon?: React.ReactNode;
  /** Accessible label for the button */
  'aria-label'?: string;
}

// =============================================================================
// DEFAULT ICONS
// =============================================================================

/**
 * Simple sun icon for light mode
 */
function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

/**
 * Simple moon icon for dark mode
 */
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Theme Toggle Button
 *
 * A button that toggles between light and dark themes.
 * Must be used within a ThemeProvider.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ThemeToggle />
 *
 * // With custom styling
 * <ThemeToggle className="p-2 rounded-full bg-gray-100 hover:bg-gray-200" />
 *
 * // With custom icons
 * <ThemeToggle
 *   lightIcon={<Sun className="h-5 w-5" />}
 *   darkIcon={<Moon className="h-5 w-5" />}
 * />
 * ```
 */
export function ThemeToggle({
  className,
  lightIcon,
  darkIcon,
  'aria-label': ariaLabel,
}: ThemeToggleProps) {
  const { setTheme, actualTheme } = useTheme();

  const handleToggle = React.useCallback(() => {
    setTheme(actualTheme === 'light' ? 'dark' : 'light');
  }, [actualTheme, setTheme]);

  const isDark = actualTheme === 'dark';

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={className}
      aria-label={ariaLabel ?? `Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (lightIcon ?? <SunIcon />) : (darkIcon ?? <MoonIcon />)}
    </button>
  );
}

/**
 * Theme Toggle with Three States
 *
 * A theme toggle that cycles through light, dark, and system modes.
 *
 * @example
 * ```tsx
 * <ThemeToggleThreeState className="p-2" />
 * ```
 */
export function ThemeToggleThreeState({
  className,
  'aria-label': ariaLabel,
}: Omit<ThemeToggleProps, 'lightIcon' | 'darkIcon'>) {
  const { theme, setTheme, actualTheme } = useTheme();

  const handleToggle = React.useCallback(() => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  }, [theme, setTheme]);

  const getLabel = () => {
    if (theme === 'system') {
      return `System (${actualTheme})`;
    }
    return theme === 'light' ? 'Light' : 'Dark';
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={className}
      aria-label={ariaLabel ?? `Current theme: ${getLabel()}. Click to change.`}
    >
      {theme === 'system' ? (
        <SystemIcon />
      ) : actualTheme === 'dark' ? (
        <SunIcon />
      ) : (
        <MoonIcon />
      )}
    </button>
  );
}

/**
 * System/monitor icon for system theme
 */
function SystemIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

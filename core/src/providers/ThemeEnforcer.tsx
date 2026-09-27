/**
 * Theme Enforcer
 *
 * Client component that ensures theme CSS persists across client-side navigation.
 *
 * React 19 manages `<link>` elements with `precedence` as "resources" which can
 * interfere with server-injected theme stylesheets during navigation. This component
 * monitors the DOM and re-creates the theme CSS link if it gets removed.
 *
 * Also handles the case where the ThemeScript inline script runs before React has
 * inserted the server-rendered `<link>` element (race condition during SSR hydration).
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface ThemeEnforcerProps {
  /** Base path for theme CSS files (default: '/themes') */
  themePath?: string;
  /** Data attribute on documentElement tracking the active theme (default: 'data-user-theme') */
  dataAttribute?: string;
  /** CSS file extension (default: '.css') */
  extension?: string;
}

/**
 * ThemeEnforcer Component
 *
 * Ensures the active theme CSS link stays in the DOM across navigations.
 * Reads the expected theme from the `data-user-theme` attribute on `<html>`
 * (set by ThemeScript) and verifies a matching `<link>` element exists.
 *
 * @example
 * // In your root layout (inside providers)
 * <ThemeEnforcer />
 */
export function ThemeEnforcer({
  themePath = '/themes',
  dataAttribute = 'data-user-theme',
  extension = '.css',
}: ThemeEnforcerProps) {
  const observerRef = useRef<MutationObserver | null>(null);

  const ensureThemeLink = useCallback(() => {
    if (typeof document === 'undefined') return;

    const activeTheme = document.documentElement.getAttribute(dataAttribute);
    if (!activeTheme || activeTheme === 'default') {
      // For 'default' theme, check if default.css exists or if no theme is needed
      if (!activeTheme) return;
    }

    // Check if a CSS link for this theme already exists
    const existingLink = document.querySelector(`link[data-theme="${activeTheme}"]`);
    if (existingLink) return;

    // Theme link is missing - recreate it
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${themePath}/${activeTheme}${extension}`;
    link.setAttribute('data-theme', activeTheme);
    // Don't use precedence here - we want direct DOM control, not React management
    document.head.appendChild(link);
  }, [themePath, dataAttribute, extension]);

  useEffect(() => {
    // Verify theme link on mount (catches hydration race conditions)
    ensureThemeLink();

    // Watch for link removal from <head>
    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          for (const node of Array.from(mutation.removedNodes)) {
            if (
              node instanceof HTMLLinkElement &&
              node.hasAttribute('data-theme')
            ) {
              // A theme link was removed - re-add it
              // Use rAF to avoid re-adding during React's reconciliation
              requestAnimationFrame(() => {
                ensureThemeLink();
              });
              return;
            }
          }
        }
      }
    });

    observerRef.current.observe(document.head, { childList: true });

    // Also check when the page becomes visible (handles tab switching edge cases)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ensureThemeLink();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      observerRef.current?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ensureThemeLink]);

  return null;
}

/**
 * useThemeEnforcement Hook
 *
 * Hook version of ThemeEnforcer for use without the component.
 *
 * @example
 * function ThemeManager() {
 *   useThemeEnforcement();
 *   // ... other theme management logic
 *   return null;
 * }
 */
export function useThemeEnforcement(options?: {
  themePath?: string;
  dataAttribute?: string;
  extension?: string;
}): void {
  const {
    themePath = '/themes',
    dataAttribute = 'data-user-theme',
    extension = '.css',
  } = options ?? {};

  const ensureThemeLink = useCallback(() => {
    if (typeof document === 'undefined') return;

    const activeTheme = document.documentElement.getAttribute(dataAttribute);
    if (!activeTheme) return;

    const existingLink = document.querySelector(`link[data-theme="${activeTheme}"]`);
    if (existingLink) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${themePath}/${activeTheme}${extension}`;
    link.setAttribute('data-theme', activeTheme);
    document.head.appendChild(link);
  }, [themePath, dataAttribute, extension]);

  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    ensureThemeLink();

    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          for (const node of Array.from(mutation.removedNodes)) {
            if (
              node instanceof HTMLLinkElement &&
              node.hasAttribute('data-theme')
            ) {
              requestAnimationFrame(() => {
                ensureThemeLink();
              });
              return;
            }
          }
        }
      }
    });

    observerRef.current.observe(document.head, { childList: true });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ensureThemeLink();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      observerRef.current?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ensureThemeLink]);
}

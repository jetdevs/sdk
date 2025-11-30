/**
 * Theme Manager
 *
 * Utilities for managing custom CSS themes.
 * Works with both SSR and client-side rendering.
 */

// =============================================================================
// STORAGE FUNCTIONS
// =============================================================================

/**
 * Get the stored theme from localStorage
 *
 * @param storageKey - The localStorage key (default: 'theme-preference')
 */
export function getStoredTheme(storageKey = 'theme-preference'): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.state?.theme || null;
    }
  } catch (e) {
    console.error('Error reading theme from localStorage:', e);
  }
  return null;
}

/**
 * Save theme to localStorage
 *
 * @param theme - Theme name to store
 * @param storageKey - The localStorage key (default: 'theme-preference')
 */
export function setStoredTheme(theme: string, storageKey = 'theme-preference'): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(
    storageKey,
    JSON.stringify({
      state: { theme },
      version: 0,
    })
  );
}

// =============================================================================
// DOM FUNCTIONS
// =============================================================================

/**
 * Apply a custom CSS theme to the document
 *
 * @param theme - Theme name
 * @param options - Configuration options
 */
export function applyTheme(
  theme: string,
  options?: {
    /** Base path for theme CSS files (default: '/themes') */
    themePath?: string;
    /** Data attribute name for theme tracking (default: 'data-user-theme') */
    dataAttribute?: string;
    /** CSS file extension (default: '.css') */
    extension?: string;
  }
): void {
  if (typeof document === 'undefined') return;

  const {
    themePath = '/themes',
    dataAttribute = 'data-user-theme',
    extension = '.css',
  } = options ?? {};

  // Remove all existing theme links
  const existingThemeLinks = document.querySelectorAll('link[data-theme]');
  existingThemeLinks.forEach((link) => link.remove());

  // Create new theme link
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${themePath}/${theme}${extension}`;
  link.setAttribute('data-theme', theme);
  link.setAttribute('precedence', 'high');

  // Insert at the end of head to ensure it overrides other styles
  document.head.appendChild(link);

  // Update data attribute
  document.documentElement.setAttribute(dataAttribute, theme);
}

/**
 * Remove the current custom theme
 */
export function removeTheme(dataAttribute = 'data-user-theme'): void {
  if (typeof document === 'undefined') return;

  const existingThemeLinks = document.querySelectorAll('link[data-theme]');
  existingThemeLinks.forEach((link) => link.remove());
  document.documentElement.removeAttribute(dataAttribute);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize theme from storage or server
 *
 * @param serverTheme - Theme from server (default: 'default')
 * @param options - Configuration options
 * @returns The active theme name
 */
export function initializeTheme(
  serverTheme = 'default',
  options?: {
    themePath?: string;
    dataAttribute?: string;
    storageKey?: string;
    extension?: string;
  }
): string {
  const { storageKey = 'theme-preference', ...applyOptions } = options ?? {};

  // Check localStorage first
  const storedTheme = getStoredTheme(storageKey);
  const activeTheme = storedTheme || serverTheme;

  // If no stored theme, save the server theme
  if (!storedTheme && serverTheme) {
    setStoredTheme(serverTheme, storageKey);
  }

  // Apply the theme
  applyTheme(activeTheme, applyOptions);

  return activeTheme;
}

// =============================================================================
// PRELOAD SCRIPT
// =============================================================================

/**
 * Generate a script that can be inlined to prevent theme flash
 *
 * @param options - Configuration options
 * @returns Script content as string
 */
export function getThemePreloadScript(options?: {
  storageKey?: string;
  themePath?: string;
  defaultTheme?: string;
}): string {
  const {
    storageKey = 'theme-preference',
    themePath = '/themes',
    defaultTheme = 'default',
  } = options ?? {};

  return `
(function() {
  try {
    var stored = localStorage.getItem('${storageKey}');
    var theme = '${defaultTheme}';
    if (stored) {
      var parsed = JSON.parse(stored);
      theme = parsed.state?.theme || '${defaultTheme}';
    }

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '${themePath}/' + theme + '.css';
    link.setAttribute('data-theme', theme);
    link.setAttribute('precedence', 'high');
    document.head.appendChild(link);
    document.documentElement.setAttribute('data-user-theme', theme);
  } catch (e) {}
})();
  `.trim();
}

// =============================================================================
// GLOBAL WINDOW FUNCTION
// =============================================================================

/**
 * Register the applyTheme function globally for use by theme providers
 */
export function registerGlobalApplyTheme(options?: {
  themePath?: string;
  dataAttribute?: string;
  extension?: string;
}): void {
  if (typeof window === 'undefined') return;

  (window as Window & { __applyTheme?: (theme: string) => void }).__applyTheme = (
    theme: string
  ) => {
    applyTheme(theme, options);
  };
}

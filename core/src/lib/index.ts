/**
 * Utility Library
 *
 * Common utility functions.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// =============================================================================
// THEME MANAGER
// =============================================================================

export {
  getStoredTheme,
  setStoredTheme,
  applyTheme,
  removeTheme,
  initializeTheme,
  getThemePreloadScript,
  registerGlobalApplyTheme,
} from './theme-manager';

// =============================================================================
// FORMATTERS
// =============================================================================

export {
  // Date formatters
  formatDate,
  formatISODate,
  formatLocalDate,
  formatLocalDateTime,
  formatRelativeTime,
  // Number formatters
  formatNumber,
  formatCurrency,
  formatPercent,
  formatBytes,
  // String formatters
  truncate,
  toTitleCase,
  slugToTitle,
  toKebabCase,
  toCamelCase,
  pluralize,
} from './formatters';

// =============================================================================
// ID GENERATION
// =============================================================================

export {
  generateUniqueId,
  generatePrefixedId,
  generateShortId,
  generateNanoId,
} from './id';

// =============================================================================
// COUNTRY CODES
// =============================================================================

export {
  countryCodes,
  COUNTRY_CODES_LEGACY,
  getCountryByCode,
  getCountryByISO,
  getDefaultCountry,
  formatPhoneWithCountry,
  parsePhoneNumber,
} from './country-codes';

export type { CountryCode } from './country-codes';

// =============================================================================
// CORE UTILITY FUNCTIONS
// =============================================================================

/**
 * Merge class names with Tailwind CSS conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique ID.
 */
export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple logger with levels.
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]) => {
    console.info(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};

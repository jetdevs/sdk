/**
 * Formatters
 *
 * Common formatting utilities for dates, numbers, and strings.
 */

// =============================================================================
// DATE FORMATTERS
// =============================================================================

/**
 * Format a date to MM/DD/YYYY string
 *
 * @param dateString - Date object, string, or null
 * @returns Formatted date string or empty string if invalid
 */
export function formatDate(dateString: Date | string | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${month}/${day}/${year}`;
}

/**
 * Format a date to ISO date string (YYYY-MM-DD)
 */
export function formatISODate(dateString: Date | string | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
}

/**
 * Format a date to a locale-aware string
 */
export function formatLocalDate(
  dateString: Date | string | null,
  locale = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleDateString(locale, options);
}

/**
 * Format a date to a locale-aware datetime string
 */
export function formatLocalDateTime(
  dateString: Date | string | null,
  locale = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleString(
    locale,
    options ?? {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  dateString: Date | string | null,
  locale = 'en-US'
): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSeconds) < 60) {
    return rtf.format(diffSeconds, 'second');
  } else if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  } else {
    return rtf.format(diffDays, 'day');
  }
}

// =============================================================================
// NUMBER FORMATTERS
// =============================================================================

/**
 * Format a number with locale-aware thousands separators
 */
export function formatNumber(
  value: number | null | undefined,
  locale = 'en-US'
): string {
  if (value == null) return '';
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format a number as currency
 */
export function formatCurrency(
  value: number | null | undefined,
  currency = 'USD',
  locale = 'en-US'
): string {
  if (value == null) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format a number as percentage
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
  locale = 'en-US'
): string {
  if (value == null) return '';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// =============================================================================
// STRING FORMATTERS
// =============================================================================

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Convert a string to title case
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert snake_case or kebab-case to Title Case
 */
export function slugToTitle(slug: string): string {
  if (!slug) return '';
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Convert a string to kebab-case
 */
export function toKebabCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert a string to camelCase
 */
export function toCamelCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Pluralize a word based on count
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  return count === 1 ? singular : plural || singular + 's';
}

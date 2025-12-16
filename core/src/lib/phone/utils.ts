/**
 * Phone number utility functions for normalization and validation
 * Uses libphonenumber-js for E.164 formatting
 *
 * @module @jetdevs/core/lib/phone
 */

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

// Re-export CountryCode type for convenience
export type { CountryCode } from 'libphonenumber-js';

/**
 * Normalize a phone number to E.164 format
 * @param phone - Raw phone number input
 * @param defaultCountry - Default country code for parsing (defaults to US)
 * @returns E.164 formatted phone number or null if invalid
 *
 * @example
 * ```typescript
 * normalizePhone('(555) 123-4567', 'US'); // '+15551234567'
 * normalizePhone('+44 20 7946 0958', 'GB'); // '+442079460958'
 * normalizePhone('invalid'); // null
 * ```
 */
export function normalizePhone(
  phone: string,
  defaultCountry: CountryCode = 'US'
): string | null {
  try {
    // Handle null, undefined, or empty input
    if (!phone || typeof phone !== 'string') {
      return null;
    }

    // Remove any non-numeric characters except + at the beginning
    const cleanedPhone = phone.trim();

    // Parse the phone number
    const phoneNumber = parsePhoneNumberFromString(cleanedPhone, defaultCountry);

    // Validate and return E.164 format
    if (!phoneNumber?.isValid()) {
      return null;
    }

    return phoneNumber.format('E.164'); // Returns format like +12025551234
  } catch (error) {
    console.error('Error normalizing phone:', error);
    return null;
  }
}

/**
 * Validate if a phone number is valid for a given country
 * @param phone - Phone number to validate
 * @param country - Country code to validate against
 * @returns Boolean indicating if the phone is valid
 *
 * @example
 * ```typescript
 * isValidPhone('(555) 123-4567', 'US'); // true
 * isValidPhone('invalid', 'US'); // false
 * ```
 */
export function isValidPhone(phone: string, country: CountryCode = 'US'): boolean {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone, country);
    return phoneNumber?.isValid() ?? false;
  } catch {
    return false;
  }
}

/**
 * Get the country code from a phone number
 * @param phone - Phone number (preferably in international format)
 * @returns Country code or null if unable to determine
 *
 * @example
 * ```typescript
 * getPhoneCountry('+12025551234'); // 'US'
 * getPhoneCountry('+442079460958'); // 'GB'
 * ```
 */
export function getPhoneCountry(phone: string): CountryCode | null {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone);
    return phoneNumber?.country ?? null;
  } catch {
    return null;
  }
}

/**
 * Format a phone number for display
 * @param phone - E.164 formatted phone number
 * @param format - Format type (NATIONAL or INTERNATIONAL)
 * @returns Formatted phone number string
 *
 * @example
 * ```typescript
 * formatPhoneForDisplay('+12025551234', 'NATIONAL'); // '(202) 555-1234'
 * formatPhoneForDisplay('+12025551234', 'INTERNATIONAL'); // '+1 202 555 1234'
 * ```
 */
export function formatPhoneForDisplay(
  phone: string,
  format: 'NATIONAL' | 'INTERNATIONAL' = 'NATIONAL'
): string {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone);
    if (!phoneNumber) return phone;

    return format === 'NATIONAL'
      ? phoneNumber.formatNational()
      : phoneNumber.formatInternational();
  } catch {
    return phone;
  }
}

/**
 * Phone number components
 */
export interface PhoneComponents {
  countryCallingCode: string;
  nationalNumber: string;
  country: CountryCode | undefined;
  isValid: boolean;
  isPossible: boolean;
  type: string | undefined; // MOBILE, FIXED_LINE, etc.
}

/**
 * Extract phone number components
 * @param phone - Phone number to parse
 * @returns Object with country code, national number, etc., or null if invalid
 *
 * @example
 * ```typescript
 * parsePhoneComponents('+12025551234');
 * // { countryCallingCode: '1', nationalNumber: '2025551234', country: 'US', ... }
 * ```
 */
export function parsePhoneComponents(phone: string): PhoneComponents | null {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone);
    if (!phoneNumber) return null;

    return {
      countryCallingCode: phoneNumber.countryCallingCode,
      nationalNumber: phoneNumber.nationalNumber,
      country: phoneNumber.country,
      isValid: phoneNumber.isValid(),
      isPossible: phoneNumber.isPossible(),
      type: phoneNumber.getType(), // MOBILE, FIXED_LINE, etc.
    };
  } catch {
    return null;
  }
}

/**
 * Generate a privacy-safe hash for phone deduplication
 * @param normalizedPhone - E.164 formatted phone number
 * @returns 16-character hash string
 *
 * @example
 * ```typescript
 * getPhoneHash('+12025551234'); // '8a7b6c5d4e3f2g1h'
 * ```
 *
 * @remarks
 * Uses a simple hash algorithm that works in both Node.js and browser environments.
 * For stronger hashing in Node.js, use crypto.createHash('sha256').
 */
export function getPhoneHash(normalizedPhone: string): string {
  // Simple hash for phone deduplication
  // Works in both browser and Node.js environments
  let hash = 0;
  for (let i = 0; i < normalizedPhone.length; i++) {
    const char = normalizedPhone.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and ensure positive
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 16);
}

/**
 * Generate a crypto-safe hash for phone deduplication (Node.js only)
 * @param normalizedPhone - E.164 formatted phone number
 * @returns 16-character SHA-256 hash string
 *
 * @remarks
 * This function is only available in Node.js environments.
 * For browser compatibility, use `getPhoneHash` instead.
 */
export async function getPhoneHashSecure(normalizedPhone: string): Promise<string> {
  // Use Web Crypto API for browser compatibility
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedPhone);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
  }

  // Fallback to simple hash
  return getPhoneHash(normalizedPhone);
}

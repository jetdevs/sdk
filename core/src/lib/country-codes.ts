/**
 * Country Codes
 *
 * Common country codes for phone input components.
 */

export interface CountryCode {
  /** Phone country code (e.g., "+1") */
  code: string;
  /** ISO country code (e.g., "US") */
  country: string;
  /** Country flag emoji */
  flag: string;
  /** Country name */
  name?: string;
}

/**
 * Common country codes
 */
export const countryCodes: CountryCode[] = [
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+1', country: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+62', country: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+55', country: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: '+52', country: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: '+46', country: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: '+47', country: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: '+45', country: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: '+358', country: 'FI', flag: '🇫🇮', name: 'Finland' },
  { code: '+65', country: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: '+852', country: 'HK', flag: '🇭🇰', name: 'Hong Kong' },
  { code: '+64', country: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: '+353', country: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: '+41', country: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: '+43', country: 'AT', flag: '🇦🇹', name: 'Austria' },
  { code: '+48', country: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: '+351', country: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: '+32', country: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: '+7', country: 'RU', flag: '🇷🇺', name: 'Russia' },
];

// Legacy export for backward compatibility
export const COUNTRY_CODES_LEGACY = countryCodes;

/**
 * Get country by phone code
 */
export function getCountryByCode(code: string): CountryCode | undefined {
  return countryCodes.find((c) => c.code === code);
}

/**
 * Get country by ISO country code
 */
export function getCountryByISO(iso: string): CountryCode | undefined {
  return countryCodes.find((c) => c.country === iso.toUpperCase());
}

/**
 * Get default country (US)
 */
export function getDefaultCountry(): CountryCode {
  return countryCodes[0];
}

/**
 * Format phone number with country code
 */
export function formatPhoneWithCountry(
  phoneNumber: string,
  countryCode: string
): string {
  // Remove any existing country code or special characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  return `${countryCode}${cleaned}`;
}

/**
 * Parse phone number to extract country code and number
 */
export function parsePhoneNumber(
  phone: string
): { countryCode: string; number: string } | null {
  if (!phone) return null;

  // Try to match against known country codes
  for (const { code } of countryCodes) {
    if (phone.startsWith(code)) {
      return {
        countryCode: code,
        number: phone.slice(code.length),
      };
    }
  }

  // Default to treating the whole thing as the number
  return {
    countryCode: '+1',
    number: phone.replace(/\D/g, ''),
  };
}

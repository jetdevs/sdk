/**
 * Access code format helpers (p107 ACC-001, OQ2).
 *
 * Codes are stored normalized (`upper(trim(code))`) and matched
 * case-insensitively (`upper(code) = upper($1)`, unique index on `upper(code)`).
 */
import { randomInt } from 'node:crypto';

/** Accepted code shape (generated or admin-chosen vanity codes). Format only — no DB. */
export const CODE_RE = /^[A-Z0-9-]{4,32}$/;

/** Crockford base32 without the look-alikes 0/O/1/I (and U, per Crockford). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTVWXYZ';

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** True when `code` (after normalization) has a valid shape. */
export function isValidCodeFormat(code: string): boolean {
  return CODE_RE.test(normalizeCode(code));
}

export function generateCode(length = 8): string {
  if (!Number.isInteger(length) || length < 4 || length > 32) {
    throw new Error(`generateCode: length must be an integer in 4..32, got ${length}`);
  }
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

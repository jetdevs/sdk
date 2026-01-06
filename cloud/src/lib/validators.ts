/**
 * Input validators for SDK methods
 */

import { StorageError } from './errors';

/**
 * Validation error for invalid inputs
 */
export class ValidationError extends StorageError {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Validate that a buffer is not empty
 */
export function validateBuffer(buffer: Buffer | undefined | null, fieldName = 'buffer'): void {
  if (!buffer) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
  if (!Buffer.isBuffer(buffer)) {
    throw new ValidationError(`${fieldName} must be a Buffer`, fieldName);
  }
  if (buffer.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName);
  }
}

/**
 * Validate that a string is not empty
 */
export function validateString(value: string | undefined | null, fieldName: string): void {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
  if (value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName);
  }
}

/**
 * Validate a storage key format
 */
export function validateKey(key: string | undefined | null): void {
  validateString(key, 'key');

  // Check for invalid characters
  if (key!.includes('..')) {
    throw new ValidationError('key cannot contain ".."', 'key');
  }

  // Check max length (S3 limit is 1024 bytes)
  if (Buffer.byteLength(key!, 'utf8') > 1024) {
    throw new ValidationError('key exceeds maximum length of 1024 bytes', 'key');
  }
}

/**
 * Validate URL format
 */
export function validateUrl(url: string | undefined | null): void {
  validateString(url, 'url');

  try {
    new URL(url!);
  } catch {
    throw new ValidationError('url must be a valid URL', 'url');
  }
}

/**
 * Validate base64 string
 */
export function validateBase64(base64: string | undefined | null): void {
  validateString(base64, 'base64Data');

  // Remove data URL prefix if present
  const cleanBase64 = base64!.replace(/^data:[^;]+;base64,/, '');

  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(cleanBase64)) {
    throw new ValidationError('base64Data is not valid base64 encoded', 'base64Data');
  }
}

/**
 * Validate expires in value
 */
export function validateExpiresIn(expiresIn: number | undefined): void {
  if (expiresIn !== undefined) {
    if (typeof expiresIn !== 'number' || expiresIn <= 0) {
      throw new ValidationError('expiresIn must be a positive number', 'expiresIn');
    }
    // S3 max is 7 days (604800 seconds)
    if (expiresIn > 604800) {
      throw new ValidationError('expiresIn cannot exceed 604800 seconds (7 days)', 'expiresIn');
    }
  }
}

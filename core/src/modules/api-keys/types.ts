/**
 * API Keys Module - Types
 *
 * Type definitions for API key management.
 *
 * @module @yobolabs/core/api-keys
 */

/**
 * API Key record from database
 */
export interface ApiKeyRecord {
  id: number;
  orgId: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  rateLimit: number;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  createdBy: number | null;
}

/**
 * Data required to create a new API key
 */
export interface ApiKeyCreateData {
  orgId: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  rateLimit: number;
  expiresAt?: Date;
  createdBy: number;
}

/**
 * Data for updating an existing API key
 */
export interface ApiKeyUpdateData {
  name?: string;
  permissions?: string[];
  rateLimit?: number;
  expiresAt?: Date | null;
}

/**
 * API Key list item (excludes sensitive data)
 */
export interface ApiKeyListItem {
  id: number;
  name: string;
  keyPrefix: string;
  permissions: string[];
  rateLimit: number;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * Result of API key generation
 */
export interface ApiKeyGenerationResult {
  /** Full API key (shown only once during creation) */
  key: string;
  /** Key prefix for identification (first 16 chars) */
  keyPrefix: string;
  /** SHA-256 hash of full key for database storage */
  keyHash: string;
}

/**
 * Environment types for API keys
 */
export type ApiKeyEnvironment = 'live' | 'test';

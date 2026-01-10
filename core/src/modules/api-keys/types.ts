/**
 * API Keys Module - Types
 *
 * Type definitions for API key management.
 *
 * @module @jetdevs/core/api-keys
 */

/**
 * Permission resolution mode for API keys
 * - 'cached': Permissions stored in api_keys table (faster, updated on sync)
 * - 'fresh': Permissions fetched from role at runtime (accurate, bypasses cache)
 */
export type PermissionMode = 'cached' | 'fresh';

/**
 * API Key record from database
 */
export interface ApiKeyRecord {
  id: number;
  orgId: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  roleId: number | null;
  permissions: string[];
  /** Permission resolution mode (P2-SR-002) */
  permissionMode: PermissionMode;
  /** When permissions were last synced from role (P2-SR-002) */
  permissionsSyncedAt: Date | null;
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
  roleId?: number;
  permissions: string[];
  /** Permission resolution mode (defaults to 'cached') */
  permissionMode?: PermissionMode;
  /** When permissions were synced from role */
  permissionsSyncedAt?: Date | null;
  rateLimit: number;
  expiresAt?: Date;
  createdBy: number;
}

/**
 * Data for updating an existing API key
 */
export interface ApiKeyUpdateData {
  name?: string;
  roleId?: number | null;
  permissions?: string[];
  /** Permission resolution mode */
  permissionMode?: PermissionMode;
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
  roleId: number | null;
  roleName?: string;
  permissions: string[];
  /** Permission resolution mode */
  permissionMode?: PermissionMode;
  /** When permissions were last synced from role */
  permissionsSyncedAt?: Date | null;
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

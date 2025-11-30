/**
 * System Config Module - Types
 *
 * Type definitions for system configuration management.
 *
 * @module @yobolabs/core/system-config
 */

/**
 * System configuration record from database
 */
export interface SystemConfigRecord {
  id: number;
  configKey: string;
  configValue: string | null;
  valueType: string;
  category: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Data required to create a new system configuration
 */
export interface SystemConfigCreateData {
  configKey: string;
  configValue: string;
  valueType?: string;
  category?: string;
  description?: string;
  isSystem?: boolean;
}

/**
 * Data for updating a system configuration
 */
export interface SystemConfigUpdateData {
  configValue?: string;
  description?: string;
}

/**
 * Value types for system configuration
 */
export type SystemConfigValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Common configuration categories
 */
export type SystemConfigCategory =
  | 'general'
  | 'ai'
  | 'security'
  | 'llm_providers'
  | 'ai_prompts'
  | 'notification'
  | 'integration';

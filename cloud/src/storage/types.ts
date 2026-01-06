/**
 * Storage module type definitions
 */

/**
 * Options for file upload
 */
export interface UploadOptions {
  /** File content as Buffer */
  buffer: Buffer;
  /** Target key (path) in storage */
  key: string;
  /** MIME content type */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /** Access control */
  acl?: 'private' | 'public-read';
  /** Optional folder prefix */
  folder?: string;
}

/**
 * Simplified upload options for common use cases
 */
export interface SimpleUploadOptions {
  /** Optional folder prefix */
  folder?: string;
  /** MIME content type */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /** Access control */
  acl?: 'private' | 'public-read';
}

/**
 * Result of a successful upload
 */
export interface UploadResult {
  /** Operation success status */
  success: boolean;
  /** Public URL of uploaded file */
  url: string;
  /** Storage key */
  key: string;
  /** Bucket name */
  bucket: string;
  /** File size in bytes */
  size: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of a download operation
 */
export interface DownloadResult {
  /** Operation success status */
  success: boolean;
  /** File content */
  buffer?: Buffer;
  /** MIME content type */
  contentType?: string;
  /** File size in bytes */
  size?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for signed URL generation
 */
export interface SignedUrlOptions {
  /** URL expiration time in seconds (default: 3600) */
  expiresIn?: number;
  /** HTTP method for the signed URL */
  method?: 'GET' | 'PUT';
  /** Content type for PUT requests */
  contentType?: string;
}

/**
 * Result of list operation
 */
export interface ListResult {
  /** List of objects */
  objects: Array<{
    key: string;
    size: number;
    lastModified?: Date;
  }>;
  /** Truncation indicator */
  isTruncated: boolean;
  /** Continuation token for pagination */
  continuationToken?: string;
}

/**
 * Delete operation result
 */
export interface DeleteResult {
  /** Operation success status */
  success: boolean;
  /** Keys that were successfully deleted */
  deleted?: string[];
  /** Errors if any */
  errors?: Array<{
    key: string;
    error: string;
  }>;
}

/**
 * Configuration check result
 */
export interface ConfigCheckResult {
  /** Whether storage is properly configured */
  configured: boolean;
  /** Current environment (empty string if NODE_ENV not set) */
  environment: 'local' | 'development' | 'production' | '';
  /** Bucket name */
  bucket?: string;
  /** Region */
  region?: string;
  /** Error message if not configured */
  error?: string;
}

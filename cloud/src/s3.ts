/**
 * S3 Storage Operations
 *
 * Provides a complete set of S3 operations for file management:
 * - Upload files (binary, base64)
 * - Download files
 * - Delete files (single and batch)
 * - Generate presigned URLs for temporary access
 *
 * Supports configuration via environment variables or explicit config.
 */

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as crypto from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface S3ClientConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
}

export interface UploadFileParams {
  file: Buffer;
  fileName: string;
  contentType: string;
  path?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  data?: {
    buffer: Buffer;
    contentType: string;
  };
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  deletedCount?: number;
  errors?: Array<{ key: string; error: string }>;
}

// ============================================================================
// Configuration
// ============================================================================

// Read configuration from environment variables
function getEnvConfig(): S3ClientConfig {
  return {
    bucket:
      process.env.NEXT_PUBLIC_S3_BUCKET ||
      process.env.AWS_BUCKET_NAME ||
      "default-bucket",
    region:
      process.env.NEXT_PUBLIC_S3_REGION ||
      process.env.AWS_REGION ||
      "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT,
  };
}

// Singleton S3 client instance
let s3Client: S3Client | null = null;
let currentConfig: S3ClientConfig | null = null;

/**
 * Create a new S3 client with the given configuration
 */
export function createS3Client(config: S3ClientConfig): S3Client {
  const clientConfig: any = {
    region: config.region,
  };

  // Add credentials if provided
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  // Override with custom endpoint if provided (for S3-compatible services)
  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    clientConfig.forcePathStyle = true; // Required for most S3-compatible services
  }

  return new S3Client(clientConfig);
}

/**
 * Get or create the singleton S3 client instance
 * Uses environment variables for configuration
 */
export function getS3Client(): S3Client | null {
  if (!s3Client) {
    const config = getEnvConfig();

    if (!config.accessKeyId || !config.secretAccessKey) {
      console.warn("[S3] AWS credentials not configured. S3 operations will be disabled.");
      return null;
    }

    currentConfig = config;
    s3Client = createS3Client(config);
  }

  return s3Client;
}

/**
 * Check if S3 is properly configured
 */
export function isS3Configured(): boolean {
  return getS3Client() !== null;
}

/**
 * Get the current S3 configuration
 */
export const S3_CONFIG = {
  get bucket() {
    return currentConfig?.bucket || getEnvConfig().bucket;
  },
  get region() {
    return currentConfig?.region || getEnvConfig().region;
  },
  get publicUrl() {
    const config = currentConfig || getEnvConfig();
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  },
  get isConfigured() {
    return isS3Configured();
  },
};

// ============================================================================
// Upload Operations
// ============================================================================

/**
 * Upload a file to S3
 *
 * @param params - Upload parameters
 * @param params.file - File buffer to upload
 * @param params.fileName - Original file name
 * @param params.contentType - MIME type of the file
 * @param params.path - Optional path prefix (e.g., "org-123/documents")
 * @param params.metadata - Optional metadata to attach to the file
 * @returns Upload result with URL and key
 */
export async function uploadFileToS3(params: UploadFileParams): Promise<UploadResult> {
  const client = getS3Client();

  if (!client) {
    return {
      success: false,
      error: "S3 client not configured. Please set AWS credentials.",
    };
  }

  try {
    const { file, fileName, contentType, path = "", metadata = {} } = params;
    const config = getEnvConfig();

    // Generate unique key to prevent collisions
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString("hex");
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "-");
    const key = path
      ? `${path}/${timestamp}-${randomId}-${sanitizedFileName}`
      : `${timestamp}-${randomId}-${sanitizedFileName}`;

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      Metadata: metadata,
    });

    await client.send(uploadCommand);

    // Construct public URL
    const url = `${S3_CONFIG.publicUrl}/${key}`;

    console.log(`[S3] Successfully uploaded: ${url}`);

    return {
      success: true,
      url,
      key,
    };
  } catch (error) {
    console.error("[S3] Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload file",
    };
  }
}

/**
 * Upload an image from base64 data
 *
 * @param base64Data - Base64 encoded image data (with or without data URL prefix)
 * @param fileName - Desired file name
 * @param path - Optional path prefix
 * @returns Upload result with URL and key
 */
export async function uploadBase64Image(
  base64Data: string,
  fileName: string,
  path: string = "images"
): Promise<UploadResult> {
  try {
    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // Determine content type from data URL or default to png
    let contentType = "image/png";
    const matches = base64Data.match(/^data:(image\/\w+);base64,/);
    if (matches && matches[1]) {
      contentType = matches[1];
    }

    return uploadFileToS3({
      file: buffer,
      fileName,
      contentType,
      path,
      metadata: {
        uploadedAt: new Date().toISOString(),
        source: "base64",
      },
    });
  } catch (error) {
    console.error("[S3] Base64 upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload base64 image",
    };
  }
}

// ============================================================================
// Download Operations
// ============================================================================

/**
 * Download a file from S3
 *
 * @param key - S3 object key
 * @returns Download result with file buffer and content type
 */
export async function downloadFileFromS3(key: string): Promise<DownloadResult> {
  const client = getS3Client();

  if (!client) {
    return {
      success: false,
      error: "S3 client not configured. Please set AWS credentials.",
    };
  }

  try {
    const config = getEnvConfig();

    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      return {
        success: false,
        error: "File body not found",
      };
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log(`[S3] Successfully downloaded: ${key}`);

    return {
      success: true,
      data: {
        buffer,
        contentType: response.ContentType || "application/octet-stream",
      },
    };
  } catch (error: any) {
    console.error(`[S3] Download error for ${key}:`, error);

    // Check if it's a 404 error
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return {
        success: false,
        error: "File not found",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to download file",
    };
  }
}

/**
 * Generate a presigned URL for temporary access to a file
 *
 * @param key - S3 object key
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 * @returns Presigned URL or null if generation fails
 */
export async function getPresignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const client = getS3Client();

  if (!client) {
    console.warn("[S3] Cannot generate presigned URL - S3 client not configured");
    return null;
  }

  try {
    const config = getEnvConfig();

    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    const url = await getSignedUrl(client as any, command, { expiresIn });
    return url;
  } catch (error) {
    console.error("[S3] Error generating presigned URL:", error);
    return null;
  }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a single file from S3
 *
 * @param key - S3 object key to delete
 * @returns Delete result
 */
export async function deleteFileFromS3(key: string): Promise<DeleteResult> {
  const client = getS3Client();

  if (!client) {
    return {
      success: false,
      errors: [{ key, error: "S3 client not configured" }],
    };
  }

  try {
    const config = getEnvConfig();

    const deleteCommand = new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    await client.send(deleteCommand);
    console.log(`[S3] Successfully deleted: ${key}`);

    return { success: true, deletedCount: 1 };
  } catch (error) {
    console.error(`[S3] Delete error for ${key}:`, error);
    return {
      success: false,
      errors: [
        { key, error: error instanceof Error ? error.message : "Failed to delete file" },
      ],
    };
  }
}

/**
 * Delete multiple files from S3
 *
 * @param keys - Array of S3 object keys to delete
 * @returns Delete result with count and any errors
 */
export async function deleteMultipleFilesFromS3(keys: string[]): Promise<DeleteResult> {
  const client = getS3Client();

  if (!client) {
    return {
      success: false,
      errors: keys.map((key) => ({ key, error: "S3 client not configured" })),
    };
  }

  if (keys.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  try {
    const config = getEnvConfig();

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    });

    const response = await client.send(deleteCommand);

    if (response.Errors && response.Errors.length > 0) {
      return {
        success: false,
        deletedCount: response.Deleted?.length || 0,
        errors: response.Errors.map((err) => ({
          key: err.Key || "",
          error: err.Message || "Unknown error",
        })),
      };
    }

    console.log(`[S3] Successfully deleted ${keys.length} files`);
    return { success: true, deletedCount: response.Deleted?.length || keys.length };
  } catch (error) {
    console.error("[S3] Batch delete error:", error);
    return {
      success: false,
      deletedCount: 0,
      errors: keys.map((key) => ({
        key,
        error: error instanceof Error ? error.message : "Failed to delete files",
      })),
    };
  }
}

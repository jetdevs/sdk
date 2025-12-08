/**
 * @yobolabs/cloud - Cloud service integrations
 *
 * Provides S3 storage operations for file upload, download, and management.
 * Supports multi-tenant configurations with org-based path prefixes.
 */

export {
  // S3 Client and Configuration
  createS3Client,
  getS3Client,
  isS3Configured,
  S3_CONFIG,
  type S3ClientConfig,

  // Upload Operations
  uploadFileToS3,
  uploadBase64Image,
  type UploadFileParams,
  type UploadResult,

  // Download Operations
  downloadFileFromS3,
  getPresignedUrl,
  type DownloadResult,

  // Delete Operations
  deleteFileFromS3,
  deleteMultipleFilesFromS3,
  type DeleteResult,
} from './s3';

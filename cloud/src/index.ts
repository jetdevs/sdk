/**
 * @jetdevs/cloud - Cloud service integrations
 *
 * Provides S3 storage operations for file upload, download, and management.
 * Supports multi-tenant configurations with org-based path prefixes.
 */

export {
    // S3 Client and Configuration
    createS3Client,
    // Delete Operations
    deleteFileFromS3,
    deleteMultipleFilesFromS3,
    // Download Operations
    downloadFileFromS3,
    getPresignedUrl, getS3Client,
    isS3Configured, S3_CONFIG, uploadBase64Image,
    // Upload Operations
    uploadFileToS3, type DeleteResult, type DownloadResult, type S3ClientConfig, type UploadFileParams,
    type UploadResult
} from './s3';


// Presigned direct-to-S3 uploads. Also available at `@jetdevs/cloud/storage`;
// surfaced here too because every consumer that hand-rolled this was importing
// from the package root.
export { presignUpload, PresignValidationError } from './storage/presign';
export type { PresignUploadInput, PresignedUpload } from './storage/presign';

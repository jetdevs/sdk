/**
 * Storage module exports
 */

// Types
export type {
  UploadOptions,
  SimpleUploadOptions,
  UploadResult,
  DownloadResult,
  SignedUrlOptions,
  ListResult,
  DeleteResult,
  ConfigCheckResult,
} from './types';

// Adapters
export type { StorageAdapter } from './adapters/interface';
export { S3Adapter } from './adapters/s3.adapter';

// Client
export { StorageClient } from './client';

// Factory
export {
  createStorageClient,
  getStorageClient,
  resetStorageClient,
  storage,
} from './factory';

// Presigned direct-to-S3 uploads (default AWS provider chain — no Credentials
// Service required). See ./presign for why this sits beside StorageClient.
export { presignUpload, PresignValidationError } from './presign';
export type { PresignUploadInput, PresignedUpload } from './presign';

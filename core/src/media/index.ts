/**
 * Client-side media handling.
 *
 * The browser half of the platform's image pipeline: compress a file down to
 * something the network and the downstream channels will accept, then PUT it
 * straight to object storage over a presigned URL. The server half — minting
 * that signature — lives in `@jetdevs/cloud` (`presignUpload`).
 *
 * Both halves came from yobo, which had solved this properly while every other
 * app either re-implemented a thinner version or shipped uncompressed originals.
 *
 * @module @jetdevs/core/media
 */

// Compression
export {
  CompressionQuality,
  analyzeImage,
  batchCompressImages,
  calculateSavings,
  compressImage,
  formatFileSize,
} from './image-compression';
export type { CompressionProgress, CompressionResult } from './image-compression';

// Direct-to-storage upload
export { uploadViaPresignedUrl } from './upload';
export type {
  PresignedTarget,
  UploadViaPresignedOptions,
  UploadViaPresignedResult,
} from './upload';

/**
 * Client-side image compression.
 *
 * Lifted verbatim from yobo's `lib/image-compression.ts`, which is the most
 * developed image pipeline in the platform and the only one that had solved
 * this properly: analyse the image, then walk DOWN a quality/dimension ladder
 * until it fits the target, rather than compressing once at a fixed quality and
 * hoping. It also converts a transparent PNG to JPEG only when transparency is
 * genuinely not needed, which is where naive compressors either bloat the file
 * or destroy an alpha channel someone wanted.
 *
 * This belongs in the SDK because the constraint is universal: browsers hand
 * you 12 MB phone photos, Vercel rejects request bodies over 4.5 MB, and
 * WhatsApp refuses to fetch an image over 5 MB. Every app that accepts an
 * uploaded image hits all three, and only one app had the answer.
 *
 * `browser-image-compression` is an OPTIONAL peer dependency, imported
 * dynamically: an app that never compresses should not carry the bundle, and a
 * server-side import of this module must not explode.
 *
 * @module @jetdevs/core/media
 */

type CompressFn = (
  file: File,
  options: Record<string, unknown>,
) => Promise<File | Blob>;

/**
 * Resolve the optional compressor.
 *
 * Throws a NAMED error rather than a module-not-found stack, because the fix
 * ("install browser-image-compression") is not otherwise obvious from the
 * failure.
 */
async function loadCompressor(): Promise<CompressFn> {
  try {
    const mod = await import('browser-image-compression');
    return (mod.default ?? mod) as unknown as CompressFn;
  } catch {
    throw new Error(
      '[@jetdevs/core/media] `browser-image-compression` is required for compressImage(). ' +
        'Install it in the consuming app: pnpm add browser-image-compression',
    );
  }
}

/**
 * Image compression quality presets
 */
export enum CompressionQuality {
  HIGH = 'high',        // 高质量：0.92 quality, larger file size
  BALANCED = 'balanced', // 平衡：0.85 quality, balanced
  LOW = 'low'           // 小文件：0.75 quality, smallest file size
}

/**
 * Compression options based on quality preset
 */
const QUALITY_PRESETS = {
  [CompressionQuality.HIGH]: {
    quality: 0.92,
    maxSizeMB: 4,
    maxWidthOrHeight: 4096,
    useWebWorker: true,
  },
  [CompressionQuality.BALANCED]: {
    quality: 0.85,
    maxSizeMB: 4,
    maxWidthOrHeight: 3072,
    useWebWorker: true,
  },
  [CompressionQuality.LOW]: {
    quality: 0.75,
    maxSizeMB: 4,
    maxWidthOrHeight: 2560,
    useWebWorker: true,
  },
};

/**
 * Multi-stage compression strategy configuration
 */
const COMPRESSION_STAGES = [
  { quality: 0.95, maxWidthOrHeight: 4096, targetSizeMB: 4 },
  { quality: 0.90, maxWidthOrHeight: 3072, targetSizeMB: 4 },
  { quality: 0.85, maxWidthOrHeight: 2560, targetSizeMB: 4 },
  { quality: 0.80, maxWidthOrHeight: 2048, targetSizeMB: 4 },
];

export interface CompressionResult {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  quality: number;
  dimensions?: { width: number; height: number };
}

export interface CompressionProgress {
  percent: number;
  stage: string;
  message: string;
}

/**
 * Analyzes image content to determine optimal compression strategy
 */
export async function analyzeImage(file: File): Promise<{
  isPhoto: boolean;
  hasTransparency: boolean;
  originalDimensions: { width: number; height: number };
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Sample a small portion of the image to detect transparency
        canvas.width = Math.min(100, img.width);
        canvas.height = Math.min(100, img.height);
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        let hasTransparency = false;

        if (imageData) {
          // Check for transparency in alpha channel
          for (let i = 3; i < imageData.data.length; i += 4) {
            if (imageData.data[i]! < 255) {
              hasTransparency = true;
              break;
            }
          }
        }

              // Determine if it's a photo based on file type and characteristics
        const isPhoto = file.type === 'image/jpeg' ||
                       file.type === 'image/jpg' ||
                       (!hasTransparency && file.size > 500000); // Non-transparent large files are likely photos

        resolve({
          isPhoto,
          hasTransparency,
          originalDimensions: { width: img.width, height: img.height }
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Intelligent image compression with multi-stage strategy
 */
export async function compressImage(
  file: File,
  options: {
    quality?: CompressionQuality;
    maxSizeMB?: number;
    onProgress?: (progress: CompressionProgress) => void;
    preserveTransparency?: boolean;
  } = {}
): Promise<CompressionResult> {
  const {
    quality = CompressionQuality.HIGH,
    maxSizeMB = 4,
    onProgress,
    preserveTransparency = true,
  } = options;

  const originalSize = file.size;
  const originalSizeMB = originalSize / (1024 * 1024);

  // If file is already under target size with some margin, return as is
  if (originalSizeMB <= maxSizeMB * 0.95) {
    return {
      compressedFile: file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      quality: 1,
    };
  }

  // Analyze image to determine best compression strategy
  onProgress?.({
    percent: 10,
    stage: 'analyzing',
    message: 'Analyzing image...'
  });

  const imageInfo = await analyzeImage(file);

  // Get quality preset
  const preset = QUALITY_PRESETS[quality];
  let compressedFile: File = file;
  let currentQuality = preset.quality;
  let finalQuality = currentQuality;

  // Multi-stage compression for large files
  if (originalSizeMB > maxSizeMB) {
    const stages = originalSizeMB > 10 ? COMPRESSION_STAGES : COMPRESSION_STAGES.slice(1);

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (!stage) continue;
      onProgress?.({
        percent: 20 + (i * 20),
        stage: `stage-${i + 1}`,
        message: `Compressing...`
      });

      try {
        // Handle format conversion for better compression
        const shouldConvertToJPEG = !preserveTransparency &&
                                    imageInfo.hasTransparency &&
                                    file.type === 'image/png' &&
                                    originalSizeMB > 5;

        const compressionOptions: any = {
          maxSizeMB: stage.targetSizeMB,
          maxWidthOrHeight: stage.maxWidthOrHeight,
          useWebWorker: true,
          initialQuality: stage.quality,
        };

        // Convert PNG to JPEG for photos without transparency requirement
        if (shouldConvertToJPEG) {
          compressionOptions.fileType = 'image/jpeg';
        }

        const imageCompression = await loadCompressor();
        const tempCompressed = await imageCompression(compressedFile, compressionOptions);
        // Ensure the compressed file keeps the correct name
        compressedFile = new File(
          [tempCompressed],
          file.name,  // Keep original file name
          { type: tempCompressed.type || file.type }
        );
        finalQuality = stage.quality;

        // Check if we've reached target size
        if (compressedFile.size / (1024 * 1024) <= maxSizeMB) {
          break;
        }
      } catch (error) {
        console.warn(`Compression stage ${i + 1} failed, trying next stage:`, error);
        continue;
      }
    }
  } else {
    // Single-stage compression for smaller files
    onProgress?.({
      percent: 50,
      stage: 'compressing',
      message: 'Optimizing...'
    });

    try {
      const imageCompression = await loadCompressor();
      const tempCompressed = await imageCompression(file, {
        ...preset,
        maxSizeMB,
      });
      // Ensure the compressed file keeps the correct name
      compressedFile = new File(
        [tempCompressed],
        file.name,  // Keep original file name
        { type: tempCompressed.type || file.type }
      );
      finalQuality = preset.quality;
    } catch (error) {
      console.error('Compression failed:', error);
      // Return original file if compression fails
      compressedFile = file;
      finalQuality = 1;
    }
  }

  // Get final dimensions
  const finalImageInfo = await analyzeImage(compressedFile);

  onProgress?.({
    percent: 100,
    stage: 'complete',
    message: 'Complete'
  });

  return {
    compressedFile,
    originalSize,
    compressedSize: compressedFile.size,
    compressionRatio: compressedFile.size / originalSize,
    quality: finalQuality,
    dimensions: finalImageInfo.originalDimensions,
  };
}

/**
 * Batch compress multiple images
 */
export async function batchCompressImages(
  files: File[],
  options: {
    quality?: CompressionQuality;
    maxSizeMB?: number;
    maxConcurrent?: number;
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void;
    onFileComplete?: (result: CompressionResult, index: number) => void;
  } = {}
): Promise<CompressionResult[]> {
  const {
    quality = CompressionQuality.HIGH,
    maxSizeMB = 4,
    maxConcurrent = 3,
    onProgress,
    onFileComplete,
  } = options;

  const results: CompressionResult[] = [];
  const queue = [...files];
  let currentIndex = 0;

  // Process files in batches to avoid memory issues
  while (queue.length > 0) {
    const batch = queue.splice(0, maxConcurrent);
    const batchPromises = batch.map(async (file, batchIndex) => {
      const fileIndex = currentIndex + batchIndex;

      onProgress?.({
        current: fileIndex + 1,
        total: files.length,
        currentFile: file.name,
      });

      const result = await compressImage(file, { quality, maxSizeMB });
      onFileComplete?.(result, fileIndex);

      return result;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    currentIndex += batch.length;
  }

  return results;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Calculate compression savings
 */
export function calculateSavings(originalSize: number, compressedSize: number): {
  savedBytes: number;
  savedPercentage: number;
  savedFormatted: string;
} {
  const savedBytes = originalSize - compressedSize;
  const savedPercentage = ((savedBytes / originalSize) * 100);

  return {
    savedBytes,
    savedPercentage,
    savedFormatted: formatFileSize(savedBytes),
  };
}
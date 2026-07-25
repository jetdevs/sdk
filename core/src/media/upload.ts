/**
 * Client-side direct-to-S3 upload over a presigned PUT.
 *
 * Generalised from yobo's `lib/image-upload.ts`. That version hard-coded a
 * `fetch("/api/upload/presigned")`, which is why it could not be reused by the
 * commerce app (whose presign arrives over tRPC from a separate Fastify
 * engine) — so the flow was written a second time. Here the caller supplies
 * how to GET a signature; everything after that is identical everywhere.
 *
 * yobo's reasons for direct-to-S3 hold for every consumer and are worth
 * restating, because the "just POST it to the server" alternative looks simpler
 * right up until it fails:
 *   - the bytes stay off the app server, dodging Vercel's ~4.5 MB body limit;
 *   - the file is shipped once (browser → S3), not twice (browser → app → S3);
 *   - nothing has to base64 a multi-megabyte file into a JSON payload, which
 *     is what freezes the UI thread and bloats a tRPC request.
 *
 * @module @jetdevs/core/media
 */

export interface PresignedTarget {
  /** Presigned PUT URL. */
  uploadUrl: string;
  /** Stored object key — persist THIS, not a composed URL. */
  key: string;
  /** Headers the PUT must send for the signature to verify. */
  headers?: Record<string, string>;
  /** Optional public URL, for an immediate preview. */
  publicUrl?: string | null;
}

export interface UploadViaPresignedOptions {
  /**
   * Obtain a presigned target for this file. However the app gets one — a REST
   * route, a tRPC mutation, a server action — is its business.
   */
  getPresignedTarget: (file: File) => Promise<PresignedTarget>;
  /** Progress callback. Fires at 0 and 1; presigned PUTs expose no true progress via fetch. */
  onProgress?: (progress: number) => void;
  /** Abort the request after this many ms. Default 60s, matching yobo's helper. */
  timeoutMs?: number;
}

export interface UploadViaPresignedResult {
  success: boolean;
  /** Object key, on success. */
  key?: string;
  /** Public URL when the presign supplied one. */
  url?: string | null;
  /** Human-readable failure, for surfacing to the user. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Upload a File to object storage through a presigned PUT.
 *
 * Returns a result object rather than throwing: an upload failing is an
 * expected outcome the UI has to render, not an exception. Callers should
 * surface `error` rather than silently proceeding — a swallowed failure here
 * shows the user an optimistic preview of an image that does not exist.
 */
export async function uploadViaPresignedUrl(
  file: File,
  options: UploadViaPresignedOptions,
): Promise<UploadViaPresignedResult> {
  const { getPresignedTarget, onProgress, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!file) return { success: false, error: 'No file provided' };

  try {
    onProgress?.(0);

    const target = await getPresignedTarget(file);
    if (!target?.uploadUrl || !target?.key) {
      return { success: false, error: 'Invalid presigned URL response' };
    }

    const res = await fetch(target.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: target.headers ?? {
        'Content-Type': file.type || 'application/octet-stream',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return { success: false, error: `Upload failed (${res.status} ${res.statusText})` };
    }

    onProgress?.(1);
    return { success: true, key: target.key, url: target.publicUrl ?? null };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { success: false, error: 'Upload timed out' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

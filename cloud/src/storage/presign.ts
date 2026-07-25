/**
 * Presigned direct-to-S3 uploads.
 *
 * Why this exists alongside `StorageClient.getSignedUrl`: that client resolves
 * credentials through the Credentials Service and THROWS when one is not
 * reachable. Plenty of deployments have no such service — a Fastify container
 * on an instance role, a Next app with static env keys, a local dev box with a
 * profile — so every app that needed a presigned upload reached past the SDK
 * and hand-rolled one against the *deprecated* `getS3Client`. That is why the
 * same forty lines existed in yobo, slides, the commerce engine and others.
 *
 * This helper takes the other path: the AWS **default provider chain** (env
 * keys, shared profile, instance/task role, web identity), with explicit
 * credentials only when passed. It is the SDK's answer for the common case,
 * and it does not compete with the Credentials-Service client for the case
 * that has one.
 *
 * The upload is two-phase by design — sign, then let the browser PUT straight
 * to S3. Bytes never transit the app server, which is what keeps a 5 MB photo
 * out of a serverless function's memory and off the 4.5 MB request-body limit.
 *
 * @module @jetdevs/cloud/storage
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/** Thrown for a caller-fixable rejection; carries a stable `code`. */
export class PresignValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PresignValidationError';
    this.code = code;
  }
}

export interface PresignUploadInput {
  /** Original filename — used only for the extension and a readable key tail. */
  filename: string;
  /** MIME type. Checked against `allowedContentTypes` before anything is signed. */
  contentType: string;
  /**
   * Declared size. Checked BEFORE signing so an oversized file is rejected in
   * a round trip rather than after the user has uploaded all of it. It is a
   * client-supplied number and cannot be enforced on a presigned PUT — treat it
   * as a UX guard, not a security control.
   */
  sizeBytes?: number;
  /** Key namespace (no leading/trailing slash). Ignored when `key` is given. */
  folder?: string;
  /**
   * Exact key to sign, bypassing key minting.
   *
   * Callers that accept a key from an untrusted client MUST validate it first:
   * a client-chosen key is a client-chosen path into someone else's namespace.
   * Prefer letting this helper mint one.
   */
  key?: string;
  /** Short prefix on the minted key (e.g. `img`, `vid`). */
  keyPrefix?: string;
  /**
   * Append a slug of the filename to the minted key, so a human reading a
   * bucket listing can tell a pizza from a receipt. Default true.
   *
   * Set false where an existing key shape must be preserved exactly — the uuid
   * already guarantees uniqueness, so this only affects readability.
   */
  includeFilenameInKey?: boolean;
  bucket?: string;
  region?: string;
  /** S3-compatible endpoint (MinIO, Spaces). Unset = real AWS. */
  endpoint?: string;
  /** Explicit credentials. Omit to use the AWS default provider chain. */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Signature lifetime in seconds. Default 300 — the browser uses it now or not at all. */
  expiresIn?: number;
  /** Upload ceiling in bytes. Default 10 MB. */
  maxBytes?: number;
  /** Permitted MIME types. Default: the common web image set. */
  allowedContentTypes?: string[];
  /**
   * Public origin the key hangs off, for the returned `publicUrl`. Defaults to
   * the virtual-hosted bucket URL. Prefer passing a CDN origin so no S3
   * hostname reaches a customer.
   */
  publicBaseUrl?: string;
}

export interface PresignedUpload {
  /** Persist THIS, not `publicUrl` — see the note on `publicUrl`. */
  key: string;
  /** Single-use presigned PUT target. */
  uploadUrl: string;
  /** Headers the PUT must send for the signature to verify. */
  headers: Record<string, string>;
  /**
   * Where the object will be readable once the PUT lands.
   *
   * Convenience for an immediate preview — storing it is how a bucket hostname
   * ends up baked into a database and a re-home becomes a data migration.
   * Store `key` and compose the URL at read time.
   */
  publicUrl: string;
  contentType: string;
  expiresIn: number;
  /** ISO-8601 expiry of the signature. */
  expiresAt: string;
}

const DEFAULT_ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_EXPIRES_IN = 300;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
};

function envBucket(): string | undefined {
  return process.env.NEXT_PUBLIC_S3_BUCKET || process.env.AWS_BUCKET_NAME;
}

function envRegion(): string {
  return process.env.NEXT_PUBLIC_S3_REGION || process.env.AWS_REGION || 'us-east-1';
}

/** Slug of the filename stem — purely so a bucket listing is readable by a human. */
function slugifyName(filename: string): string {
  const stem = filename.replace(/\.[^.]*$/, '');
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'file';
}

function extensionFor(contentType: string, filename: string): string {
  const known = EXTENSION_BY_TYPE[contentType];
  if (known) return known;
  const fromName = filename.split('.').pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : 'bin';
}

/**
 * Mint a presigned PUT for a single object.
 *
 * @throws {PresignValidationError} `no_bucket`, `unsupported_media_type`, `file_too_large`
 */
export async function presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
  const bucket = input.bucket || envBucket();
  if (!bucket) {
    throw new PresignValidationError(
      'no_bucket',
      'No S3 bucket configured (pass `bucket`, or set AWS_BUCKET_NAME)',
    );
  }

  const region = input.region || envRegion();
  const expiresIn = input.expiresIn ?? DEFAULT_EXPIRES_IN;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowed = input.allowedContentTypes ?? DEFAULT_ALLOWED;
  const contentType = input.contentType.trim().toLowerCase();

  if (!allowed.includes(contentType)) {
    throw new PresignValidationError(
      'unsupported_media_type',
      `Content type must be one of: ${allowed.join(', ')}`,
    );
  }
  if (input.sizeBytes !== undefined && input.sizeBytes > maxBytes) {
    throw new PresignValidationError(
      'file_too_large',
      `File size (${(input.sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds the ${(
        maxBytes /
        1024 /
        1024
      ).toFixed(0)}MB limit`,
    );
  }

  // A uuid rather than the filename: filenames collide, carry unicode and
  // spaces, and let one upload silently overwrite another.
  const key =
    input.key ??
    [
      (input.folder || '').replace(/^\/+|\/+$/g, ''),
      `${input.keyPrefix ? `${input.keyPrefix}-` : ''}${randomUUID()}${
        input.includeFilenameInKey === false ? '' : `-${slugifyName(input.filename)}`
      }.${extensionFor(contentType, input.filename)}`,
    ]
      .filter(Boolean)
      .join('/');

  const client = new S3Client({
    region,
    ...(input.endpoint ? { endpoint: input.endpoint, forcePathStyle: true } : {}),
    // Passing `credentials: undefined` would DISABLE the default provider
    // chain, so the key is omitted entirely rather than set to undefined.
    ...(input.credentials ? { credentials: input.credentials } : {}),
  });

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn },
  );

  const base = (
    input.publicBaseUrl ||
    (input.endpoint
      ? `${input.endpoint.replace(/\/+$/, '')}/${bucket}`
      : `https://${bucket}.s3.${region}.amazonaws.com`)
  ).replace(/\/+$/, '');

  return {
    key,
    uploadUrl,
    headers: { 'Content-Type': contentType },
    publicUrl: `${base}/${key}`,
    contentType,
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

# @yobolabs/cloud

AWS S3 storage SDK for Yobo Platform. Provides a clean, typed interface for S3 file operations.

## Features

- **File Upload**: Upload files with progress tracking and metadata
- **File Download**: Download files as buffers
- **Presigned URLs**: Generate temporary access URLs
- **File Deletion**: Delete single or multiple files
- **Multi-tenant Support**: Path-based organization for tenant isolation

## Installation

```bash
pnpm add @yobolabs/cloud
```

## Configuration

Set these environment variables:

```bash
# Required
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Optional (with defaults)
AWS_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET=your-bucket
S3_ENDPOINT=https://custom-endpoint.com  # For S3-compatible services
```

## Usage

### Upload Files

```typescript
import { uploadFileToS3 } from '@yobolabs/cloud';

const result = await uploadFileToS3({
  file: buffer,
  fileName: 'document.pdf',
  contentType: 'application/pdf',
  path: 'org-123/documents',  // Optional path prefix
  metadata: {
    uploadedBy: 'user-456',
    category: 'reports',
  },
});

if (result.success) {
  console.log('URL:', result.url);
  console.log('Key:', result.key);
}
```

### Upload Base64 Images

```typescript
import { uploadBase64Image } from '@yobolabs/cloud';

const result = await uploadBase64Image(
  'data:image/png;base64,iVBORw0KGgo...',
  'avatar.png',
  'org-123/avatars'
);
```

### Download Files

```typescript
import { downloadFileFromS3 } from '@yobolabs/cloud';

const result = await downloadFileFromS3('org-123/documents/file.pdf');

if (result.success && result.data) {
  // result.data.buffer - File content as Buffer
  // result.data.contentType - MIME type
}
```

### Generate Presigned URLs

```typescript
import { getPresignedUrl } from '@yobolabs/cloud';

// URL valid for 1 hour (default)
const url = await getPresignedUrl('org-123/documents/file.pdf');

// URL valid for 24 hours
const longUrl = await getPresignedUrl('org-123/documents/file.pdf', 86400);
```

### Delete Files

```typescript
import { deleteFileFromS3, deleteMultipleFilesFromS3 } from '@yobolabs/cloud';

// Delete single file
const result = await deleteFileFromS3('org-123/documents/file.pdf');

// Delete multiple files
const batchResult = await deleteMultipleFilesFromS3([
  'org-123/documents/file1.pdf',
  'org-123/documents/file2.pdf',
]);
```

### Check Configuration

```typescript
import { isS3Configured, S3_CONFIG } from '@yobolabs/cloud';

if (isS3Configured()) {
  console.log('Bucket:', S3_CONFIG.bucket);
  console.log('Region:', S3_CONFIG.region);
  console.log('Public URL:', S3_CONFIG.publicUrl);
}
```

## TypeScript Types

```typescript
import type {
  UploadFileParams,
  UploadResult,
  DownloadResult,
  DeleteResult,
  S3ClientConfig,
} from '@yobolabs/cloud';
```

## Multi-Tenant Pattern

Organize files by organization ID for tenant isolation:

```typescript
const uploadPath = `${orgId}/knowledge-bases/${kbId}`;

await uploadFileToS3({
  file: buffer,
  fileName: 'document.pdf',
  contentType: 'application/pdf',
  path: uploadPath,
});
```

## Error Handling

All functions return result objects with success/error information:

```typescript
const result = await uploadFileToS3({ ... });

if (!result.success) {
  console.error('Upload failed:', result.error);
}
```

## S3-Compatible Services

For services like MinIO, DigitalOcean Spaces, or Cloudflare R2:

```bash
S3_ENDPOINT=https://your-endpoint.com
```

The SDK automatically enables path-style access for custom endpoints.

## License

PRIVATE - Proprietary and confidential

/**
 * SDK Configuration
 *
 * Configuration for connecting to Credentials Service.
 * Credentials are fetched dynamically via STS temporary credentials.
 */

import { z } from 'zod';

/**
 * SDK configuration schema
 */
export const sdkConfigSchema = z.object({
  credentialsApiUrl: z.string().min(1),
  apiKey: z.string().min(1),
});

export type SdkConfig = z.infer<typeof sdkConfigSchema>;

/**
 * AWS credentials type (returned from Credentials Service)
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string; // Required for STS temporary credentials
  bucket: string;
  region: string;
  endpoint?: string;
  publicUrl?: string;
}

let cachedConfig: SdkConfig | null = null;

/**
 * Get SDK configuration from environment variables
 */
export function getSdkConfig(): SdkConfig {
  if (cachedConfig) return cachedConfig;

  const result = sdkConfigSchema.safeParse({
    credentialsApiUrl: process.env.YOBO_SDK_CREDENTIALS_API_URL,
    apiKey: process.env.YOBO_SDK_API_KEY,
  });

  if (!result.success) {
    throw new Error(
      'SDK configuration required:\n' +
        '- YOBO_SDK_CREDENTIALS_API_URL (e.g., http://localhost:3001)\n' +
        '- YOBO_SDK_API_KEY (e.g., sk_live_xxx)'
    );
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Reset cached config (for testing)
 */
export function resetSdkConfig(): void {
  cachedConfig = null;
}

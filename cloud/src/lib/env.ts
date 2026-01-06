/**
 * Environment detection utilities
 */

export type YoboEnvironment = 'production' | 'development' | 'local' | '';

/**
 * Detect the current environment based on NODE_ENV.
 * Returns empty string if not set or invalid.
 */
export function detectEnvironment(): YoboEnvironment {
  const envValue = process.env.NODE_ENV;

  if (!envValue) {
    return '';
  }

  const env = envValue.toLowerCase();

  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'development' || env === 'dev') return 'development';
  if (env === 'local' || env === 'test') return 'local';

  return '';
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return detectEnvironment() === 'production';
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return detectEnvironment() === 'development';
}

/**
 * Check if running in local environment
 */
export function isLocal(): boolean {
  return detectEnvironment() === 'local';
}

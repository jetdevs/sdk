/**
 * Security Middleware Types
 *
 * Type definitions for the security middleware factory.
 */

/**
 * X-Frame-Options directive values
 */
export type XFrameOptions = 'DENY' | 'SAMEORIGIN';

/**
 * Cross-Origin-Embedder-Policy values
 */
export type COEPPolicy = 'require-corp' | 'credentialless' | 'unsafe-none';

/**
 * Cross-Origin-Opener-Policy values
 */
export type COOPPolicy = 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none';

/**
 * Cross-Origin-Resource-Policy values
 */
export type CORPPolicy = 'same-origin' | 'same-site' | 'cross-origin';

/**
 * CSP directive names
 */
export type CSPDirective =
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'font-src'
  | 'img-src'
  | 'media-src'
  | 'connect-src'
  | 'frame-src'
  | 'worker-src'
  | 'child-src'
  | 'object-src'
  | 'base-uri'
  | 'form-action'
  | 'frame-ancestors'
  | 'report-uri'
  | 'report-to';

/**
 * Cache pattern configuration
 */
export interface CachePatterns {
  /**
   * Cache-Control for API responses (default: varies by endpoint)
   */
  api?: string;

  /**
   * Cache-Control for static assets (default: 'public, max-age=31536000, immutable')
   */
  static?: string;

  /**
   * Cache-Control for dynamic pages (default: 'no-store, no-cache, must-revalidate')
   */
  dynamic?: string;

  /**
   * Cache-Control for Next.js static assets (default: same as static)
   */
  nextStatic?: string;
}

/**
 * Security middleware configuration
 */
export interface SecurityMiddlewareConfig {
  /**
   * Allowed origins for CORS and CSP form-action
   * @default [current origin]
   */
  allowedOrigins?: string[];

  /**
   * Custom CSP directives (merged with defaults)
   */
  cspDirectives?: Partial<Record<CSPDirective, string[]>>;

  /**
   * Enable HTTP Strict Transport Security
   * @default true in production
   */
  enableHSTS?: boolean;

  /**
   * HSTS max-age in seconds
   * @default 31536000 (1 year)
   */
  hstsMaxAge?: number;

  /**
   * Enable X-Frame-Options header
   * @default true
   */
  enableXFrameOptions?: boolean;

  /**
   * X-Frame-Options value
   * @default 'SAMEORIGIN'
   */
  xFrameOptions?: XFrameOptions;

  /**
   * Enable CVE-2025-29927 protection (middleware bypass prevention)
   * @default true
   */
  enableCVEProtection?: boolean;

  /**
   * Cache-Control patterns for different path types
   */
  cachePatterns?: CachePatterns;

  /**
   * Public paths that should not have authenticated page cache headers
   * @default ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email']
   */
  publicPaths?: string[];

  /**
   * Enable Cross-Origin policies (COEP, COOP, CORP)
   * @default true in production
   */
  enableCrossOriginPolicies?: boolean;

  /**
   * Cross-Origin-Embedder-Policy value
   * @default 'credentialless'
   */
  coepPolicy?: COEPPolicy;

  /**
   * Cross-Origin-Opener-Policy value
   * @default 'same-origin'
   */
  coopPolicy?: COOPPolicy;

  /**
   * Cross-Origin-Resource-Policy value
   * @default 'same-origin'
   */
  corpPolicy?: CORPPolicy;

  /**
   * Custom security alert handler for CVE protection
   */
  onSecurityAlert?: (details: SecurityAlertDetails) => void;

  /**
   * Enable development mode (relaxes some policies)
   * @default process.env.NODE_ENV === 'development'
   */
  isDevelopment?: boolean;
}

/**
 * Security alert details for CVE-2025-29927 and similar attacks
 */
export interface SecurityAlertDetails {
  type: 'cve-2025-29927' | 'invalid-header' | 'suspicious-request';
  header?: string;
  url: string;
  userAgent?: string | null;
  ip?: string | null;
  timestamp: Date;
}

/**
 * Middleware response type (compatible with Next.js)
 */
export interface MiddlewareResponse {
  headers: Map<string, string>;
  status?: number;
  body?: string;
}

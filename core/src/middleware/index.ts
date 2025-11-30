/**
 * Security Middleware Module
 *
 * Provides configurable security middleware factories for Next.js applications.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createNextSecurityMiddleware, defaultMiddlewareConfig } from '@yobolabs/core/middleware';
 * import { NextResponse } from 'next/server';
 *
 * export default createNextSecurityMiddleware({
 *   allowedOrigins: ['https://myapp.com'],
 *   enableCVEProtection: true,
 * }, { NextResponse });
 *
 * export const config = defaultMiddlewareConfig;
 * ```
 */

// Types
export type {
  SecurityMiddlewareConfig,
  SecurityAlertDetails,
  XFrameOptions,
  COEPPolicy,
  COOPPolicy,
  CORPPolicy,
  CSPDirective,
  CachePatterns,
  MiddlewareResponse,
} from './types';

// Security middleware
export {
  createSecurityMiddleware,
  createNextSecurityMiddleware,
  defaultMiddlewareConfig,
} from './security';

/**
 * Security Middleware Module
 *
 * Provides configurable security middleware factories for Next.js applications.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createNextSecurityMiddleware, defaultMiddlewareConfig } from '@jetdevs/core/middleware';
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
    COEPPolicy,
    COOPPolicy,
    CORPPolicy,
    CSPDirective,
    CachePatterns,
    MiddlewareResponse, SecurityAlertDetails, SecurityMiddlewareConfig, XFrameOptions
} from './types';

// Security middleware
export {
    createNextSecurityMiddleware, createSecurityMiddleware, defaultMiddlewareConfig
} from './security';


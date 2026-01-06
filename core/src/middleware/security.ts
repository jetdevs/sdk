/**
 * Security Middleware Factory
 *
 * Creates a configurable security middleware for Next.js applications.
 * Provides protection against common vulnerabilities and sets security headers.
 *
 * Features:
 * - CVE-2025-29927 protection (Next.js middleware bypass)
 * - Content Security Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Frame-Options / X-Content-Type-Options / X-XSS-Protection
 * - Cross-Origin policies (COEP, COOP, CORP)
 * - Cache-Control headers based on path patterns
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createSecurityMiddleware } from '@jetdevs/core/middleware';
 *
 * const middleware = createSecurityMiddleware({
 *   allowedOrigins: ['https://myapp.com'],
 *   cspDirectives: {
 *     'script-src': ["'self'", "'unsafe-inline'", 'https:'],
 *   },
 * });
 *
 * export default middleware;
 * ```
 */

import type {
    CSPDirective,
    CachePatterns,
    SecurityAlertDetails,
    SecurityMiddlewareConfig,
} from './types';

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

const DEFAULT_CSP_DIRECTIVES: Record<CSPDirective, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'https:', 'data:'],
  'style-src': ["'self'", "'unsafe-inline'", 'https:', 'data:'],
  'font-src': ["'self'", 'https:', 'data:'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'media-src': ["'self'", 'blob:', 'https:'],
  'connect-src': ["'self'", 'https:', 'wss:', 'ws:'],
  'frame-src': ["'self'", 'https:'],
  'worker-src': ["'self'", 'blob:', 'data:'],
  'child-src': ["'self'", 'blob:', 'data:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'report-uri': [],
  'report-to': [],
};

const DEFAULT_CACHE_PATTERNS: CachePatterns = {
  static: 'public, max-age=31536000, immutable',
  dynamic: 'no-store, no-cache, must-revalidate, proxy-revalidate',
  nextStatic: 'public, max-age=31536000, immutable',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Builds CSP header string from directives
 */
function buildCSPHeader(
  directives: Record<CSPDirective, string[]>,
  allowedOrigins: string[]
): string {
  const cspParts: string[] = [];

  for (const [directive, values] of Object.entries(directives)) {
    if (values.length === 0) continue;

    // Add allowed origins to form-action
    if (directive === 'form-action') {
      const formValues = [...values, ...allowedOrigins].filter(Boolean);
      cspParts.push(`${directive} ${formValues.join(' ')}`);
    } else {
      cspParts.push(`${directive} ${values.join(' ')}`);
    }
  }

  return cspParts.join('; ');
}

/**
 * Checks if a pathname matches any of the given patterns
 */
function matchesPath(pathname: string, patterns: string[]): boolean {
  return patterns.some(
    (pattern) => pathname === pattern || pathname.startsWith(pattern + '/')
  );
}

/**
 * Checks if pathname is a static asset
 */
function isStaticAsset(pathname: string): boolean {
  return /\.(js|css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/.test(pathname);
}

/**
 * Gets cache-able API endpoint type
 */
function getApiCacheType(
  pathname: string
): 'list' | 'single' | null {
  if (!pathname.startsWith('/api/trpc/')) return null;

  if (
    pathname.includes('.list') ||
    pathname.includes('.getAll') ||
    pathname.includes('catalog')
  ) {
    return 'list';
  }

  if (pathname.includes('.get') || pathname.includes('.findById')) {
    return 'single';
  }

  return null;
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * NextRequest-like interface for compatibility
 */
interface NextRequestLike {
  url: string;
  nextUrl: { pathname: string };
  headers: {
    get(name: string): string | null;
  };
}

/**
 * NextResponse-like interface for compatibility
 */
interface NextResponseLike {
  headers: {
    set(name: string, value: string): void;
  };
}

/**
 * Creates a security middleware with the given configuration.
 *
 * The returned function is a factory that takes NextResponse.next() as input
 * and applies security headers to it, returning either the modified response
 * or a blocked response for security violations.
 */
export function createSecurityMiddleware(config: SecurityMiddlewareConfig = {}) {
  const {
    allowedOrigins = [],
    cspDirectives = {},
    enableHSTS = true,
    hstsMaxAge = 31536000,
    enableXFrameOptions = true,
    xFrameOptions = 'SAMEORIGIN',
    enableCVEProtection = true,
    cachePatterns = {},
    publicPaths = DEFAULT_PUBLIC_PATHS,
    enableCrossOriginPolicies = true,
    coepPolicy = 'credentialless',
    coopPolicy = 'same-origin',
    corpPolicy = 'same-origin',
    onSecurityAlert,
    isDevelopment = process.env.NODE_ENV === 'development',
  } = config;

  // Merge CSP directives with defaults
  const mergedCSPDirectives = { ...DEFAULT_CSP_DIRECTIVES };
  for (const [directive, values] of Object.entries(cspDirectives)) {
    if (values) {
      mergedCSPDirectives[directive as CSPDirective] = values;
    }
  }

  // Merge cache patterns with defaults
  const mergedCachePatterns = { ...DEFAULT_CACHE_PATTERNS, ...cachePatterns };

  /**
   * Process security middleware for a request.
   *
   * @param request - NextRequest-like object
   * @param response - NextResponse-like object (from NextResponse.next())
   * @returns Object with { blocked: boolean, response, blockReason? }
   */
  return function processSecurityMiddleware(
    request: NextRequestLike,
    response: NextResponseLike
  ): { blocked: boolean; response: NextResponseLike; blockReason?: string } {
    const requestUrl = new URL(request.url);
    const origin = `${requestUrl.protocol}//${requestUrl.host}`;
    const pathname = request.nextUrl.pathname;

    // =========================================================================
    // CVE-2025-29927 Protection
    // =========================================================================
    if (enableCVEProtection) {
      const middlewareHeader = request.headers.get('x-middleware-subrequest');
      if (middlewareHeader) {
        const alertDetails: SecurityAlertDetails = {
          type: 'cve-2025-29927',
          header: middlewareHeader,
          url: request.url,
          userAgent: request.headers.get('user-agent'),
          ip:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip'),
          timestamp: new Date(),
        };

        if (onSecurityAlert) {
          onSecurityAlert(alertDetails);
        } else {
          console.warn(
            '🚨 SECURITY ALERT: Blocked request with x-middleware-subrequest header (CVE-2025-29927):',
            alertDetails
          );
        }

        return {
          blocked: true,
          response,
          blockReason: 'Invalid request headers detected',
        };
      }
    }

    // =========================================================================
    // Build Allowed Origins
    // =========================================================================
    const effectiveAllowedOrigins = [
      origin,
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.NEXT_PUBLIC_CDN_BASE_URL,
      ...allowedOrigins,
    ].filter(Boolean) as string[];

    // =========================================================================
    // Content Security Policy
    // =========================================================================
    const cspHeader = buildCSPHeader(mergedCSPDirectives, effectiveAllowedOrigins);
    response.headers.set('Content-Security-Policy', cspHeader);

    // =========================================================================
    // Cache Control Headers
    // =========================================================================

    // Static assets
    if (isStaticAsset(pathname)) {
      response.headers.set('Cache-Control', mergedCachePatterns.static!);
    }
    // Next.js static assets
    else if (pathname.startsWith('/_next/static/')) {
      response.headers.set('Cache-Control', mergedCachePatterns.nextStatic!);
    }
    // API responses
    else {
      const apiCacheType = getApiCacheType(pathname);
      if (apiCacheType === 'list') {
        response.headers.set(
          'Cache-Control',
          'public, s-maxage=60, stale-while-revalidate=300'
        );
      } else if (apiCacheType === 'single') {
        response.headers.set(
          'Cache-Control',
          'public, s-maxage=300, stale-while-revalidate=600'
        );
      }
    }

    // Authenticated pages - prevent caching
    const isPublicPath = matchesPath(pathname, publicPaths);
    if (
      !isPublicPath &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/_next/')
    ) {
      response.headers.set('Cache-Control', mergedCachePatterns.dynamic!);
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
    }

    // =========================================================================
    // Security Headers
    // =========================================================================
    response.headers.set('X-DNS-Prefetch-Control', 'on');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

    // X-Frame-Options
    if (enableXFrameOptions) {
      response.headers.set('X-Frame-Options', xFrameOptions);
    }

    // Cross-Origin policies (production only by default)
    if (enableCrossOriginPolicies && !isDevelopment) {
      response.headers.set('Cross-Origin-Embedder-Policy', coepPolicy);
      response.headers.set('Cross-Origin-Opener-Policy', coopPolicy);
      response.headers.set('Cross-Origin-Resource-Policy', corpPolicy);
    }

    // HSTS (production only by default)
    if (enableHSTS && !isDevelopment) {
      response.headers.set(
        'Strict-Transport-Security',
        `max-age=${hstsMaxAge}; includeSubDomains; preload`
      );
    }

    return { blocked: false, response };
  };
}

/**
 * Creates a Next.js middleware function using the security middleware.
 *
 * This is a convenience function that wraps createSecurityMiddleware
 * with the standard Next.js middleware interface.
 *
 * @param config - Security middleware configuration
 * @param deps - Dependencies (NextResponse from 'next/server')
 */
export function createNextSecurityMiddleware(
  config: SecurityMiddlewareConfig = {},
  deps: {
    NextResponse: {
      next(): any;
      json(data: any, options?: { status?: number }): any;
    };
  }
) {
  const securityMiddleware = createSecurityMiddleware(config);
  const { NextResponse } = deps;

  return function middleware(request: NextRequestLike) {
    // Handle Next.js development stack frame requests
    if (request.nextUrl.pathname === '/__nextjs_original-stack-frames') {
      return NextResponse.json({ frames: [] }, { status: 200 });
    }

    const response = NextResponse.next();
    const result = securityMiddleware(request, response);

    if (result.blocked) {
      return NextResponse.json(
        { error: result.blockReason },
        { status: 400 }
      );
    }

    return result.response;
  };
}

/**
 * Default middleware config matcher for Next.js
 */
export const defaultMiddlewareConfig = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public|slides).*)',
    '/__nextjs_original-stack-frames',
  ],
};

/**
 * Next.js 15 Specific Utilities
 *
 * Provides utilities that work with Next.js 15's App Router,
 * Server Components, and Server Actions.
 */

/// <reference lib="dom" />

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { withTelemetry } from '../telemetry';
import { captureError } from '../telemetry';
import { getRLSContext, withRLSContext } from '../rls';
import { auditLog } from '../audit';

export interface ServerActionContext {
  headers: globalThis.Headers;
  orgId?: number;
  userId?: string;
}

export interface RouteHandlerContext {
  request: globalThis.Request;
  params: Record<string, string>;
  searchParams: URLSearchParams;
}

/**
 * Wrap a server action with error handling, telemetry, and audit logging
 *
 * @example
 * ```typescript
 * export const createProduct = withServerAction(
 *   'product.create',
 *   async (data: CreateProductInput) => {
 *     'use server';
 *
 *     // Automatic telemetry, error handling, and audit logging
 *     const product = await repo.create(data);
 *     return product;
 *   }
 * );
 * ```
 */
export function withServerAction<TArgs extends any[], TReturn>(
  actionName: string,
  action: (...args: TArgs) => Promise<TReturn>,
  options?: {
    audit?: boolean;
    requireAuth?: boolean;
  }
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    'use server';

    const { audit = true, requireAuth = true } = options || {};

    try {
      // Get headers for context
      const requestHeaders = headers();

      // Check authentication if required
      if (requireAuth) {
        const session = requestHeaders.get('x-session');
        if (!session) {
          redirect('/login');
        }
      }

      // Execute with telemetry
      const result = await withTelemetry(
        actionName,
        () => action(...args),
        {
          operation: actionName,
        }
      );

      // Audit log if enabled
      if (audit) {
        await auditLog({
          action: 'create',
          entityType: actionName.split('.')[0],
          entityId: (result as any)?.id || 'unknown',
          metadata: { args },
        });
      }

      return result;
    } catch (error) {
      await captureError(error as Error, {
        action: actionName,
        args,
      });
      throw error;
    }
  };
}

/**
 * Wrap a route handler with error handling and telemetry
 *
 * @example
 * ```typescript
 * export const GET = withRouteHandler(async (request, context) => {
 *   const products = await repo.list();
 *   return Response.json(products);
 * });
 * ```
 */
export function withRouteHandler(
  handler: (
    request: globalThis.Request,
    context: { params: Record<string, string> }
  ) => Promise<globalThis.Response>
): (request: globalThis.Request, context: { params: Record<string, string> }) => Promise<globalThis.Response> {
  return async (request, context) => {
    const url = new URL(request.url);
    const operation = `${request.method.toLowerCase()}.${url.pathname}`;

    try {
      return await withTelemetry(
        operation,
        () => handler(request, context),
        {
          operation,
          metadata: {
            method: request.method,
            path: url.pathname,
            params: context.params,
          },
        }
      );
    } catch (error) {
      await captureError(error as Error, {
        method: request.method,
        path: url.pathname,
        params: context.params,
      });

      return globalThis.Response.json(
        {
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : 'An error occurred',
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware wrapper for Next.js 15
 *
 * @example
 * ```typescript
 * export const middleware = withMiddleware(async (request) => {
 *   // Check authentication
 *   if (!request.headers.get('authorization')) {
 *     return new Response('Unauthorized', { status: 401 });
 *   }
 *
 *   return NextResponse.next();
 * });
 * ```
 */
export function withMiddleware(
  handler: (request: globalThis.Request) => Promise<globalThis.Response | void>
): (request: globalThis.Request) => Promise<globalThis.Response | void> {
  return async (request) => {
    const startTime = performance.now();
    const url = new URL(request.url);

    try {
      const result = await handler(request);

      // Log middleware execution
      if (process.env.NODE_ENV === 'development') {
        console.log(`[MIDDLEWARE] ${request.method} ${url.pathname} - ${performance.now() - startTime}ms`);
      }

      return result;
    } catch (error) {
      await captureError(error as Error, {
        middleware: true,
        method: request.method,
        path: url.pathname,
      });

      return new Response('Internal Server Error', { status: 500 });
    }
  };
}

/**
 * Get cached data using Next.js 15 caching
 *
 * @example
 * ```typescript
 * const products = await getCachedData(
 *   'products',
 *   () => repo.list(),
 *   { revalidate: 60 }
 * );
 * ```
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    revalidate?: number;
    tags?: string[];
  }
): Promise<T> {
  // This would integrate with Next.js 15's caching mechanism
  // For now, just execute the fetcher
  return fetcher();
}

/**
 * Helper for parallel data fetching in Server Components
 *
 * @example
 * ```typescript
 * const [products, categories, tags] = await fetchParallel([
 *   () => repo.getProducts(),
 *   () => repo.getCategories(),
 *   () => repo.getTags(),
 * ]);
 * ```
 */
export async function fetchParallel<T extends readonly (() => Promise<any>)[]>(
  fetchers: T
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  return Promise.all(fetchers.map(f => f())) as any;
}

/**
 * Create a cached server action
 *
 * @example
 * ```typescript
 * export const getProducts = cachedAction(
 *   async (category: string) => {
 *     'use server';
 *     return repo.findByCategory(category);
 *   },
 *   {
 *     revalidate: 60,
 *     tags: ['products'],
 *   }
 * );
 * ```
 */
export function cachedAction<TArgs extends any[], TReturn>(
  action: (...args: TArgs) => Promise<TReturn>,
  options?: {
    revalidate?: number;
    tags?: string[];
  }
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    'use server';

    const cacheKey = `action:${action.name}:${JSON.stringify(args)}`;

    return getCachedData(
      cacheKey,
      () => action(...args),
      options
    );
  };
}
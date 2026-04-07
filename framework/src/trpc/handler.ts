import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { AnyRouter } from '@trpc/server';

export interface TRPCFetchHandlerOptions<TRouter extends AnyRouter> {
  /** The tRPC router */
  router: TRouter;
  /** Context factory — receives req and resHeaders */
  createContext: (opts: { req: Request; resHeaders: Headers }) => Promise<any>;
  /** API endpoint path (default: '/api/trpc') */
  endpoint?: string;
  /** Custom error handler (default: logs in development only) */
  onError?: (opts: { path?: string; error: any }) => void;
}

/**
 * Create a standardized tRPC fetch handler with safe defaults.
 *
 * Security: All responses set `private, no-store` to prevent Vercel CDN
 * from caching org-scoped data across organizations. Vercel ignores
 * `Vary: cookie` for s-maxage cache keys, so CDN caching of authenticated
 * tRPC responses causes cross-org data leaks.
 *
 * React Query provides sufficient client-side caching.
 *
 * @example
 * ```typescript
 * import { createTRPCFetchHandler } from '@jetdevs/framework/trpc';
 *
 * const handler = createTRPCFetchHandler({
 *   router: appRouter,
 *   createContext: ({ req, resHeaders }) => createTRPCContext({ req, resHeaders }),
 * });
 *
 * export { handler as GET, handler as POST };
 * ```
 */
export function createTRPCFetchHandler<TRouter extends AnyRouter>(
  options: TRPCFetchHandlerOptions<TRouter>,
) {
  const {
    router,
    createContext,
    endpoint = '/api/trpc',
    onError,
  } = options;

  const defaultOnError =
    process.env.NODE_ENV === 'development'
      ? ({ path, error }: { path?: string; error: any }) => {
          console.error(
            `tRPC failed on ${path ?? '<no-path>'}: ${error.message}`,
          );
        }
      : undefined;

  return (req: Request) =>
    fetchRequestHandler({
      endpoint,
      req,
      router,
      createContext: async ({ req, resHeaders }) => {
        return createContext({ req, resHeaders });
      },
      responseMeta() {
        // SECURITY: Prevent Vercel CDN/edge caching of tRPC responses.
        // Vercel ignores Vary: cookie for s-maxage cache keys, so CDN-cached
        // responses leak across orgs. React Query handles client-side caching.
        // NOTE: Must return plain object, not Headers instance — tRPC uses
        // Object.entries() which returns [] for Headers class instances.
        return {
          headers: {
            'cache-control': 'private, no-store, no-cache, must-revalidate',
            'vary': 'cookie',
          },
        };
      },
      onError: onError || defaultOnError,
    });
}

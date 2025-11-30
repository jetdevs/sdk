/**
 * tRPC Provider Factory
 *
 * Creates a configurable tRPC provider for React applications.
 * This is a factory function because tRPC providers need app-specific
 * API instances and configuration.
 */

'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

// =============================================================================
// TYPES
// =============================================================================

export interface TRPCProviderConfig<TRouter extends AnyRouter> {
  /**
   * The tRPC API instance (created with createTRPCReact)
   */
  api: {
    Provider: React.ComponentType<{
      client: any;
      queryClient: QueryClient;
      children: React.ReactNode;
    }>;
    createClient: (config: any) => any;
  };
  /**
   * Function to create tRPC client links
   */
  createLinks: () => any[];
  /**
   * Base URL for the tRPC endpoint
   */
  baseUrl?: string;
  /**
   * tRPC endpoint path (default: '/api/trpc')
   */
  endpoint?: string;
}

export interface QueryClientConfig {
  /**
   * Default stale time in ms (default: 5000)
   */
  staleTime?: number;
  /**
   * Refetch on window focus (default: false)
   */
  refetchOnWindowFocus?: boolean;
  /**
   * Max retry count for queries (default: 3)
   */
  maxRetries?: number;
  /**
   * Handle unauthorized errors
   */
  onUnauthorized?: () => void;
  /**
   * Custom retry logic
   */
  shouldRetry?: (failureCount: number, error: unknown) => boolean;
}

export interface TRPCProviderProps {
  children: React.ReactNode;
  /**
   * Optional component to render after provider setup (e.g., org change detector)
   */
  innerComponent?: React.ComponentType<{ children: React.ReactNode }>;
}

// =============================================================================
// QUERY CLIENT FACTORY
// =============================================================================

/**
 * Create a QueryClient with sensible defaults for tRPC
 */
export function createTRPCQueryClient(config?: QueryClientConfig): QueryClient {
  const {
    staleTime = 5 * 1000,
    refetchOnWindowFocus = false,
    maxRetries = 3,
    onUnauthorized,
    shouldRetry,
  } = config ?? {};

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime,
        refetchOnWindowFocus,
        retry: (failureCount, error) => {
          // Check for custom retry logic first
          if (shouldRetry) {
            return shouldRetry(failureCount, error);
          }

          // Don't retry UNAUTHORIZED errors
          try {
            const trpcError = error as unknown as TRPCClientErrorLike<AnyRouter>;
            if (trpcError?.data?.code === 'UNAUTHORIZED') {
              if (process.env.NODE_ENV === 'development') {
                console.log('🚫 Query failed with UNAUTHORIZED');
              }
              onUnauthorized?.();
              return false;
            }
          } catch {
            // Ignore parsing errors
          }

          return failureCount < maxRetries;
        },
      },
      mutations: {
        retry: false,
        onError: (error) => {
          // Handle UNAUTHORIZED errors in mutations
          try {
            const trpcError = error as unknown as TRPCClientErrorLike<AnyRouter>;
            if (trpcError?.data?.code === 'UNAUTHORIZED') {
              if (process.env.NODE_ENV === 'development') {
                console.log('🚫 Mutation failed with UNAUTHORIZED');
              }
              onUnauthorized?.();
            }
          } catch {
            // Ignore parsing errors
          }
        },
      },
    },
  });
}

// =============================================================================
// PROVIDER FACTORY
// =============================================================================

/**
 * Create a tRPC provider component
 *
 * @example
 * // In your app's providers file:
 * import { createTRPCReact } from '@trpc/react-query';
 * import { loggerLink, httpBatchLink } from '@trpc/client';
 * import superjson from 'superjson';
 * import type { AppRouter } from '@/server/api/root';
 *
 * const api = createTRPCReact<AppRouter>();
 *
 * const TRPCProvider = createTRPCProvider({
 *   api,
 *   createLinks: () => [
 *     loggerLink({
 *       enabled: (opts) =>
 *         process.env.NODE_ENV === 'development' ||
 *         (opts.direction === 'down' && opts.result instanceof Error),
 *     }),
 *     httpBatchLink({
 *       url: '/api/trpc',
 *       transformer: superjson,
 *     }),
 *   ],
 * });
 *
 * // Then use in your app:
 * <TRPCProvider>
 *   <App />
 * </TRPCProvider>
 */
export function createTRPCProvider<TRouter extends AnyRouter>(
  config: TRPCProviderConfig<TRouter>,
  queryClientConfig?: QueryClientConfig
): React.FC<TRPCProviderProps> {
  const { api, createLinks } = config;

  return function TRPCProvider({ children, innerComponent: InnerComponent }: TRPCProviderProps) {
    const [queryClient] = React.useState(() => createTRPCQueryClient(queryClientConfig));

    const [trpcClient] = React.useState(() =>
      api.createClient({
        links: createLinks(),
      })
    );

    return (
      <api.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {InnerComponent ? (
            <InnerComponent>{children}</InnerComponent>
          ) : (
            <>{children}</>
          )}
        </QueryClientProvider>
      </api.Provider>
    );
  };
}

// =============================================================================
// UTILITY: GET BASE URL
// =============================================================================

/**
 * Get the base URL for tRPC requests
 * Works in both browser and server environments
 */
export function getBaseUrl(envVar?: string): string {
  if (typeof window !== 'undefined') {
    // Browser: use relative URL
    return '';
  }

  // SSR: Check for specific env var first
  if (envVar && process.env[envVar]) {
    return process.env[envVar] as string;
  }

  // Vercel deployment
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Common env vars
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Default to localhost
  return 'http://localhost:3000';
}

/**
 * Get the full tRPC endpoint URL
 */
export function getTRPCUrl(endpoint = '/api/trpc', envVar?: string): string {
  return `${getBaseUrl(envVar)}${endpoint}`;
}

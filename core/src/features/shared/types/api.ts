/**
 * API Interface Type Definitions
 *
 * Base types for tRPC-style API patterns used by factory components.
 *
 * @module @jetdevs/core/features/shared/types/api
 */

// =============================================================================
// MUTATION TYPES
// =============================================================================

/**
 * Standard mutation result type
 * @template TData - The data type returned on success
 * @template TError - The error type on failure
 */
export interface MutationResult<TData = unknown, TError = Error> {
  /** The mutation data on success */
  data?: TData;
  /** The error on failure */
  error?: TError;
  /** Whether the mutation is currently running */
  isLoading: boolean;
  /** Whether the mutation completed successfully */
  isSuccess: boolean;
  /** Whether the mutation failed */
  isError: boolean;
  /** Whether the mutation is idle (not yet called) */
  isIdle: boolean;
  /** Reset the mutation state */
  reset: () => void;
}

/**
 * Mutation function type
 * @template TInput - The input type for the mutation
 * @template TOutput - The output type of the mutation
 */
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

/**
 * Mutation hook return type (tRPC-style)
 * @template TInput - The input type for the mutation
 * @template TOutput - The output type of the mutation
 */
export interface UseMutationResult<TInput, TOutput> {
  /** Execute the mutation asynchronously */
  mutateAsync: MutationFn<TInput, TOutput>;
  /** Execute the mutation with callbacks */
  mutate: (
    input: TInput,
    options?: {
      onSuccess?: (data: TOutput) => void;
      onError?: (error: Error) => void;
      onSettled?: () => void;
    }
  ) => void;
  /** Whether the mutation is currently running */
  isLoading: boolean;
  /** Whether the mutation completed successfully */
  isSuccess: boolean;
  /** Whether the mutation failed */
  isError: boolean;
  /** The error if mutation failed */
  error: Error | null;
  /** The data from successful mutation */
  data: TOutput | undefined;
  /** Reset mutation state */
  reset: () => void;
}

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Standard query result type
 * @template TData - The data type returned on success
 * @template TError - The error type on failure
 */
export interface QueryResult<TData = unknown, TError = Error> {
  /** The query data on success */
  data?: TData;
  /** The error on failure */
  error?: TError;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query completed successfully */
  isSuccess: boolean;
  /** Whether the query failed */
  isError: boolean;
  /** Whether the query is fetching (including background refetch) */
  isFetching: boolean;
  /** Whether the query is stale */
  isStale: boolean;
  /** Refetch the query */
  refetch: () => Promise<QueryResult<TData, TError>>;
}

/**
 * Query hook return type (tRPC-style)
 * @template TData - The data type returned
 */
export interface UseQueryResult<TData> {
  /** The query data */
  data: TData | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Whether the query is fetching */
  isFetching: boolean;
  /** Whether the query succeeded */
  isSuccess: boolean;
  /** Whether the query failed */
  isError: boolean;
  /** The error if query failed */
  error: Error | null;
  /** Refetch the query */
  refetch: () => Promise<UseQueryResult<TData>>;
}

// =============================================================================
// UTILS / INVALIDATION TYPES
// =============================================================================

/**
 * Query invalidation function
 */
export type InvalidateFn = () => Promise<void>;

/**
 * Query invalidation config for a single query
 */
export interface QueryInvalidator {
  /** Invalidate the query cache */
  invalidate: InvalidateFn;
}

/**
 * Nested utils structure for a router procedure
 * @template TRouterKeys - The procedure names on the router
 */
export type RouterUtils<TRouterKeys extends string> = {
  [K in TRouterKeys]: QueryInvalidator;
};

// =============================================================================
// BASE API INTERFACE
// =============================================================================

/**
 * Base API interface pattern
 *
 * Factory components should define specific API interfaces
 * that extend or follow this pattern.
 *
 * @example
 * ```typescript
 * interface MyComponentApi extends BaseApiInterface {
 *   myRouter: {
 *     myProcedure: {
 *       useMutation: () => UseMutationResult<MyInput, MyOutput>;
 *     };
 *   };
 * }
 * ```
 */
export interface BaseApiInterface {
  /**
   * Hook to access query utils for cache invalidation
   * @returns Utils object with invalidation methods
   */
  useUtils: () => Record<string, Record<string, QueryInvalidator>>;
}

/**
 * API router with mutation procedure
 * @template TInput - Mutation input type
 * @template TOutput - Mutation output type
 */
export interface ApiMutationRouter<TInput, TOutput> {
  /** Mutation procedure */
  useMutation: () => UseMutationResult<TInput, TOutput>;
}

/**
 * API router with query procedure
 * @template TInput - Query input type
 * @template TOutput - Query output type
 */
export interface ApiQueryRouter<TInput, TOutput> {
  /** Query hook */
  useQuery: (input: TInput) => UseQueryResult<TOutput>;
}

// =============================================================================
// TRPC-SPECIFIC PATTERNS
// =============================================================================

/**
 * tRPC mutation options
 * @template TInput - Input type
 * @template TOutput - Output type
 */
export interface TRPCMutationOptions<TInput, TOutput> {
  /** Called on successful mutation */
  onSuccess?: (data: TOutput, variables: TInput) => void;
  /** Called on mutation error */
  onError?: (error: Error, variables: TInput) => void;
  /** Called when mutation settles (success or error) */
  onSettled?: (
    data: TOutput | undefined,
    error: Error | null,
    variables: TInput
  ) => void;
}

/**
 * tRPC query options
 * @template TOutput - Output type
 */
export interface TRPCQueryOptions<TOutput> {
  /** Whether the query is enabled */
  enabled?: boolean;
  /** Stale time in milliseconds */
  staleTime?: number;
  /** Cache time in milliseconds */
  cacheTime?: number;
  /** Refetch on window focus */
  refetchOnWindowFocus?: boolean;
  /** Called on successful query */
  onSuccess?: (data: TOutput) => void;
  /** Called on query error */
  onError?: (error: Error) => void;
}

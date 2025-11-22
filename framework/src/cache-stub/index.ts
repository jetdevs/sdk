/**
 * Cache Stubs - Temporary no-op implementations
 *
 * These are placeholder implementations for cache utilities while
 * Phase 2 cache integration is being finalized.
 *
 * TODO: Replace with real Next.js cache integration
 */

export type CacheKey = string | string[];
export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  revalidate?: number | false;
}

/**
 * Stub: Execute function with caching (currently no-op)
 */
export async function withCache<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  // Just execute the fetcher without caching
  return fetcher();
}

/**
 * Stub: Invalidate cache by pattern (currently no-op)
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  // No-op
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache Stub] invalidatePattern called:', pattern);
  }
}

/**
 * Stub: Invalidate cache by key (currently no-op)
 */
export async function invalidateKey(key: CacheKey): Promise<void> {
  // No-op
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache Stub] invalidateKey called:', key);
  }
}

/**
 * Stub: Invalidate all cache (currently no-op)
 */
export async function invalidateCache(): Promise<void> {
  // No-op
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache Stub] invalidateCache called');
  }
}

/**
 * Stub: Revalidate path (currently no-op)
 */
export function revalidatePath(path: string): void {
  // No-op
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache Stub] revalidatePath called:', path);
  }
}

/**
 * Stub: Revalidate tag (currently no-op)
 */
export function revalidateTag(tag: string): void {
  // No-op
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache Stub] revalidateTag called:', tag);
  }
}

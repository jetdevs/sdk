/**
 * Caching Utilities for Next.js 15
 *
 * Provides consistent caching patterns that work with Next.js 15's
 * built-in caching mechanisms and React Server Components.
 */

import { unstable_cache } from 'next/cache';
import { revalidateTag as nextRevalidateTag, revalidatePath as nextRevalidatePath } from 'next/cache';
import { getRLSContext } from '../rls';

export type CacheKey = string | string[];

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[];
  revalidate?: number; // Next.js revalidate option
  orgScoped?: boolean; // Whether to include org in cache key
}

/**
 * Execute a function with caching
 *
 * @example
 * ```typescript
 * const products = await withCache(
 *   ['products', 'list', page],
 *   async () => {
 *     return db.query.products.findMany();
 *   },
 *   { ttl: 300, tags: ['products'], orgScoped: true }
 * );
 * ```
 */
export async function withCache<T>(
  key: CacheKey,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 60, tags = [], revalidate, orgScoped = true } = options;

  // Build cache key
  const cacheKey = buildCacheKey(key, orgScoped);

  // Add org-scoped tag if needed
  const cacheTags = orgScoped ? [...tags, `org:${getRLSContext()?.orgId}`] : tags;

  // Use Next.js 15's unstable_cache
  const cachedFn = unstable_cache(
    fn,
    [cacheKey],
    {
      tags: cacheTags,
      revalidate: revalidate || ttl,
    }
  );

  return cachedFn();
}

/**
 * Invalidate cache entries by key
 *
 * @example
 * ```typescript
 * await invalidateCache(['products', 'list']);
 * ```
 */
export async function invalidateCache(key: CacheKey): Promise<void> {
  const cacheKey = buildCacheKey(key, true);

  // In Next.js 15, we invalidate by tags
  await nextRevalidateTag(cacheKey);
}

/**
 * Alias for invalidateCache - invalidate specific cache key
 *
 * @example
 * ```typescript
 * await invalidateKey(['product', uuid]);
 * ```
 */
export async function invalidateKey(key: CacheKey): Promise<void> {
  return invalidateCache(key);
}

/**
 * Invalidate cache entries matching a pattern
 *
 * @example
 * ```typescript
 * await invalidatePattern('products:*');
 * ```
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  const rlsContext = getRLSContext();

  if (rlsContext && pattern.includes('*')) {
    // Invalidate org-scoped pattern
    const orgPattern = `org:${rlsContext.orgId}:${pattern.replace('*', '')}`;
    await nextRevalidateTag(orgPattern);
  } else {
    await nextRevalidateTag(pattern);
  }
}

/**
 * Revalidate a specific tag (Next.js 15)
 */
export async function revalidateTag(tag: string): Promise<void> {
  await nextRevalidateTag(tag);
}

/**
 * Revalidate a specific path (Next.js 15)
 */
export async function revalidatePath(path: string, type?: 'page' | 'layout'): Promise<void> {
  await nextRevalidatePath(path, type);
}

/**
 * Get cached data with org isolation
 *
 * @example
 * ```typescript
 * const data = await getCachedData(
 *   'products',
 *   () => fetchProducts(),
 *   { ttl: 300 }
 * );
 * ```
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  return withCache([key], fetcher, options);
}

/**
 * Build a cache key with optional org scoping
 */
function buildCacheKey(key: CacheKey, orgScoped: boolean): string {
  const keyParts = Array.isArray(key) ? key : [key];

  if (orgScoped) {
    const rlsContext = getRLSContext();
    if (rlsContext) {
      keyParts.unshift(`org:${rlsContext.orgId}`);
    }
  }

  return keyParts.join(':');
}

/**
 * Cache helper for server actions
 *
 * @example
 * ```typescript
 * export const getProducts = cacheServerAction(
 *   async (page: number) => {
 *     'use server';
 *     return db.query.products.findMany({ limit: 20, offset: page * 20 });
 *   },
 *   { tags: ['products'], ttl: 300 }
 * );
 * ```
 */
export function cacheServerAction<TArgs extends any[], TReturn>(
  action: (...args: TArgs) => Promise<TReturn>,
  options: CacheOptions = {}
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const key = ['action', action.name, ...args.map(String)];
    return withCache(key, () => action(...args), options);
  };
}
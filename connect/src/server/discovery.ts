import type { OidcDiscovery } from '../types/index.js'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class DiscoveryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  clear(): void {
    this.store.clear()
  }
}

export async function fetchDiscovery(
  baseUrl: string,
  cache: DiscoveryCache,
  ttlMs: number,
): Promise<OidcDiscovery> {
  const key = `discovery:${baseUrl}`
  const cached = cache.get<OidcDiscovery>(key)
  if (cached) return cached

  const res = await fetch(`${baseUrl}/.well-known/openid-configuration`)
  if (!res.ok) {
    throw new Error(`OIDC discovery fetch failed: HTTP ${res.status} from ${baseUrl}`)
  }
  const doc = (await res.json()) as OidcDiscovery
  cache.set(key, doc, ttlMs)
  return doc
}

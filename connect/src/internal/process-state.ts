/**
 * p77 follow-up (FIX-connect-followups, found in STORY-018) — ONE copy of the
 * SDK's process-local caches, whichever entry point a caller imported.
 *
 * WHY. tsup bundles every `@jetdevs/connect` entry (`./next-auth`,
 * `./server/revocation`, `./adapter`, …) as a self-contained file
 * (`splitting: false`), so a module-level `new Map()` became one Map PER
 * ENTRY: `forgetCredentialAuthority` or a `__reset*ForTests` imported from
 * `./server/revocation` never reached the caches `./next-auth` reads, and a
 * credential-authority flip written through one entry was invisible to the
 * freshness gate running in the other for up to the cache TTL. It is the same
 * class of bug as @jetdevs/core STORY-001/b. Bundler chunk-splitting would fix
 * the SDK's own entries but not an app that ends up with two copies of the
 * SDK (a second install, two webpack layers); a registry on `globalThis`
 * fixes both.
 *
 * CONTRACT. `processState(name, init)` returns the one value registered under
 * `name` in this process, creating it with `init()` the first time. Every
 * cache in the SDK is declared through it, so every copy of the SDK code in
 * the process shares it. The registry key is a `Symbol.for` carrying
 * STATE_VERSION: bump it when the SHAPE of any registered value changes, so
 * two SDK builds with incompatible shapes never read each other's entries
 * (they then keep separate caches, which is the old — safe — behaviour).
 */

/** Bump when the value shape behind ANY registered name changes. */
export const STATE_VERSION = 1

const REGISTRY_KEY = Symbol.for(`@jetdevs/connect.process-state.v${STATE_VERSION}`)

type Registry = Map<string, unknown>

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>
  let reg = g[REGISTRY_KEY]
  if (!reg) {
    reg = new Map()
    Object.defineProperty(globalThis, REGISTRY_KEY, { value: reg, enumerable: false, configurable: false, writable: false })
  }
  return reg
}

/** The process-wide value for `name`, created by `init` on first use. */
export function processState<T>(name: string, init: () => T): T {
  const reg = registry()
  if (!reg.has(name)) reg.set(name, init())
  return reg.get(name) as T
}

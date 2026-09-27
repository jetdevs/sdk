/**
 * p77 STORY-005 — the estate maintenance switch at the THREE SEAMS every
 * interactive login and credential write already passes through (D26,
 * specs.md §5.2 `./next-auth`, feedback P77-21).
 *
 * WHY SEAMS AND NOT A ROUTE LIST. While the switch is on, no login and no
 * credential write may succeed anywhere in the estate, or a half-moved
 * person is observable. Five apps each have a dozen login and write paths;
 * gating them by enumeration is a list that rots. Every one of those paths
 * already passes through exactly one of three seams, so the gate lives
 * there:
 *
 *   1. `maintenanceAuthorize(authorize, deps)` — wraps EVERY
 *      `CredentialsProvider.authorize`. It throws BEFORE the wrapped function
 *      runs, so no OTP row, chat-entry token or demo lease is consumed and no
 *      bcrypt compare happens. NextAuth v4's "authorize threw" branch answers
 *      `302 …/error?error=maintenance`, distinct from `CredentialsSignin`.
 *   2. `maintenanceGate(signIn, deps)` — wraps the NextAuth `signIn` callback
 *      (Google, Facebook, the pilots' Connect callback, the IdP's own login):
 *      returns the redirect `'/maintenance'` before the wrapped callback runs.
 *   3. `assertNotInMaintenance(deps)` — the `CredentialWriteGate` every p77
 *      app hands to `@jetdevs/core`'s `withCredentialWrite`, and the check the
 *      bridge / `generate-token` mints call directly. It throws the SAME shape
 *      core's `CredentialWriteRefusedError('maintenance')` has — `kind:
 *      'credential_write_refused'`, `reason: 'maintenance'`, `status: 503` —
 *      so core's duck-typed `isCredentialWriteRefused` recognises it. Never
 *      `instanceof`: `@jetdevs/connect` carries no dependency on core, and core
 *      bundles a class copy per entry point anyway (STORY-001/b).
 *
 * FAIL CLOSED. `readEstateMaintenance` answers `unreadable` when no good read
 * ≤ 15 s old exists; every gate here treats that as ACTIVE (D26). The 15 s
 * cache is the gate's; the operator contract reads live (`internal-routes.ts`).
 *
 * The page and the error mapping are here too, so an app renders the one
 * paused text everywhere. No React dependency: the component is built from
 * the app's own `createElement` (`createMaintenancePage(React.createElement)`),
 * and `maintenancePageHtml()` serves the same text from a plain route.
 */

import {
  readEstateMaintenance,
  type EstateMaintenanceRead,
  type EstateMaintenanceReaderConfig,
} from '../server/revocation/maintenance.js'

// ---------------------------------------------------------------------------
// The switch read every gate shares
// ---------------------------------------------------------------------------

export interface MaintenanceGateDeps {
  /**
   * How to read the switch. Either the reader config (issuer + this RP's key;
   * the 15 s cache applies) or a function — the IdP itself reads its row
   * in-process and passes one.
   */
  read: EstateMaintenanceReaderConfig | (() => Promise<EstateMaintenanceRead>)
  /** Where a browser is sent while paused. Default `/maintenance`. */
  path?: string
  logger?: Pick<Console, 'warn'>
}

export const MAINTENANCE_PATH = '/maintenance'
export const MAINTENANCE_ERROR = 'maintenance'
export const MAINTENANCE_RETRY_AFTER_SECONDS = 60

/**
 * True while the estate is paused — or while that cannot be verified. A
 * gate that admits on an unreadable switch is a gate that admits during
 * the exact outage a cutover would be run through.
 */
export async function isEstatePaused(deps: MaintenanceGateDeps): Promise<boolean> {
  const read = typeof deps.read === 'function' ? await deps.read() : await readEstateMaintenance(deps.read)
  if (!read.ok) {
    deps.logger?.warn(`[connect-maintenance] switch unreadable (${read.detail}) — treating as active`)
    return true
  }
  return read.state.active
}

// ---------------------------------------------------------------------------
// Seam 1 — CredentialsProvider.authorize
// ---------------------------------------------------------------------------

/** What `maintenanceAuthorize` throws. NextAuth turns any throw into `error=maintenance` via its message. */
export class MaintenanceRefusedError extends Error {
  readonly code = MAINTENANCE_ERROR
  constructor() {
    super(MAINTENANCE_ERROR)
    this.name = 'MaintenanceRefusedError'
  }
}

export function isMaintenanceRefused(err: unknown): err is MaintenanceRefusedError {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === MAINTENANCE_ERROR
}

/**
 * Wrap a `CredentialsProvider.authorize`. Throws `maintenance` BEFORE the
 * wrapped function runs: nothing is consumed, nothing is compared.
 */
export function maintenanceAuthorize<A extends unknown[], R>(
  authorize: (...args: A) => Promise<R> | R,
  deps: MaintenanceGateDeps,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    if (await isEstatePaused(deps)) throw new MaintenanceRefusedError()
    return authorize(...args)
  }
}

// ---------------------------------------------------------------------------
// Seam 2 — the signIn callback
// ---------------------------------------------------------------------------

/**
 * Wrap the NextAuth `signIn` callback. While paused it returns the redirect
 * path (NextAuth treats a string return as "redirect here") before the
 * wrapped callback runs — for every provider.
 */
export function maintenanceGate<A extends unknown[], R>(
  signIn: (...args: A) => Promise<R> | R,
  deps: MaintenanceGateDeps,
): (...args: A) => Promise<R | string> {
  const path = deps.path ?? MAINTENANCE_PATH
  return async (...args: A): Promise<R | string> => {
    if (await isEstatePaused(deps)) return path
    return signIn(...args)
  }
}

// ---------------------------------------------------------------------------
// Seam 3 — the credential-write gate and the mints
// ---------------------------------------------------------------------------

/**
 * The refusal in `@jetdevs/core`'s shape — structurally, not by class:
 * `isCredentialWriteRefused` checks `kind === 'credential_write_refused'`
 * and a string `reason`. `status` / `retryAfterSeconds` feed the route face.
 */
export class MaintenanceWriteRefusedError extends Error {
  readonly kind = 'credential_write_refused' as const
  readonly reason = MAINTENANCE_ERROR
  readonly status = 503 as const
  readonly retryAfterSeconds = MAINTENANCE_RETRY_AFTER_SECONDS
  /** tRPC recognises SERVICE_UNAVAILABLE by `code` when the error escapes a procedure. */
  readonly code = 'SERVICE_UNAVAILABLE' as const
  constructor() {
    super('Sign-in and account changes are paused for a few minutes while we move accounts. Please try again shortly.')
    // tRPC identifies a foreign-copy TRPCError by name (STORY-001/b).
    this.name = 'TRPCError'
  }
}

/** The gate signature `@jetdevs/core`'s `withCredentialWrite` accepts (structurally). */
export type CredentialWriteGateLike = (ctx: { operation: string; db: unknown }) => Promise<void>

/** The `CredentialWriteGate` every p77 app passes to core's writers. Throws while paused. */
export function assertNotInMaintenance(deps: MaintenanceGateDeps): CredentialWriteGateLike {
  return async () => {
    if (await isEstatePaused(deps)) throw new MaintenanceWriteRefusedError()
  }
}

/** The JSON face of a paused write or mint: `503 { error: 'maintenance' }` + `Retry-After: 60`, never cached. */
export function maintenanceResponse(): Response {
  return new Response(JSON.stringify({ error: MAINTENANCE_ERROR }), {
    status: 503,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(MAINTENANCE_RETRY_AFTER_SECONDS),
      'cache-control': 'no-store',
    },
  })
}

/**
 * For a route that mints outside NextAuth (a bridge, `generate-token`): the
 * 503 while paused, else null — `const paused = await maintenanceResponseIfPaused(deps); if (paused) return paused`.
 */
export async function maintenanceResponseIfPaused(deps: MaintenanceGateDeps): Promise<Response | null> {
  return (await isEstatePaused(deps)) ? maintenanceResponse() : null
}

// ---------------------------------------------------------------------------
// The page and the error mapping
// ---------------------------------------------------------------------------

export const MAINTENANCE_PAGE_TITLE = 'Sign-in is paused'
export const MAINTENANCE_PAGE_TEXT =
  'Sign-in is paused for a few minutes while we move accounts. Existing sessions keep working. Back shortly.'

/**
 * NextAuth's error page receives `?error=<code>`. `maintenance` maps to the
 * paused text; everything else is left to the app's own mapping (null).
 */
export function maintenanceErrorText(error: string | null | undefined): string | null {
  return error === MAINTENANCE_ERROR ? MAINTENANCE_PAGE_TEXT : null
}

/** The `/maintenance` page as a static document, for an app that serves it from a plain route. */
export function maintenancePageHtml(): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">` +
    `<meta http-equiv="refresh" content="${MAINTENANCE_RETRY_AFTER_SECONDS}"><title>${MAINTENANCE_PAGE_TITLE}</title>` +
    `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:6rem auto;padding:0 1rem;color:#222}</style></head>` +
    `<body><main role="status"><h1>${MAINTENANCE_PAGE_TITLE}</h1><p>${MAINTENANCE_PAGE_TEXT}</p></main></body></html>`
  )
}

/** The subset of `React.createElement` the page needs. */
export type CreateElementLike = (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => unknown

/**
 * Build the `/maintenance` page component from the app's own `createElement`
 * (`const MaintenancePage = createMaintenancePage(React.createElement)`), so
 * this package carries no React dependency and the app renders one text.
 */
export function createMaintenancePage(h: CreateElementLike): () => unknown {
  return function MaintenancePage() {
    return h(
      'main',
      { role: 'status', style: { fontFamily: 'system-ui, sans-serif', maxWidth: '32rem', margin: '6rem auto', padding: '0 1rem' } },
      h('h1', null, MAINTENANCE_PAGE_TITLE),
      h('p', null, MAINTENANCE_PAGE_TEXT),
    )
  }
}

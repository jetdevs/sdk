"use client"
/**
 * @jetdevs/connect/browser
 *
 * Client-side helpers for Connect SSO in BFF / server-side OIDC flows.
 *
 * SECURITY: The browser NEVER holds raw access or refresh tokens.
 * Tokens live in server-side session storage; the browser holds only
 * the RP's httpOnly session cookie. These helpers redirect the browser
 * to the RP's own server-side auth routes — they never contact the
 * Connect IdP directly.
 */

export interface SignInOptions {
  /** URL to redirect to after successful sign-in (relative to RP origin). */
  returnTo?: string
  /**
   * NextAuth provider id (the sign-in route slug). Must match the `id` you
   * configured on `ConnectProvider`. Defaults to `'connect'`.
   */
  providerId?: string
}

export interface SignOutOptions {
  /** URL to redirect to after sign-out (relative to RP origin). */
  returnTo?: string
}

/**
 * Redirect the browser to the RP's sign-in route.
 * With NextAuth, this calls `/api/auth/signin/<providerId>` (default `'connect'`).
 * The RP server handles the OIDC redirect to the Connect IdP.
 */
export function initiateSignIn(options: SignInOptions = {}): void {
  const providerId = options.providerId ?? 'connect'
  const url = new URL(`/api/auth/signin/${providerId}`, window.location.origin)
  if (options.returnTo) url.searchParams.set('callbackUrl', options.returnTo)
  window.location.assign(url.toString())
}

/**
 * Redirect the browser to the RP's sign-out route.
 * With NextAuth, this calls `/api/auth/signout`.
 * The RP server clears the session and optionally calls the Connect IdP's end_session_endpoint.
 */
export function initiateSignOut(options: SignOutOptions = {}): void {
  const url = new URL('/api/auth/signout', window.location.origin)
  if (options.returnTo) url.searchParams.set('callbackUrl', options.returnTo)
  window.location.assign(url.toString())
}

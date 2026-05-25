"use client"
/**
 * @jetdevs/connect/browser
 *
 * Client-side helpers for Yobo Connect in BFF / server-side OIDC flows.
 *
 * SECURITY: The browser NEVER holds raw access or refresh tokens.
 * Tokens live in server-side session storage; the browser holds only
 * the RP's httpOnly session cookie. These helpers redirect the browser
 * to the RP's own server-side auth routes — they never contact Yobo
 * Connect directly.
 */

export interface SignInOptions {
  /** URL to redirect to after successful sign-in (relative to RP origin). */
  returnTo?: string
  /** Force re-authentication ('login') or re-consent ('consent'). */
  prompt?: 'login' | 'consent'
}

export interface SignOutOptions {
  /** URL to redirect to after sign-out (relative to RP origin). */
  returnTo?: string
}

/**
 * Redirect the browser to the RP's sign-in route.
 * With NextAuth, this calls `/api/auth/signin/yobo-connect`.
 * The RP server handles the OIDC redirect to Yobo Connect.
 */
export function initiateSignIn(options: SignInOptions = {}): void {
  const url = new URL('/api/auth/signin/yobo-connect', window.location.origin)
  if (options.returnTo) url.searchParams.set('callbackUrl', options.returnTo)
  if (options.prompt) url.searchParams.set('prompt', options.prompt)
  window.location.assign(url.toString())
}

/**
 * Redirect the browser to the RP's sign-out route.
 * With NextAuth, this calls `/api/auth/signout`.
 * The RP server clears the session and optionally calls Yobo Connect's end_session_endpoint.
 */
export function initiateSignOut(options: SignOutOptions = {}): void {
  const url = new URL('/api/auth/signout', window.location.origin)
  if (options.returnTo) url.searchParams.set('callbackUrl', options.returnTo)
  window.location.assign(url.toString())
}

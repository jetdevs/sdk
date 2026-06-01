import type { OAuthConfig } from 'next-auth/providers/oauth'
import type { User } from 'next-auth'
import type { ConnectUserinfo } from '../types/index.js'

export { mapConnectClaimsToToken, applyConnectOrgToSession } from './session.js'

/** Profile returned from the Connect IdP's /userinfo endpoint. */
export type ConnectProfile = ConnectUserinfo

export interface ConnectProviderConfig {
  /** Base URL of the Connect IdP, e.g. https://connect.example.com */
  baseUrl: string
  /** OAuth client ID registered with the Connect IdP. */
  clientId: string
  /** OAuth client secret. */
  clientSecret: string
  /**
   * Scopes to request. Defaults to ['openid', 'profile', 'email', 'offline_access'].
   * Include 'offline_access' to receive refresh tokens.
   */
  defaultScopes?: string[]
  /**
   * NextAuth provider id (also the sign-in route slug:
   * `/api/auth/signin/<id>`). Defaults to `'connect'`. Set this to brand the
   * provider for a specific IdP (e.g. `'acme-connect'`); the browser helper's
   * `initiateSignIn({ providerId })` must use the same value.
   */
  id?: string
  /** Human-readable provider name shown on the sign-in button. Defaults to `'Connect'`. */
  name?: string
}

/**
 * `OAuthConfig<ConnectProfile>` with `profile` narrowed to a synchronous return
 * so callers can access `User` properties directly without awaiting, and `type`
 * widened to allow `'oidc'` (the runtime value — the Connect IdP is an OIDC provider
 * so NextAuth performs discovery + id_token validation).
 */
export type ConnectOAuthConfig = Omit<OAuthConfig<ConnectProfile>, 'profile' | 'type'> & {
  type: 'oauth' | 'oidc'
  profile: (profile: ConnectProfile, tokens: Parameters<OAuthConfig<ConnectProfile>['profile']>[1]) => User
}

/**
 * Drop-in NextAuth v4 provider for a Connect-compatible OIDC identity provider.
 *
 * Usage in [...nextauth].ts:
 * ```ts
 * import { ConnectProvider } from '@jetdevs/connect/next-auth'
 *
 * export default NextAuth({
 *   providers: [
 *     ConnectProvider({
 *       baseUrl: process.env.CONNECT_ISSUER_URL!,
 *       clientId: process.env.CONNECT_CLIENT_ID!,
 *       clientSecret: process.env.CONNECT_CLIENT_SECRET!,
 *       // Optional branding — defaults to id:'connect', name:'Connect':
 *       // id: 'acme-connect', name: 'Acme Connect',
 *     }),
 *   ],
 * })
 * ```
 */
export function ConnectProvider(
  config: ConnectProviderConfig,
): ConnectOAuthConfig {
  const scopes = config.defaultScopes ?? ['openid', 'profile', 'email', 'offline_access']

  return {
    id: config.id ?? 'connect',
    name: config.name ?? 'Connect',
    // NextAuth v4 represents OIDC providers as `type: 'oauth'` with `wellKnown`
    // discovery + `idToken: true` (see the built-in Auth0/Okta providers). The
    // `'oidc'` provider type is a NextAuth **v5** concept and is NOT handled by
    // v4's signin/callback routes — using it makes the signin route fall through
    // to the `/api/auth/signin` fallback (silent failure, no authorize redirect).
    // With `idToken: true` NextAuth still performs discovery, validates the
    // id_token, and (because the discovery doc advertises a userinfo_endpoint)
    // calls /userinfo so the `profile` callback receives the full payload
    // (email, name, org_id, org_role) rather than only the sparse id_token claims.
    type: 'oauth',
    wellKnown: `${config.baseUrl}/.well-known/openid-configuration`,
    idToken: true,
    authorization: {
      params: {
        scope: scopes.join(' '),
      },
    },
    checks: ['pkce', 'state', 'nonce'],
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    profile(profile: ConnectProfile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.email ?? profile.sub,
        email: profile.email,
        image: profile.picture,
      }
    },
  }
}

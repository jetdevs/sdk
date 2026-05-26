import type { OAuthConfig } from 'next-auth/providers/oauth'
import type { User } from 'next-auth'
import type { ConnectUserinfo } from '../types/index.js'

export { mapConnectClaimsToToken, applyConnectOrgToSession } from './session.js'

/** Profile returned from Yobo Connect's /userinfo endpoint. */
export type YoboConnectProfile = ConnectUserinfo

export interface YoboConnectProviderConfig {
  /** Base URL of Yobo Connect, e.g. https://connect.yobolabs.ai */
  baseUrl: string
  /** OAuth client ID registered with Yobo Connect. */
  clientId: string
  /** OAuth client secret. */
  clientSecret: string
  /**
   * Scopes to request. Defaults to ['openid', 'profile', 'email', 'offline_access'].
   * Include 'offline_access' to receive refresh tokens.
   */
  defaultScopes?: string[]
}

/**
 * `OAuthConfig<YoboConnectProfile>` with `profile` narrowed to a synchronous return
 * so callers can access `User` properties directly without awaiting, and `type`
 * widened to allow `'oidc'` (the runtime value — Yobo Connect is an OIDC provider
 * so NextAuth performs discovery + id_token validation).
 */
export type YoboConnectOAuthConfig = Omit<OAuthConfig<YoboConnectProfile>, 'profile' | 'type'> & {
  type: 'oauth' | 'oidc'
  profile: (profile: YoboConnectProfile, tokens: Parameters<OAuthConfig<YoboConnectProfile>['profile']>[1]) => User
}

/**
 * Drop-in NextAuth v4 provider for Yobo Connect.
 *
 * Usage in [...nextauth].ts:
 * ```ts
 * import { YoboConnectProvider } from '@jetdevs/connect/next-auth'
 *
 * export default NextAuth({
 *   providers: [
 *     YoboConnectProvider({
 *       baseUrl: process.env.YOBO_CONNECT_URL!,
 *       clientId: process.env.YOBO_CONNECT_CLIENT_ID!,
 *       clientSecret: process.env.YOBO_CONNECT_CLIENT_SECRET!,
 *     }),
 *   ],
 * })
 * ```
 */
export function YoboConnectProvider(
  config: YoboConnectProviderConfig,
): YoboConnectOAuthConfig {
  const scopes = config.defaultScopes ?? ['openid', 'profile', 'email', 'offline_access']

  return {
    id: 'yobo-connect',
    name: 'Yobo Connect',
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
    profile(profile: YoboConnectProfile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.email ?? profile.sub,
        email: profile.email,
        image: profile.picture,
      }
    },
  }
}

import type { OAuthConfig } from 'next-auth/providers/oauth'
import type { User } from 'next-auth'
import type { ConnectUserinfo } from '../types/index.js'

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
 * so callers can access `User` properties directly without awaiting.
 */
export type YoboConnectOAuthConfig = Omit<OAuthConfig<YoboConnectProfile>, 'profile'> & {
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
    type: 'oauth',
    wellKnown: `${config.baseUrl}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: scopes.join(' '),
      },
    },
    checks: ['pkce', 'state'],
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

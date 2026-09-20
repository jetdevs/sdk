import type { OAuthConfig } from 'next-auth/providers/oauth'
import type { User } from 'next-auth'
import type { ConnectUserinfo } from '../types/index.js'

export { mapConnectClaimsToToken, applyConnectOrgToSession } from './session.js'

/** Profile returned from the Connect IdP's /userinfo endpoint. */
export type ConnectProfile = ConnectUserinfo

/** Identity scopes requested when `defaultScopes` is not supplied. */
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access']

/**
 * NextAuth `User` widened with the Connect identity binding and the p79
 * authentication-epoch claims.
 *
 * The epoch claims keep their IdP wire names (`cv`, `aeid`, `grant_id`) so a
 * consumer reads the same identifiers the spec names and the token carries.
 * The binding fields keep the SDK's `connect*` prefix, matching the token keys
 * written by `mapConnectClaimsToToken`.
 *
 * This is an exported type rather than a `declare module 'next-auth'`
 * augmentation, because an augmentation shipped in this package's `.d.ts`
 * would widen `User` inside every app that links this SDK.
 */
export interface ConnectUser extends User {
  /** Canonical subject asserted by the IdP. Pairs with `connectIssuer`. */
  connectSub: string
  /**
   * Issuer that asserted the subject — `profile.iss` when the IdP supplies it,
   * otherwise the configured `baseUrl`. Present so a consumer can form the
   * `(issuer, sub)` pair (specs.md §5) without re-deriving it from its own
   * configuration.
   */
  connectIssuer: string
  /**
   * `credential_version` observed at the instant credentials were verified
   * (specs.md §10.2). Carried, never interpreted — use-time enforcement is the
   * consumer's.
   */
  cv?: number
  /** Opaque authentication-epoch id (specs.md §10.2). */
  aeid?: string
  /**
   * The OIDC grant the credential was issued under (specs.md §10.5). Required
   * to correlate a token with its epoch and with per-grant revocation.
   */
  grant_id?: string
}

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
   * Extra scopes appended to the scope set, for a non-identity audience — e.g.
   * `['copilot:use']` alongside `resource` (specs.md §12.1a). Scopes already in
   * `defaultScopes` are not repeated. Omit this and the scope string is
   * unchanged from the identity-only request.
   */
  additionalScopes?: string[]
  /**
   * RFC 8707 resource indicator — the audience the access token is minted for,
   * e.g. `https://app.cadraos.com/copilot` (specs.md §12.1a). Omit it and no
   * `resource` parameter is sent, leaving the authorization params
   * byte-identical to the identity-only request.
   */
  resource?: string
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
  profile: (
    profile: ConnectProfile,
    tokens: Parameters<OAuthConfig<ConnectProfile>['profile']>[1],
  ) => ConnectUser
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
 *       // Optional non-identity audience (specs.md §12.1a):
 *       // resource: 'https://app.cadraos.com/copilot',
 *       // additionalScopes: ['copilot:use'],
 *     }),
 *   ],
 * })
 * ```
 */
export function ConnectProvider(
  config: ConnectProviderConfig,
): ConnectOAuthConfig {
  const baseScopes = config.defaultScopes ?? DEFAULT_SCOPES
  // Append-only, and only when asked. With no `additionalScopes` the scope list
  // is the base list itself — so the authorization params stay byte-identical to
  // the pre-p79 output for crm, yobo and cadra-web, which are live on this
  // provider and configure neither `resource` nor `additionalScopes`.
  const extraScopes = (config.additionalScopes ?? []).filter((s) => !baseScopes.includes(s))
  const scopes = extraScopes.length > 0 ? [...baseScopes, ...extraScopes] : baseScopes

  const authorizationParams: Record<string, string> = {
    scope: scopes.join(' '),
  }
  // RFC 8707. Added only when configured — an absent resource must not surface
  // as an empty parameter, which the AS would reject as an invalid target.
  if (config.resource) authorizationParams.resource = config.resource

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
      params: authorizationParams,
    },
    checks: ['pkce', 'state', 'nonce'],
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    profile(profile: ConnectProfile): ConnectUser {
      const user: ConnectUser = {
        // `id` stays `profile.sub`. specs.md §5.2 retires the numeric-subject
        // lookup, but that is the consumer's resolution step; changing `id`
        // here would change behaviour for every app already on this provider.
        // `connectSub` + `connectIssuer` are what a consumer resolves by.
        id: profile.sub,
        name: profile.name ?? profile.email ?? profile.sub,
        email: profile.email,
        image: profile.picture,
        connectSub: profile.sub,
        connectIssuer: profile.iss ?? config.baseUrl,
      }
      // Assigned conditionally: an absent claim must not surface as an explicit
      // `undefined` key, which would read as "the IdP sent nothing" rather than
      // "the IdP sent no such claim".
      if (profile.cv != null) user.cv = profile.cv
      if (profile.aeid != null) user.aeid = profile.aeid
      const grantId = profile.grant_id ?? profile.grantId
      if (grantId != null) user.grant_id = grantId
      return user
    },
  }
}

/** Base configuration for a relying-party client. */
export interface ConnectConfig {
  /** Base URL of Yobo Connect, e.g. https://connect.yobolabs.ai */
  baseUrl: string
  /** OAuth client ID registered with Yobo Connect. */
  clientId: string
  /** OAuth client secret. Required for confidential clients. */
  clientSecret?: string
  /** Default redirect URI for authorization callbacks. */
  redirectUri: string
  /** Scopes to request by default. Defaults to ['openid', 'profile', 'email']. */
  defaultScopes?: string[]
  /** TTL for caching the discovery document in ms. Defaults to 3_600_000 (1h). */
  discoveryTtlMs?: number
}

/** Token set returned from /token endpoint. */
export interface TokenSet {
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType: string
  expiresIn?: number
  scope?: string
  /** Absolute expiry timestamp (ms since epoch), if expiresIn was provided. */
  expiresAt?: number
}

/** Claims returned from /userinfo. */
export interface ConnectUserinfo {
  sub: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
  /** Yobo org ID — the org the user selected at consent. */
  orgId?: number
  /** Yobo Connect membership role at the org level. NOT product RBAC. */
  orgRole?: 'owner' | 'admin' | 'member'
}

/** Verified claims from a Yobo Connect ID token (RS256 JWT). */
export interface ConnectIdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  auth_time?: number
  nonce?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  org_id?: number
  org_role?: string
  /** Session ID for back-channel logout targeting. */
  sid?: string
}

/** OIDC discovery document shape (subset used by this SDK). */
export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  revocation_endpoint?: string
  introspection_endpoint?: string
  end_session_endpoint?: string
  scopes_supported?: string[]
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported?: string[]
  backchannel_logout_supported?: boolean
}

/** Parameters for building an authorization URL. */
export interface AuthorizationParams {
  /** Scopes to request. Falls back to ConnectConfig.defaultScopes. */
  scopes?: string[]
  /** CSRF state. Auto-generated if omitted. */
  state?: string
  /** Nonce for ID token replay protection. Auto-generated if omitted. */
  nonce?: string
  /** RFC 8707 resource indicator (audience for the access token). */
  resource?: string
  prompt?: 'none' | 'login' | 'consent' | 'select_account'
}

/** Result of buildAuthorizationUrl — save codeVerifier + state + nonce server-side. */
export interface AuthorizationResult {
  url: string
  codeVerifier: string
  state: string
  nonce: string
}

/** Response from POST /introspect (RFC 7662). */
export interface IntrospectionResponse {
  active: boolean
  scope?: string
  client_id?: string
  username?: string
  token_type?: string
  exp?: number
  iat?: number
  sub?: string
  aud?: string | string[]
  iss?: string
  org_id?: number
}

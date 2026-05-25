// @jetdevs/connect root entry — re-exports shared types only.
// The runtime RP client (YoboConnect) lives in '@jetdevs/connect/server'.
// The NextAuth provider lives in '@jetdevs/connect/next-auth'.
export type {
  ConnectConfig,
  TokenSet,
  ConnectUserinfo,
  ConnectIdTokenClaims,
  OidcDiscovery,
  AuthorizationParams,
  AuthorizationResult,
  IntrospectionResponse,
} from './types/index.js'

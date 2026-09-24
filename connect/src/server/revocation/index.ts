/**
 * `@jetdevs/connect/server/revocation` — p77 STORY-003.
 *
 * Revocation semantics for every relying party, in one place: the
 * back-channel logout verifier, the local revocation ledger, the use-time
 * freshness gate (oidc / app_local / derived), the RFC 7662 introspection and
 * D24 lookup transports, the session-token trio for the NextAuth `jwt`
 * callback, the operator-token verifier (D23) and the estate maintenance
 * reader (D26).
 *
 * SERVER ONLY — carries client secrets and internal keys.
 */

export {
  BACKCHANNEL_LOGOUT_EVENT,
  DEFAULT_CLOCK_SKEW_SECONDS,
  DEFAULT_MAX_TOKEN_AGE_SECONDS,
  JWKS_TTL_SECONDS,
  __resetJwksCacheForTests,
  audienceContains,
  decodeJson,
  decodeSegment,
  findSigningKeys,
  getJwks,
  keyMatches,
  resolveAllowedAlgs,
  verifyCompactJws,
  verifyLogoutToken,
  verifySignature,
  type LogoutTokenRefusal,
  type LogoutTokenVerification,
  type LogoutTokenVerifierDeps,
  type SupportedAlg,
  type VerifiedLogoutToken,
} from './logout-token.js'

export {
  __resetRevocationCacheForTests,
  applyLogoutToken,
  isConnectSessionRevoked,
  isSessionRevokedForToken,
  pruneExpiredLogoutTokens,
  readConnectSessionRevocation,
  type CredentialIdentity,
  type LogoutApplication,
  type RevocationRead,
} from './ledger.js'

export {
  ConnectTransportError,
  introspectConnectToken,
  lookupAccountVersion,
  refreshConnectTokens,
  type AccountVersionAnswer,
  type AccountVersionLookupConfig,
  type AccountVersionQuery,
  type ConnectClientConfig,
  type IntrospectionResult,
  type RefreshResult,
} from './introspection.js'

export {
  FRESHNESS_CACHE_TTL_MS,
  REFRESH_SKEW_SECONDS,
  __resetFreshnessCachesForTests,
  assertCredentialFresh,
  assertSessionTokenFresh,
  derivedLineageFromToken,
  forgetCredentialAuthority,
  observeCredentialVersion,
  readLocalCredentialVersion,
  refreshConnectSessionOnce,
  sessionAuthTime,
  stampConnectEpochOnSignIn,
  type CredentialEpoch,
  type CredentialKind,
  type DerivedLineage,
  type FreshnessDeps,
  type FreshnessFacts,
  type FreshnessRefusal,
  type FreshnessVerdict,
  type SessionEpochToken,
} from './freshness.js'

export {
  OPERATOR_TOKEN_TYP,
  verifyOperatorToken,
  type OperatorTokenRefusal,
  type OperatorTokenVerification,
  type OperatorTokenVerifierDeps,
} from './operator-token.js'

export {
  MAINTENANCE_DEFAULT_MAX_AGE_MS,
  MAINTENANCE_FAILURE_GRACE_MS,
  __resetMaintenanceCacheForTests,
  parseMaintenanceBody,
  readEstateMaintenance,
  type EstateMaintenanceRead,
  type EstateMaintenanceReaderConfig,
  type EstateMaintenanceState,
} from './maintenance.js'

export {
  NeonHttpDriverRefusedError,
  sqlClientFromNeon,
  sqlClientFromPg,
  sqlClientFromPostgresJs,
  type NeonClientLike,
  type NeonPoolLike,
  type PgClientLike,
  type PgPoolLike,
  type PostgresJsLike,
} from './sql-client.js'

export type { RpSqlClient, SqlExecutor } from '../../adapter/index.js'

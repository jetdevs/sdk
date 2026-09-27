/**
 * `@jetdevs/connect/server/handoff` — p77 STORY-004.
 *
 * The credential handoff driver (§6.2's prepare → fence → activate |
 * activate-existing over `RpAdapter`), the per-RP reconciler (§6.4), the
 * mapping sweep (D25), the Connect transport it speaks, and the operator
 * leases every leased op's local transaction runs under (§6.5 step 0).
 *
 * SERVER ONLY — carries the RP key and, inside an op, the operator token.
 */

export {
  ADOPT_SOURCE_CHANGED,
  BCRYPT_VERIFIER_RE,
  LOCAL_VERIFIER_APPEARED,
  NO_CONNECT_CREDENTIAL_YET,
  RELEASED_BY_OPERATOR,
  backoffMs,
  createHandoffDriver,
  digestVerifier,
  fenceExpectation,
  isHandoffClass,
  type DriverHooks,
  type DriverOptions,
  type HandoffDriver,
  type HandoffLogEvent,
  type HandoffLogKind,
  type HandoffLogger,
  type PrepareRefusal,
  type PrepareResult,
  type ReleaseOutcome,
  type RunResult,
  type StepResult,
} from './driver.js'

export {
  RECONCILER_CLAIM_SQL,
  RECONCILE_DEFAULT_LIMIT,
  RECONCILE_REMAINING_CAP,
  reconcile,
  type ReconcileOptions,
  type ReconcileReport,
} from './reconciler.js'

export { SWEEP_DEFAULT_LIMIT, sweepMappings, type SweepMappingsOptions, type SweepMappingsReport } from './sweep.js'

export {
  CONNECT_HANDOFF_ROUTES,
  CONNECT_INTERNAL_BASE_PATH,
  createHandoffTransport,
  isOperatorSuperseded,
  isTransientReply,
  replyError,
  type ActivateAnswer,
  type ActivateExistingAnswer,
  type ActivateExistingRequest,
  type ActivateRequest,
  type ClassifyAnswer,
  type ClassifyRequest,
  type ConnectHandoffRoute,
  type ConnectReply,
  type FailAnswer,
  type FailRequest,
  type HandoffTransport,
  type HandoffTransportConfig,
  type IdentityRegisterAnswer,
  type IdentityRegisterRequest,
  type PrepareAnswer,
  type PrepareRequest,
  type StateAnswer,
  type StateRequest,
} from './transport.js'

export {
  LEASE_CLAIM_SQL,
  LEASE_DRAIN_SQL,
  LEASE_TRANSACTION_SETTINGS,
  OPERATOR_LEASE_DDL,
  OPERATOR_LEASE_SECONDS,
  OPERATOR_LEASE_TABLE,
  OperatorLeaseExpiredError,
  claimOperatorLease,
  countInFlightLeases,
  drainLeases,
  finishLease,
  isOperatorLeaseExpired,
  openLease,
  withOperatorLease,
  type OpenLeaseInput,
} from './lease.js'

export type {
  FenceRefusal,
  FenceResult,
  HandoffClass,
  HandoffRow,
  HandoffState,
  HandoffTableAccess,
  LocalCredentialRead,
  RpAdapter,
  RpSqlClient,
} from '../../adapter/index.js'

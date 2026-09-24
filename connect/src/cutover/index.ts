/**
 * `@jetdevs/connect/cutover` — p77 STORY-005.
 *
 * The estate cutover as LIBRARY code (specs.md §5.3): the manifest
 * (build / validate / digest / approve), `classify()` (D10 as amended),
 * the dry-run report, `EstateCutover` (§6.3, sequential in the IdP
 * registry's `cutover_order` inside the window — p77 STORY-041), `EstateMaintenance` (D26: arm with the probes and
 * the settle, lift with rotate → drain → the pre- or post-activation
 * contract, extend, status, mint), `IssuerBackfill` (§3.4) and
 * `EmailAudit` / `EmailReconcile` (§3.5) — all over `RpOpsClient`s, the
 * HTTP clients to each RP's `credential-handoff` route. yobo-auth's
 * `scripts/p77/*` (STORY-030/036) are thin entries over these.
 *
 * SERVER ONLY — carries RP keys and operator tokens.
 */

export { assertEstateGuards, CutoverRefusedError, CutoverUsageError, dbLabel, ESTATE_USAGE, hostOf, isLoopbackUrl, parseEstateArgs, type EstateArgs } from './args.js'

export {
  CutoverPlanError,
  assertCutoverPlan,
  rank as cutoverRank,
  classifyPerson,
  classifyRow,
  electCanonicalSource,
  isHandoffManifestClass,
  type ClassifiedPerson,
  type ClassifiedRow,
  type CutoverPlan,
  type ManifestClass,
  type PersonConnectFacts,
  type PersonRpRow,
  type QuarantineReason,
} from './classify.js'

export {
  ManifestInvalidError,
  ManifestNotApprovedError,
  actionableRows,
  approveManifest,
  assertManifestApproved,
  buildEstateManifest,
  canonicalJson,
  computeManifestDigest,
  isApproved,
  validateManifest,
  type BuildEstateManifestInput,
  type EstateManifest,
  type EstateManifestRow,
  type ManifestApproval,
} from './manifest.js'

export {
  SOURCE_SYSTEMS_ROUTE_PATH,
  SourceSystemsFetchError,
  fetchSourceSystems,
  parseSourceSystemsAnswer,
  type SourceSystemInfo,
  type SourceSystemKind,
  type SourceSystemsAnswer,
} from './source-systems.js'

export { approveWithReview, reviewManifest, type ApprovalReview } from './approve.js'

export { FLAG_LINE, digestPrefix, dryRunIsClean, planRows, renderReport, renderTable, type EstateRunReport, type RowOutcome } from './dry-run.js'

export { RP_HANDOFF_ROUTE_PATH, createRpOpsClient, isTransientRpReply, replyError, type RpOpsClient, type RpOpsClientConfig, type RpReply } from './rp-client.js'

export {
  MintRefusedError,
  OFF_SWITCH_ROW,
  OPERATOR_TOKEN_REMINT_MS,
  OPERATOR_TOKEN_TTL_SECONDS,
  createRemintingTokenProvider,
  mintOperatorToken,
  newSwitchJti,
  type MaintenanceSwitchRow,
  type MaintenanceSwitchStore,
  type MintOperatorTokenInput,
  type OperatorTokenClaims,
  type OperatorTokenSigner,
} from './switch.js'

export { EstateCutover, WARN_AFTER_MS, type EstateCutoverDeps, type EstateCutoverResult, type EstateLock } from './estate.js'

export {
  ARM_SETTLE_MS,
  EstateMaintenance,
  WINDOW_BUDGET_MS,
  classifyProbe,
  hasSessionCookie,
  type ArmResult,
  type EstateMaintenanceDeps,
  type LiftGate,
  type LiftResult,
  type ProbeKind,
  type ProbeObservation,
  type ProbePhase,
  type ProbeSurface,
  type ProbeVerdict,
  type StatusResult,
} from './maintenance.js'

export { IssuerBackfill, type ConnectDirectory, type IssuerBackfillDeps, type IssuerBackfillReport, type IssuerBackfillRow, type QuarantineBindingReason } from './issuer-backfill.js'

export {
  EmailReconcile,
  auditEmailDuplicates,
  groupDuplicates,
  renderAudit,
  validateDecisions,
  type EmailDecision,
  type EmailGroup,
  type EmailGroupMember,
  type EmailReconcileDeps,
  type EmailReconcileReport,
} from './email-duplicates.js'

export type { ConnectEnv, DeactivateAllowlistEntry, HandoffOp, InventoryRowAnswer, RpStateAnswer } from '../next-auth/internal-routes.js'

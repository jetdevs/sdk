/**
 * Access module (p107): invite-only signup — codes, redemptions, waitlist,
 * per-app mode. Connect-level and app-scoped; the app (Connect) injects db,
 * mail and permission slugs.
 *
 * @module @jetdevs/core/access
 */

export { accessCodes, accessRedemptions, waitlistEntries, appAccessSettings, accessTables } from './schema';
export { accessTablesDdl } from './sql/access-ddl';
export { CODE_RE, CODE_ALPHABET, normalizeCode, isValidCodeFormat, generateCode } from './codes';
export {
  createAccessService,
  evaluateCode,
  decideAccess,
  hashAccessToken,
  AccessError,
  AccessCodeExhaustedError,
  AccessCodeTakenError,
  AccessCodeFormatError,
  AccessOwnerRefFormatError,
  OWNER_REF_RE,
  isValidOwnerRef,
  WaitlistStateError,
  DEFAULT_PERSONAL_CODE_CAP,
  DEFAULT_ACCESS_LINK_TTL_MS,
} from './service';
export type {
  AccessDb,
  AccessService,
  CreateAccessServiceOptions,
  DecisionFacts,
  ListOptions,
  SettingsPatch,
} from './service';
export { createAccessRouterConfig, RECOMMENDED_ACCESS_PERMISSIONS } from './router-config';
export type { AccessRouterPermissions, CreateAccessRouterConfigOptions } from './router-config';
export * from './schemas';
export * from './types';

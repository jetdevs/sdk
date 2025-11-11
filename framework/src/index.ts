/**
 * @yobo/framework - Cross-cutting concerns for Next.js 15 applications
 *
 * This SDK provides horizontal utilities that every module needs:
 * - RLS context management
 * - Audit logging
 * - Event publishing
 * - Caching patterns
 * - Telemetry & monitoring
 * - Error handling
 * - Permission checking
 *
 * It does NOT provide:
 * - Generic CRUD repositories
 * - Business logic
 * - Domain models
 * - UI components
 */

// RLS Context Management
export {
  withRLSContext,
  getRLSContext,
  // requireRLSContext, // TODO: implement
  // setRLSContext, // TODO: implement
  type RLSContext,
} from './rls';

// Audit Logging
export {
  auditLog,
  getAuditTrail,
  calculateChanges,
  type AuditEntry,
  type AuditAction,
  type AuditContext,
} from './audit';

// Event System
export {
  publishEvent,
  // publishEvents, // TODO: implement batch publishing
  type DomainEvent,
  // type EventMetadata, // TODO: add metadata types
  // type EventPayload, // TODO: add payload types
} from './events';

// Caching Utilities (Next.js 15 compatible)
export {
  withCache,
  invalidateCache,
  invalidateKey,
  invalidatePattern,
  revalidateTag,
  revalidatePath,
  type CacheOptions,
  type CacheKey,
} from './cache';

// Telemetry & Monitoring
export {
  withTelemetry,
  trackMetric,
  trackEvent,
  captureError,
  type MetricType,
  type TelemetryContext,
} from './telemetry';

// Permission Checking (kept from original)
export type {
  Permission,
  PermissionContext,
  PermissionHandler,
  PermissionCheckOptions,
} from './permissions';
export {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  getMissingPermissions,
} from './permissions';

// Authentication Helpers (kept from original)
export type { Session, User, AuthContext, AuthAdapter } from './auth';
export {
  configureAuth,
  getSession,
  switchOrg,
  requireAuth,
  isAuthenticated,
  getCurrentUser,
  getCurrentOrgId,
} from './auth';

// Actor Pattern (NEW - Core auth infrastructure)
export {
  createActor,
  hasPermission as actorHasPermission,
  requirePermission as actorRequirePermission,
  canAccessOrg,
  validateOrgContext,
  createServiceContext,
  hasActor,
  isPlatformSystemRole,
  SYSTEM_ROLES,
  ADMIN_PERMISSIONS,
  AuthError,
} from './auth';
export type {
  Actor,
  ActorContext,
  DbAccessOptions,
  ServiceContext,
} from './auth';

// tRPC Security Layers (NEW - Standard procedures)
export {
  createTRPCProcedures,
  createTRPCRouter,
  authMiddleware,
  orgContextMiddleware,
  adminOnlyMiddleware,
  permissionMiddleware,
} from './trpc';
export type {
  TRPCContext,
  AuthenticatedContext,
  PublicProcedure,
  ProtectedProcedure,
  OrgProtectedProcedure,
  AdminOnlyProcedure,
} from './trpc';

// Database RLS Context (NEW - For Actor pattern)
export {
  getDbContext,
  createServiceContextWithDb,
} from './db/rls-context';
export type {
  DbContext,
  SqlTemplate,
} from './db/rls-context';

// Multi-tenant Configuration - TODO: Implement
// export {
//   getOrgConfig,
//   getOrgFeatureFlags,
//   isFeatureEnabled,
//   withOrgContext,
//   type OrgConfig,
//   type FeatureFlags,
// } from './config';

// Error Handling - TODO: Implement
// export {
//   AppError,
//   ValidationError,
//   AuthorizationError,
//   NotFoundError,
//   ConflictError,
//   RateLimitError,
//   withErrorHandling,
//   formatError,
//   type ErrorContext,
//   type ErrorCode,
// } from './errors';

// Repository Patterns (interfaces only, not implementations)
export type {
  DomainRepository,
  AuditableRepository,
  SoftDeletableRepository,
  VersionedRepository,
} from './patterns';

// Next.js 15 Specific Utilities
export {
  withServerAction,
  withRouteHandler,
  withMiddleware,
  getCachedData,
  type ServerActionContext,
  type RouteHandlerContext,
} from './nextjs';

// Validation Utilities - TODO: Implement
// export {
//   validate,
//   validateAsync,
//   createValidator,
//   type ValidationSchema,
//   type ValidationResult,
// } from './validation';

// Background Jobs - TODO: Implement
// export {
//   enqueueJob,
//   scheduleJob,
//   processJob,
//   type JobDefinition,
//   type JobContext,
// } from './jobs';
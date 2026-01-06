/**
 * @jetdevs/framework - Cross-cutting concerns for Next.js 15 applications
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
    getRLSContext, withRLSContext,
    // requireRLSContext, // TODO: implement
    // setRLSContext, // TODO: implement
    type RLSContext
} from './rls';

// Audit Logging
export {
    auditLog, calculateChanges, getAuditTrail, type AuditAction,
    type AuditContext, type AuditEntry
} from './audit';

// Event System
export {
    publishEvent,
    // publishEvents, // TODO: implement batch publishing
    type DomainEvent
} from './events';

// Caching Utilities (Next.js 15 compatible) - PHASE 2 - Using stubs until Next.js integration complete
export {
    invalidateCache,
    invalidateKey,
    invalidatePattern, revalidatePath, revalidateTag, withCache, type CacheKey, type CacheOptions
} from './cache-stub';

// Telemetry & Monitoring
export {
    captureError, trackEvent, trackMetric, withTelemetry, type MetricType,
    type TelemetryContext
} from './telemetry';

// Permission Checking (kept from original)
export {
    checkAllPermissions, checkAnyPermission, checkPermission, getMissingPermissions, requireAllPermissions, requireAnyPermission, requirePermission
} from './permissions';
export type {
    Permission, PermissionCheckOptions, PermissionContext,
    PermissionHandler
} from './permissions';

// Authentication Helpers (kept from original)
export {
    configureAuth, getCurrentOrgId, getCurrentUser, getSession, isAuthenticated, requireAuth, switchOrg
} from './auth';
export type { AuthAdapter, AuthContext, Session, User } from './auth';

// Actor Pattern (NEW - Core auth infrastructure)
export {
    ADMIN_PERMISSIONS,
    AuthError, SYSTEM_ROLES, hasPermission as actorHasPermission,
    requirePermission as actorRequirePermission,
    canAccessOrg, createActor, createServiceContext,
    hasActor,
    isPlatformSystemRole, validateOrgContext
} from './auth';
export type {
    Actor,
    ActorContext,
    DbAccessOptions,
    ServiceContext
} from './auth';

// tRPC Security Layers (NEW - Standard procedures)
export {
    adminOnlyMiddleware, authMiddleware, createTRPCProcedures,
    createTRPCRouter, orgContextMiddleware, permissionMiddleware
} from './trpc';
export type {
    AdminOnlyProcedure, AuthenticatedContext, OrgProtectedProcedure, ProtectedProcedure, PublicProcedure, TRPCContext
} from './trpc';

// Database RLS Context (NEW - For Actor pattern)
export {
    createServiceContextWithDb, getDbContext
} from './db/rls-context';
export type {
    DbContext,
    SqlTemplate
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
    AuditableRepository, DomainRepository, SoftDeletableRepository,
    VersionedRepository
} from './patterns';

// =============================================================================
// TENANT MODULE (v3.0) - Multi-Tenant/Custom Domain Support
// =============================================================================

// Re-export all tenant utilities for direct import from @jetdevs/framework
export * from './tenant';

// Next.js 15 Specific Utilities - PHASE 2 - Temporarily disabled for DTS generation
// export {
//     getCachedData, withMiddleware, withRouteHandler, withServerAction, type RouteHandlerContext, type ServerActionContext
// } from './nextjs';

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
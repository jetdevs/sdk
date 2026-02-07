/**
 * Router Factory with Actor Context
 *
 * This module provides the `createRouterWithActor` helper that eliminates
 * the repetitive 6-7 lines of boilerplate in every tRPC procedure:
 * - createActor(ctx)
 * - getDbContext(ctx, actor, ...)
 * - dbFunction(async (db) => ...)
 * - createServiceContext(db, actor, orgId)
 *
 * ## Type Inference
 *
 * This module uses advanced TypeScript generics to preserve type information
 * from the router configuration through to the final tRPC router. The key types:
 *
 * - `InferRouterFromConfig<TConfig>`: Maps a RouterConfig to tRPC procedure types
 * - `InferProcedureFromRoute<TRoute>`: Infers query/mutation procedure from route config
 *
 * This allows full type inference for `api.router.procedure.useQuery()` calls.
 *
 * @module @jetdevs/framework/router/with-actor
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { auditLog, type AuditAction } from '../audit';
import type { Actor } from '../auth/actor';
import { withRLSContext } from '../rls';
import { withTelemetry } from '../telemetry';

// =============================================================================
// TYPE INFERENCE SYSTEM
// =============================================================================

/**
 * Infer the output type from a handler function
 */
type InferHandlerOutput<THandler> = THandler extends (ctx: any) => Promise<infer TOutput>
  ? TOutput
  : THandler extends (ctx: any) => infer TOutput
    ? TOutput
    : unknown;

/**
 * Infer the input type from a Zod schema or undefined
 */
type InferInputType<TInput> = TInput extends z.ZodType<infer T> ? T : void;

/**
 * Infer the procedure type (query or mutation) from route configuration.
 * Default logic: if type is specified use it, otherwise mutation if has input, query otherwise.
 */
type InferProcedureType<TRoute extends RouteConfig<any, any, any>> =
  TRoute extends { type: 'query' } ? 'query' :
  TRoute extends { type: 'mutation' } ? 'mutation' :
  TRoute extends { input: z.ZodType<any> } ? 'mutation' : 'query';

/**
 * Map a RouterConfig to a record of procedure input/output types.
 * This is used for type inference when composing routers.
 *
 * Note: The actual return type of createRouterWithActor is `any` because
 * tRPC's internal types are complex and version-specific. However, when
 * the router is passed to createTRPCRouter in the app, the procedure
 * types are properly inferred from the tRPC procedures themselves.
 *
 * For proper type inference, routers should be composed using createTRPCRouter
 * directly in the app, allowing tRPC's type system to work correctly.
 */
export type InferRouterFromConfig<TConfig extends RouterConfig<any>> = {
  [K in keyof TConfig]: {
    input: InferInputType<TConfig[K]['input']>;
    output: InferHandlerOutput<TConfig[K]['handler']>;
    type: InferProcedureType<TConfig[K]>;
  };
};

/**
 * Service context provided to handlers
 */
export interface ServiceContext<TDb = any> {
  db: TDb;
  actor: Actor;
  orgId: number | null;
  userId: string;
  [key: string]: any;
}

/**
 * Handler context with all necessary dependencies
 * This is what handlers receive - no more manual setup!
 */
export interface HandlerContext<TInput = any, TDb = any, TRepo = any> {
  /** Validated input from the request */
  input: TInput;

  /** Service context with db, actor, orgId, userId */
  service: ServiceContext<TDb>;

  /** Actor for permission checks */
  actor: Actor;

  /** Database instance with RLS applied */
  db: TDb;

  /**
   * Auto-instantiated repository (if specified in config).
   * When a route specifies a `repository` in its config, this will be the
   * instantiated repository. For routes without a repository config, this
   * will be undefined.
   */
  repo: TRepo;

  /** Raw tRPC context (for advanced use cases) */
  ctx: any;
}

/**
 * Route configuration options
 */
export interface RouteConfig<TInput = any, TOutput = any, TDb = any> {
  /** Permission required (e.g., 'workflow:read') */
  permission?: string;

  /** Input validation schema */
  input?: z.ZodType<TInput>;

  /** Procedure type - auto-detected if not specified */
  type?: 'query' | 'mutation';

  /** Make this route publicly accessible (no auth required) */
  public?: boolean;

  /** Cache configuration for queries */
  cache?: {
    ttl?: number;
    tags?: string[];
    scope?: 'user' | 'org' | 'public';
    sMaxAge?: number;
    staleWhileRevalidate?: number;
  };

  /** Cache tags to invalidate for mutations */
  invalidates?: string[];

  /** Allow cross-org access */
  crossOrg?: boolean;

  /** Auto-audit mutations (default: true for mutations) */
  audit?: boolean;

  /** Entity type for audit logging */
  entityType?: string;

  /** Handler function with simplified context */
  handler: (context: HandlerContext<TInput, TDb>) => Promise<TOutput>;

  /** Custom metadata */
  meta?: Record<string, any>;

  /** Route description for documentation */
  description?: string;

  /** Repository class to auto-instantiate (eliminates `new Repository(db)` boilerplate) */
  repository?: new (db: TDb) => any;

  /** Throw error if handler returns null/undefined */
  ensureResult?: {
    errorCode?: 'INTERNAL_SERVER_ERROR' | 'NOT_FOUND' | 'BAD_REQUEST';
    message?: string;
  } | boolean;  // true = use defaults
}

/**
 * Router configuration
 */
export interface RouterConfig<TDb = any> {
  [procedureName: string]: RouteConfig<any, any, TDb>;
}

/**
 * Context adapter functions - must be provided by the application
 *
 * @template TDb - Database type (e.g., Drizzle instance)
 * @template TRouterFn - The createTRPCRouter function type from the app
 */
export interface ActorContextAdapter<TDb = any, TRouterFn = (procedures: Record<string, any>) => any> {
  /**
   * Create actor from tRPC context
   * Should call createActor from the application's actor module
   */
  createActor: (ctx: any) => Actor;

  /**
   * Get database context with RLS
   * Should call getDbContext from the application's actor module
   */
  getDbContext: (
    ctx: any,
    actor: Actor,
    options?: { crossOrgAccess?: boolean; targetOrgId?: number | null }
  ) => {
    dbFunction: (callback: (db: TDb) => Promise<any>) => Promise<any>;
    effectiveOrgId: number | null;
  };

  /**
   * Create service context
   * Should call createServiceContext from the application's actor module
   */
  createServiceContext: (
    db: TDb,
    actor: Actor,
    orgId: number | null
  ) => ServiceContext<TDb>;

  /**
   * Get the base procedure (with or without permission)
   * @param permission - Permission slug or undefined for no permission check
   * @param isPublic - If true, returns public procedure (no auth required)
   * @param crossOrg - If true, should use procedure without org-locking checks
   *                   (for routes that need to access data across organizations)
   */
  getProcedure: (permission?: string, isPublic?: boolean, crossOrg?: boolean) => any;

  /**
   * Create the tRPC router.
   *
   * This should be your app's `createTRPCRouter` function.
   * The return type of this function determines the type of routers
   * created by `createRouterWithActor`.
   */
  createTRPCRouter: TRouterFn;
}

/**
 * Global adapter storage - set once at application startup
 */
let globalActorAdapter: ActorContextAdapter | null = null;

/**
 * Configure the router with actor adapter (call once at application startup)
 *
 * @example
 * ```typescript
 * // In src/server/api/trpc.ts or similar initialization file
 * import { configureActorAdapter } from '@jetdevs/framework/router/with-actor';
 * import { createActor, getDbContext, createServiceContext } from '@/server/domain/auth/actor';
 * import {
 *   createTRPCRouter,
 *   orgProtectedProcedure,
 *   orgProtectedProcedureWithPermission
 * } from './trpc';
 *
 * configureActorAdapter({
 *   createActor,
 *   getDbContext,
 *   createServiceContext,
 *   getProcedure: (permission, isPublic, crossOrg) =>
 *     isPublic
 *       ? publicProcedure
 *       : crossOrg
 *         ? (permission ? protectedProcedureWithPermission(permission) : protectedProcedure)
 *         : (permission ? orgProtectedProcedureWithPermission(permission) : orgProtectedProcedure),
 *   createTRPCRouter,
 * });
 * ```
 */
export function configureActorAdapter(adapter: ActorContextAdapter): void {
  if (globalActorAdapter) {
    console.warn(
      '[Framework] Actor router adapter already configured. Overwriting existing configuration.'
    );
  }
  globalActorAdapter = adapter;
}

/**
 * Get the configured adapter
 */
function getActorAdapter(): ActorContextAdapter {
  if (!globalActorAdapter) {
    throw new Error(
      'Actor router adapter not configured. Call configureActorAdapter() at application startup.\n' +
      'See documentation: packages/framework/docs/router-with-actor.md'
    );
  }
  return globalActorAdapter;
}

/**
 * Infer action from permission string
 */
function inferAction(permission?: string): AuditAction {
  if (!permission) return 'create'; // Default fallback

  const parts = permission.split(':');
  const action = parts[parts.length - 1]?.toLowerCase() || 'create';

  // Map common permission actions to audit actions
  const actionMap: Record<string, AuditAction> = {
    read: 'create', // Reads aren't audited typically, but use create as safe fallback
    list: 'create',
    create: 'create',
    update: 'update',
    delete: 'delete',
    archive: 'archive',
    restore: 'restore',
    publish: 'publish',
    unpublish: 'unpublish',
    approve: 'approve',
    reject: 'reject',
    export: 'export',
    import: 'import',
  };

  return actionMap[action] || 'create';
}

/**
 * Extract entity ID from result
 */
function extractEntityId(result: any): string | undefined {
  if (!result) return undefined;

  // Try common ID fields
  if (typeof result.uuid === 'string') return result.uuid;
  if (typeof result.id === 'string') return result.id;
  if (typeof result.id === 'number') return String(result.id);
  if (typeof result.entityId === 'string') return result.entityId;

  return undefined;
}

/**
 * Create a router with automatic actor/context setup
 *
 * This helper eliminates 6-7 lines of boilerplate per procedure by:
 * 1. Automatically creating actor from context
 * 2. Automatically acquiring RLS database context
 * 3. Automatically creating service context
 * 4. Adding infrastructure concerns (telemetry, audit)
 *
 * **Before** (Manual boilerplate):
 * ```typescript
 * list: orgProtectedProcedure
 *   .input(listWorkflowsSchema)
 *   .query(async ({ ctx, input }) => {
 *     const actor = createActor(ctx);
 *     const { dbFunction, effectiveOrgId } = getDbContext(ctx, actor);
 *     return dbFunction(async (db) => {
 *       const serviceContext = createServiceContext(db, actor, effectiveOrgId);
 *       return workflowService.list(input, serviceContext);
 *     });
 *   }),
 * ```
 *
 * **After** (With createRouterWithActor):
 * ```typescript
 * list: {
 *   permission: 'workflow:read',
 *   input: listWorkflowsSchema,
 *   cache: { ttl: 60, tags: ['workflows'] },
 *   handler: async ({ input, service }) => {
 *     return workflowService.list(input, service);
 *   },
 * },
 * ```
 *
 * @example
 * ```typescript
 * export const workflowRouter = createRouterWithActor({
 *   list: {
 *     permission: 'workflow:read',
 *     input: listWorkflowsSchema,
 *     cache: { ttl: 60, tags: ['workflows'] },
 *     handler: async ({ input, service }) => {
 *       return workflowService.list(input, service);
 *     },
 *   },
 *
 *   create: {
 *     permission: 'workflow:create',
 *     input: createWorkflowSchema,
 *     invalidates: ['workflows'],
 *     entityType: 'workflow',
 *     handler: async ({ input, service }) => {
 *       return workflowService.create(input, service);
 *     },
 *   },
 *
 *   getById: {
 *     permission: 'workflow:read',
 *     input: z.object({ id: z.string().uuid() }),
 *     crossOrg: true, // Allow cross-org access
 *     handler: async ({ input, service }) => {
 *       return workflowService.getById(input.id, service);
 *     },
 *   },
 * });
 * ```
 */
/**
 * Create a router with automatic actor/context setup.
 *
 * ## Important: Type Inference Limitations
 *
 * This function returns `any` due to a fundamental TypeScript limitation:
 * TypeScript cannot infer types from dynamically-built objects at runtime.
 *
 * **Why this happens:**
 * 1. Procedures are built in a loop (`for...of Object.entries(config)`)
 * 2. TypeScript cannot trace the types through dynamic property access
 * 3. tRPC's type system requires compile-time type information
 *
 * ## Solutions for Type Safety
 *
 * ### Option 1: Use Type Assertions (Quick Fix)
 * ```typescript
 * // Define router type based on config
 * type RoleRouter = {
 *   delete: MutationProcedure<number, void>;
 *   getAllWithStats: QueryProcedure<void, RoleWithStats[]>;
 * };
 *
 * const roleRouter = createRouterWithActor(config) as RoleRouter;
 * ```
 *
 * ### Option 2: Export Typed Router Builders (Recommended)
 * Instead of using `createRouterWithActor`, export a builder function:
 * ```typescript
 * // In SDK
 * export function createRoleRouter(t: ReturnType<typeof initTRPC.create>) {
 *   return t.router({
 *     delete: t.procedure.input(z.number()).mutation(...),
 *     getAllWithStats: t.procedure.query(...),
 *   });
 * }
 *
 * // In App
 * const roleRouter = createRoleRouter(t);
 * ```
 *
 * ### Option 3: Compose in App (Current Approach)
 * The current approach works at runtime - types are just erased at compile time.
 * Add `// @ts-expect-error Type inference limitation` comments where needed.
 *
 * ## Why We Keep This Function
 *
 * Despite type limitations, `createRouterWithActor` provides:
 * - Automatic actor/context setup (eliminates 6-7 lines of boilerplate)
 * - Automatic RLS database context
 * - Automatic audit logging for mutations
 * - Automatic telemetry
 * - Repository auto-instantiation
 *
 * The tradeoff is type safety for developer convenience.
 */
export function createRouterWithActor<TDb = any>(
  config: RouterConfig<TDb>
): any {
  const adapter = getActorAdapter();
  const procedures: Record<string, any> = {};

  for (const [name, route] of Object.entries(config)) {
    // 1. Start with the appropriate procedure type (public or protected)
    // For crossOrg routes, use a procedure without org-locking checks
    let procedure = adapter.getProcedure(route.permission, route.public, route.crossOrg);

    // 2. Add input validation
    if (route.input) {
      procedure = procedure.input(route.input);
    }

    // 3. Add metadata (cache/invalidation)
    const meta: Record<string, any> = { ...route.meta };

    if (route.cache) {
      meta.cacheControl = {
        scope: route.cache.scope || 'user',
        sMaxAge: route.cache.sMaxAge || route.cache.ttl || 60,
      };

      if (route.cache.staleWhileRevalidate) {
        meta.cacheControl.staleWhileRevalidate = route.cache.staleWhileRevalidate;
      }

      meta.cacheTags = route.cache.tags || [];
    }

    if (route.invalidates) {
      meta.invalidateTags = route.invalidates;
    }

    if (Object.keys(meta).length > 0) {
      procedure = procedure.meta(meta);
    }

    // 4. Determine procedure type
    const procedureType = route.type || (route.input ? 'mutation' : 'query');

    // 5. Wrap handler with actor/context setup
    const wrappedHandler = async ({ ctx, input }: any) => {
      // For public routes, we provide a minimal context without actor/RLS
      if (route.public) {
        // Auto-instantiate repository if specified (using ctx.db directly)
        const repo = route.repository ? new route.repository(ctx.db) : undefined;

        // Add automatic telemetry
        const telemetryName = route.description || `${name}.public`;

        // Create an empty actor for public routes (not authenticated)
        // INTENTIONAL: userId: 0 is acceptable here because public routes by definition
        // have no authenticated user. This is different from API key authentication where
        // we MUST have a valid createdBy to attribute operations to a real user.
        // Public routes are explicitly marked with `public: true` and are expected to
        // operate without user context for things like health checks, public data, etc.
        const emptyActor: Actor = {
          userId: 0,
          email: '',
          orgId: null,
          roles: [],
          isSystemUser: false,
          isSuperUser: false,
          permissions: [],
          sessionExpiry: new Date(0).toISOString(),
        };

        return withTelemetry(telemetryName, async () => {
          let result = await route.handler({
            input,
            service: { db: ctx.db, orgId: 0, userId: '', actor: emptyActor },
            actor: emptyActor,
            db: ctx.db,
            repo,
            ctx,
          });

          return result;
        });
      }

      // This is the boilerplate we're eliminating:
      const actor = adapter.createActor(ctx);

      // =======================================================================
      // SECURITY: Locked Org ID Enforcement (STORY-002a)
      //
      // When ctx.lockedOrgId is set (e.g., on custom domains), we prevent
      // input.orgId from overriding the org context. This is a generic
      // mechanism that apps can use for any org-locking scenario.
      //
      // EXCEPTION: Routes with crossOrg: true are exempt from this enforcement.
      // These routes explicitly need to access data across organizations
      // (e.g., getAvailableRoles needs to see global roles with orgId=null,
      // getUserOrganizations needs to see all orgs a user belongs to).
      // The crossOrg flag already handles RLS bypass appropriately.
      // =======================================================================
      const lockedOrgId = (ctx as any).lockedOrgId as number | undefined;
      // Support both input.orgId and input.targetOrgId for flexibility
      // targetOrgId is commonly used in backoffice operations to specify the target org
      let targetOrgId = input?.orgId ?? input?.targetOrgId;

      // Handle lockedOrgId enforcement based on route type
      if (lockedOrgId !== undefined) {
        if (!route.crossOrg) {
          // For non-crossOrg routes: strict enforcement - reject any override attempt
          if (targetOrgId && targetOrgId !== lockedOrgId) {
            // SECURITY: Log the attempted bypass
            console.error('[SECURITY] Attempted org override with locked context:', {
              inputOrgId: targetOrgId,
              lockedOrgId,
              procedureName: name,
              userId: actor.userId,
            });

            // Use TRPCError for proper HTTP 403 response (per specs 9.3)
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Organization context cannot be overridden in this context',
              cause: {
                type: 'LOCKED_ORG_VIOLATION',
                inputOrgId: targetOrgId,
                lockedOrgId,
              }
            });
          }
          // Force targetOrgId to lockedOrgId for org-scoped routes
          targetOrgId = lockedOrgId;
        } else {
          // For crossOrg routes: use lockedOrgId as default RLS context, but don't reject
          // override attempts. This allows the route to access data within the locked org
          // while still being able to query across orgs if the route logic supports it.
          // IMPORTANT: If no targetOrgId was provided in input, use lockedOrgId to ensure
          // RLS context is properly set for the custom domain's organization.
          if (!targetOrgId) {
            targetOrgId = lockedOrgId;
          }
        }
      }

      // =======================================================================
      // SUPERUSER CROSS-ORG ACCESS
      //
      // When a superuser/system user provides a targetOrgId that differs from
      // their session org (actor.orgId), they need cross-org access to operate
      // on behalf of that target organization. This is the backoffice use case.
      //
      // We enable crossOrgAccess when:
      // 1. User is a system user (superuser/admin)
      // 2. A targetOrgId was provided in the input
      // 3. The targetOrgId differs from the actor's session org
      //
      // This allows superusers to create/modify resources in any org without
      // being blocked by RLS policies that would otherwise restrict them to
      // their session org.
      // =======================================================================
      const needsCrossOrgAccess = actor.isSystemUser &&
        targetOrgId !== undefined &&
        targetOrgId !== actor.orgId;

      const { dbFunction, effectiveOrgId } = adapter.getDbContext(ctx, actor, {
        crossOrgAccess: route.crossOrg || needsCrossOrgAccess,
        targetOrgId,
      });

      // Build RLS context for AsyncLocalStorage
      // This ensures telemetry and other utilities can access org/user context
      const rlsContext = {
        orgId: effectiveOrgId ?? 0,
        userId: actor.userId,
      };

      // Execute within RLS context (both AsyncLocalStorage and database session)
      return withRLSContext(rlsContext, async () => {
        return dbFunction(async (db: TDb) => {
          const serviceContext = adapter.createServiceContext(db, actor, effectiveOrgId);

          // Add userId to service context
          serviceContext.userId = ctx.session?.user?.id || actor.userId;

          // Auto-instantiate repository if specified
          const repo = route.repository ? new route.repository(db) : undefined;

          // Add automatic telemetry
          const telemetryName = route.description || `${name}.${route.permission || 'access'}`;

          return withTelemetry(telemetryName, async () => {
          let result = await route.handler({
            input,
            service: serviceContext,
            actor,
            db,
            repo,
            ctx,
          });

          // Validate result if ensureResult is enabled
          if (route.ensureResult && (result === null || result === undefined)) {
            const errorConfig = route.ensureResult === true
              ? { errorCode: 'NOT_FOUND' as const, message: `${name} not found` }
              : route.ensureResult;

            throw new Error(`[${errorConfig.errorCode}] ${errorConfig.message || 'Operation failed'}`);
          }

          // Auto-audit mutations (unless explicitly disabled)
          if (procedureType === 'mutation' && route.audit !== false) {
            const entityId = extractEntityId(result);

            if (entityId) {
              const entityType = route.entityType || name;
              const action = inferAction(route.permission);

              await auditLog({
                action,
                entityType,
                entityId,
                metadata: {
                  procedureName: name,
                  permission: route.permission,
                },
              });
            }
          }

          return result;
        });
        });
      });
    };

    // 6. Attach as query or mutation
    procedures[name] = procedure[procedureType](wrappedHandler);
  }

  // Return the tRPC router directly. The procedures created above are real
  // tRPC procedures with proper type information, so tRPC's type system
  // will infer types correctly when this router is composed with others.
  return adapter.createTRPCRouter(procedures);
}

/**
 * Type helper for defining route configurations
 * Provides better TypeScript inference
 */
export function defineRoute<TInput, TOutput, TDb = any>(
  config: RouteConfig<TInput, TOutput, TDb>
): RouteConfig<TInput, TOutput, TDb> {
  return config;
}

/**
 * Type helper for defining router configurations
 * Provides better TypeScript inference
 */
export function defineRouter<TDb = any>(
  config: RouterConfig<TDb>
): RouterConfig<TDb> {
  return config;
}

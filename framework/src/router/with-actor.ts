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
 * @module @yobo/framework/router/with-actor
 */

import { z } from 'zod';
import type { Actor } from '../auth/actor';
import { withTelemetry } from '../telemetry';
import { auditLog, type AuditAction } from '../audit';

/**
 * Service context provided to handlers
 */
export interface ServiceContext<TDb = any> {
  db: TDb;
  actor: Actor;
  orgId: number;
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

  /** Auto-instantiated repository (if specified in config) */
  repo?: TRepo;

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
 */
export interface ActorContextAdapter<TDb = any> {
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
    options?: { crossOrgAccess?: boolean; targetOrgId?: number }
  ) => {
    dbFunction: (callback: (db: TDb) => Promise<any>) => Promise<any>;
    effectiveOrgId: number;
  };

  /**
   * Create service context
   * Should call createServiceContext from the application's actor module
   */
  createServiceContext: (
    db: TDb,
    actor: Actor,
    orgId: number
  ) => ServiceContext<TDb>;

  /**
   * Get the base procedure (with or without permission)
   */
  getProcedure: (permission?: string) => any;

  /**
   * Create the tRPC router
   */
  createTRPCRouter: (procedures: Record<string, any>) => any;
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
 * import { configureActorAdapter } from '@yobo/framework/router/with-actor';
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
 *   getProcedure: (permission) =>
 *     permission
 *       ? orgProtectedProcedureWithPermission(permission)
 *       : orgProtectedProcedure,
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
export function createRouterWithActor<TDb = any>(
  config: RouterConfig<TDb>
): any {
  const adapter = getActorAdapter();
  const procedures: Record<string, any> = {};

  for (const [name, route] of Object.entries(config)) {
    // 1. Start with permission-protected procedure
    let procedure = adapter.getProcedure(route.permission);

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
      // This is the boilerplate we're eliminating:
      const actor = adapter.createActor(ctx);
      const { dbFunction, effectiveOrgId } = adapter.getDbContext(ctx, actor, {
        crossOrgAccess: route.crossOrg,
        targetOrgId: input?.orgId,
      });

      // Execute within RLS context
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
    };

    // 6. Attach as query or mutation
    procedures[name] = procedure[procedureType](wrappedHandler);
  }

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

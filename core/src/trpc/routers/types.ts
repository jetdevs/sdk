/**
 * Router Factory Types
 *
 * Type definitions for creating tRPC router factories.
 * These types allow core to define router configurations that apps can use.
 *
 * @module @jetdevs/core/trpc/routers
 */

import type { z } from "zod";

// =============================================================================
// BASE TYPES
// =============================================================================

/**
 * Service context provided by the framework's createRouterWithActor
 */
export interface ServiceContext {
  db: any;
  actor: any;
  orgId: number;
  userId: string;
}

/**
 * Handler context for router procedures
 */
export interface HandlerContext<TInput = any, TRepo = any, TDb = any> {
  input: TInput;
  service: ServiceContext;
  actor: any;
  db: TDb;
  /**
   * Auto-instantiated repository (if specified in config).
   * When a route specifies a `repository` in its config, this will be the
   * instantiated repository. For routes without a repository config, this
   * will be undefined.
   */
  repo: TRepo;
  ctx: any;
}

// =============================================================================
// ROUTE CONFIGURATION TYPES
// =============================================================================

/**
 * Cache configuration for query procedures
 */
export interface CacheConfig {
  ttl?: number;
  tags?: string[];
  scope?: "user" | "org" | "public";
}

/**
 * Route configuration that matches framework's createRouterWithActor
 */
export interface RouteConfig<TInput = any, TOutput = any, TDb = any> {
  /** Procedure type */
  type?: "query" | "mutation";
  /** Permission required */
  permission?: string;
  /** Input validation schema */
  input?: z.ZodType<TInput>;
  /** Cache configuration */
  cache?: CacheConfig;
  /** Cache tags to invalidate */
  invalidates?: string[];
  /** Entity type for audit logging */
  entityType?: string;
  /** Repository class */
  repository?: new (db: TDb) => any;
  /** Handler function */
  handler: (context: HandlerContext<TInput, any, TDb>) => Promise<TOutput>;
  /** Allow cross-org access */
  crossOrg?: boolean;
  /** Description for documentation */
  description?: string;
  /** Make this a public route (no auth required) */
  public?: boolean;
}

/**
 * Router configuration map
 */
export interface RouterConfig<TDb = any> {
  [procedureName: string]: RouteConfig<any, any, TDb>;
}

// =============================================================================
// FACTORY TYPES
// =============================================================================

/**
 * Dependencies for router factories
 */
export interface RouterFactoryDeps<TRepo = any> {
  /** Repository class to instantiate */
  Repository: new (db: any) => TRepo;
  /** Additional services (optional) */
  services?: Record<string, any>;
}

/**
 * Result of a router factory
 */
export type RouterFactoryResult = RouterConfig;

/**
 * Router factory types
 */

import type { Permission } from '../permissions/types';
import type { ZodSchema } from 'zod';

/**
 * Router context (from tRPC)
 */
export interface RouterContext {
  session: {
    user: {
      id: number;
      email: string;
      currentOrgId: number;
      permissions?: string[];
    };
  };
  db: unknown; // Database client
  dbWithRLS: (callback: (db: unknown) => Promise<unknown>) => Promise<unknown>;
  activeOrgId?: number;
  activeWorkspaceId?: number;
}

/**
 * Route handler function
 */
export type RouteHandler<TInput = unknown, TOutput = unknown> = (
  ctx: RouterContext,
  input: TInput
) => Promise<TOutput>;

/**
 * Route definition
 */
export interface RouteDefinition<TInput = unknown, TOutput = unknown> {
  /**
   * Required permission for this route
   */
  permission?: Permission;

  /**
   * Input validation schema (Zod)
   */
  input?: ZodSchema<TInput>;

  /**
   * Route handler
   */
  handler: RouteHandler<TInput, TOutput>;

  /**
   * Route description (for documentation)
   */
  description?: string;

  /**
   * Route type - determines if this is a query or mutation
   * Defaults to 'mutation' if input is provided, 'query' otherwise
   */
  type?: 'query' | 'mutation';
}

/**
 * Router configuration
 */
export interface RouterConfig {
  [routeName: string]: RouteDefinition;
}

/**
 * tRPC procedure builder interface
 * This represents a chainable tRPC procedure builder
 */
export interface TRPCProcedureBuilder {
  input(schema: ZodSchema): TRPCProcedureBuilder;
  query(handler: (params: { ctx: RouterContext; input?: unknown }) => Promise<unknown>): unknown;
  mutation(handler: (params: { ctx: RouterContext; input?: unknown }) => Promise<unknown>): unknown;
}

/**
 * tRPC adapter interface
 * Applications implement this to bridge the framework with their tRPC setup
 */
export interface TRPCAdapter {
  /**
   * Create a tRPC router from procedures
   */
  createRouter(procedures: Record<string, unknown>): Record<string, unknown>;

  /**
   * Create a permission-protected procedure
   */
  createProtectedProcedure(permission: Permission): TRPCProcedureBuilder;

  /**
   * Create a public procedure (optional)
   */
  createPublicProcedure?(): TRPCProcedureBuilder;
}

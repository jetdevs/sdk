/**
 * Server-side auth + permission wrapper for server actions / route handlers.
 *
 * Ported from cadra-web `src/lib/server-actions.ts` (most complete copy; has
 * the p108 Guest no-access seam). Auth-provider neutral: the session read,
 * the org-access gate, the permission source and the audit sinks are injected.
 *
 * Dropped vs the app copies: the "no org on the session → use the user's first
 * user_roles row" fallback. It picked an arbitrary org; a session with no org
 * is now refused when `requireOrg`.
 */
import { hasPermissionSlug } from './permission-check';

export interface ServerActionSessionUser {
  id: number;
  email?: string | null;
  name?: string | null;
  currentOrgId?: number | null;
  permissions?: readonly string[] | null;
}

export interface ServerActionSession {
  user?: ServerActionSessionUser | null;
}

export interface ServerActionContext<S extends ServerActionSession = ServerActionSession> {
  user: ServerActionSessionUser;
  orgId: number | null;
  session: S;
}

export interface ServerActionOptions {
  requiredPermission?: string;
  /** Default true. */
  requireAuth?: boolean;
  /** Default true. */
  requireOrg?: boolean;
  /** Label for logs/audit (defaults to the action function name). */
  name?: string;
}

export class ServerActionAuthError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ServerActionAuthError';
  }
}

export interface ServerActionAuthDeps<S extends ServerActionSession> {
  getSession(): Promise<S | null>;
  /**
   * Optional per-request gate (e.g. assertSessionOrgMembership or the Guest
   * no-access check). Throw or return a refusal message to block.
   */
  checkAccess?: (userId: number, orgId: number | null) => Promise<string | null | void>;
  /** Real-time permission source; default = the session's `permissions` claim. */
  resolvePermissions?: (userId: number, orgId: number) => Promise<readonly string[]>;
  onUnauthorized?: (event: { action: string; userId?: number; reason: string }) => void | Promise<void>;
  onPermissionDenied?: (event: { action: string; userId: number; orgId: number; permission: string }) => void | Promise<void>;
}

export function createServerActionAuth<S extends ServerActionSession>(deps: ServerActionAuthDeps<S>) {
  return function withServerActionAuth<A extends unknown[], R>(
    action: (ctx: ServerActionContext<S>, ...args: A) => Promise<R>,
    options: ServerActionOptions = {},
  ): (...args: A) => Promise<R> {
    const { requiredPermission, requireAuth = true, requireOrg = true } = options;
    const label = options.name ?? (action.name || 'anonymous');

    return async (...args: A): Promise<R> => {
      const session = await deps.getSession();
      const user = session?.user ?? null;
      const userId = user && Number.isInteger(user.id) && user.id > 0 ? user.id : null;

      if (userId === null || !session || !user) {
        if (requireAuth || requiredPermission) {
          await deps.onUnauthorized?.({ action: label, reason: 'no session' });
          throw new ServerActionAuthError('UNAUTHORIZED', 'Authentication required for this action');
        }
        throw new ServerActionAuthError('UNAUTHORIZED', 'No session; use withPublicServerAction for public actions');
      }

      const orgId = user.currentOrgId != null && Number.isInteger(user.currentOrgId) && user.currentOrgId > 0 ? user.currentOrgId : null;
      if ((requireOrg || requiredPermission) && orgId === null) {
        await deps.onUnauthorized?.({ action: label, userId, reason: 'no org association' });
        throw new ServerActionAuthError('FORBIDDEN', 'User must be associated with an org to perform this action');
      }

      if (deps.checkAccess) {
        const refusal = await deps.checkAccess(userId, orgId);
        if (typeof refusal === 'string' && refusal.length > 0) {
          throw new ServerActionAuthError('FORBIDDEN', refusal);
        }
      }

      if (requiredPermission && orgId !== null) {
        const held = deps.resolvePermissions ? await deps.resolvePermissions(userId, orgId) : user.permissions;
        if (!hasPermissionSlug(held, requiredPermission)) {
          await deps.onPermissionDenied?.({ action: label, userId, orgId, permission: requiredPermission });
          throw new ServerActionAuthError('FORBIDDEN', `Permission denied. Required permission: ${requiredPermission}`);
        }
      }

      return action({ user, orgId, session }, ...args);
    };
  };
}

/** Public action wrapper: logs and rethrows. */
export function withPublicServerAction<A extends unknown[], R>(action: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    try {
      return await action(...args);
    } catch (error) {
      console.error('Public Server Action Error:', {
        action: action.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  };
}

/** Minimal zod-compatible schema contract (no zod import needed). */
export interface SafeParseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { message: string } };
}

export function validateServerActionInput<T>(schema: SafeParseSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid input: ${result.error.message}`);
  }
  return result.data;
}

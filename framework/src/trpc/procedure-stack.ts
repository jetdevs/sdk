/**
 * tRPC procedure stack factory.
 *
 * Ported from cadra-web `src/server/api/trpc.ts` (most complete copy; the
 * audit variants come from yobo-merchant `orgProtectedProcedureWithAudit*`).
 * App-specific gates (Guest/no-access, custom-domain lock, API-key and MCP
 * pins, rate limits) stay in the app: chain them with `.use()` on top, or do
 * them inside `resolveOrgId` / `rebindSession`.
 *
 * Security rules this keeps:
 * - Platform staff (`isSystemUser`) comes from the injected checker, which
 *   must read live server-owned rows (`isSystemRole`), never a token or a
 *   role NAME.
 * - When the effective org differs from the org the session's grants were
 *   loaded for, the session's `roles`/`permissions` are not reused: they are
 *   rebound by `rebindSession`, or emptied when none is given.
 * - A failed check rejects the request. Nothing falls back to "allow".
 *
 * @module @jetdevs/framework/trpc/procedure-stack
 */

import { TRPCError } from '@trpc/server';
import type { TRPCProcedureBuilder, TRPCUnsetMarker } from '@trpc/server';
import type { DbClients, TransactionalDb, TxOf } from '../db/clients';
import type { AuditWriter, OrgAuditEvent } from '../audit/types';
import { inferAuditAction, extractAuditEntityId, extractAuditEntityName } from '../audit/procedures';

// =============================================================================
// TYPES
// =============================================================================

/** The minimum session shape the stack reads. */
export interface StackSessionUser {
  id: number | string;
  email?: string | null;
  currentOrgId?: number | string | null;
  permissions?: readonly string[];
  roles?: readonly unknown[];
}

export interface StackSession {
  user: StackSessionUser;
}

/**
 * Permission checker, injected (the permission helpers themselves live with
 * the RBAC lane). Both methods must answer from server-owned data.
 */
export interface StackPermissionChecker<TSession extends StackSession = StackSession> {
  /** Platform staff: a live, active role row flagged `isSystemRole`. */
  isSystemUser(input: { userId: number; orgId: number | null; session: TSession }): Promise<boolean>;
  /** Does the user hold `permission` in `orgId`? */
  hasPermission(input: {
    userId: number;
    orgId: number | null;
    permission: string;
    session: TSession;
  }): Promise<boolean>;
}

/** Audit sink: the single `AuditWriter` from `@jetdevs/framework/audit` (one way to write audit events). */
export type { AuditWriter } from '../audit/types';

export interface CreateProcedureStackOptions<
  TCtx extends object,
  TSession extends StackSession,
  TDb extends TransactionalDb,
> {
  /** Read the session from the tRPC context. Null = not signed in. */
  getSession(ctx: TCtx): TSession | null | undefined;
  /** RLS and privileged clients from `createDbClients`. */
  db: DbClients<TDb>;
  permissions: StackPermissionChecker<TSession>;
  /**
   * The effective org for an org-protected call. Defaults to the session's
   * `currentOrgId`. cadra-web re-reads `users.current_org_id` here and applies
   * its custom-domain lock; do that in the app's resolver.
   */
  resolveOrgId?(input: { ctx: TCtx; session: TSession; path: string }): Promise<number | null> | number | null;
  /**
   * Re-load the session's grants for `orgId` when it differs from the
   * session's own org. Default: keep the session but empty `roles` and
   * `permissions` (fail closed).
   */
  rebindSession?(input: { session: TSession; orgId: number }): Promise<TSession>;
  /** Required for the `*WithAudit` procedures; without it they refuse mutations. */
  audit?: AuditWriter;
  /**
   * Await the audit write before returning (still never fails the mutation).
   * Default true: on Vercel an un-awaited promise can be dropped when the
   * function freezes. Set false for fire-and-forget (old yobo-merchant behaviour).
   */
  awaitAuditWrites?: boolean;
}

/** Context added by `protectedProcedure`. */
export interface ProtectedCtxAdditions<TSession extends StackSession> {
  session: TSession;
  userId: number;
}

/** Context added by `orgProtectedProcedure`. */
export interface OrgProtectedCtxAdditions<TSession extends StackSession, TDb extends TransactionalDb>
  extends ProtectedCtxAdditions<TSession> {
  /** Effective org; undefined only for a system user with no org (backoffice). */
  activeOrgId: number | undefined;
  isSystemUser: boolean;
  /** Runs `fn` with this request's org context (privileged for backoffice system users). */
  dbWithRLS: <T>(fn: (tx: TxOf<TDb>) => Promise<T>) => Promise<T>;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Positive safe integer from a number or a numeric string; else null. */
export function parsePositiveId(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    n = Number.parseInt(value.trim(), 10);
  } else {
    return null;
  }
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function stripGrants<TSession extends StackSession>(session: TSession, orgId: number): TSession {
  return {
    ...session,
    user: { ...session.user, currentOrgId: orgId, roles: [], permissions: [] },
  };
}

function withOrg<TSession extends StackSession>(session: TSession, orgId: number | null): TSession {
  return { ...session, user: { ...session.user, currentOrgId: orgId } };
}

function forbidden(permission: string): TRPCError {
  return new TRPCError({ code: 'FORBIDDEN', message: `Permission required: ${permission}` });
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Build the standard procedure stack on the app's tRPC instance.
 *
 * @example
 * ```ts
 * const t = initTRPC.context<Ctx>().create({ transformer: superjson });
 * export const {
 *   publicProcedure, protectedProcedure, orgProtectedProcedure,
 *   withPermission, orgProtectedProcedureWithPermission,
 *   orgProtectedProcedureWithAudit, orgProtectedProcedureWithPermissionAndAudit,
 * } = createProcedureStack(t, { getSession: (ctx) => ctx.session, db: clients, permissions });
 * ```
 */
export function createProcedureStack<
  TCtx extends object,
  TMeta extends object,
  TSession extends StackSession,
  TDb extends TransactionalDb,
>(
  t: {
    procedure: TRPCProcedureBuilder<
      TCtx,
      TMeta,
      object,
      TRPCUnsetMarker,
      TRPCUnsetMarker,
      TRPCUnsetMarker,
      TRPCUnsetMarker,
      false
    >;
  },
  options: CreateProcedureStackOptions<TCtx, TSession, TDb>
) {
  const {
    getSession,
    db: clients,
    permissions,
    resolveOrgId,
    rebindSession,
    audit,
    awaitAuditWrites = true,
  } = options;

  const publicProcedure = t.procedure;

  const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
    const session = getSession(ctx as unknown as TCtx);
    const userId = session ? parsePositiveId(session.user?.id) : null;
    if (!session || userId === null) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    const additions: ProtectedCtxAdditions<TSession> = { session, userId };
    return next({ ctx: additions });
  });

  const orgProtectedProcedure = protectedProcedure.use(async ({ ctx, next, path }) => {
    const { session, userId } = ctx;
    const grantsOrgId = parsePositiveId(session.user.currentOrgId);

    const resolved = resolveOrgId
      ? await resolveOrgId({ ctx: ctx as unknown as TCtx, session, path })
      : grantsOrgId;
    const orgId = resolved === null ? null : parsePositiveId(resolved);
    if (resolved !== null && orgId === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid organization context.' });
    }

    // No catch: a failed read rejects the request.
    const isSystemUser = await permissions.isSystemUser({ userId, orgId, session });

    if (orgId === null) {
      if (!isSystemUser) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active organization found. Please contact support or try refreshing the page.',
        });
      }
      // Backoffice: platform staff with no org get the privileged client.
      const additions: OrgProtectedCtxAdditions<TSession, TDb> = {
        session: withOrg(session, null),
        userId,
        activeOrgId: undefined,
        isSystemUser: true,
        dbWithRLS: <T>(fn: (tx: TxOf<TDb>) => Promise<T>): Promise<T> =>
          clients.withPrivilegedDb(`orgProtected:system-user-no-org:${path} user=${userId}`, fn),
      };
      return next({ ctx: additions });
    }

    let effectiveSession: TSession;
    if (grantsOrgId === orgId) {
      effectiveSession = session;
    } else if (rebindSession) {
      effectiveSession = withOrg(await rebindSession({ session, orgId }), orgId);
    } else {
      effectiveSession = stripGrants(session, orgId);
    }

    const additions: OrgProtectedCtxAdditions<TSession, TDb> = {
      session: effectiveSession,
      userId,
      activeOrgId: orgId,
      isSystemUser,
      dbWithRLS: <T>(fn: (tx: TxOf<TDb>) => Promise<T>): Promise<T> =>
        clients.dbWithRLS(orgId, fn, { userId, superuser: isSystemUser }),
    };
    return next({ ctx: additions });
  });

  const withPermission = (permission: string) =>
    protectedProcedure.use(async ({ ctx, next }) => {
      const orgId = parsePositiveId(ctx.session.user.currentOrgId);
      const input = { userId: ctx.userId, orgId, session: ctx.session };
      if (await permissions.isSystemUser(input)) return next();
      if (!(await permissions.hasPermission({ ...input, permission }))) throw forbidden(permission);
      return next();
    });

  const orgProtectedProcedureWithPermission = (permission: string) =>
    orgProtectedProcedure.use(async ({ ctx, next }) => {
      if (ctx.isSystemUser) return next();
      const allowed = await permissions.hasPermission({
        userId: ctx.userId,
        orgId: ctx.activeOrgId ?? null,
        permission,
        session: ctx.session,
      });
      if (!allowed) throw forbidden(permission);
      return next();
    });

  const auditedOrg = orgProtectedProcedure.use(async ({ ctx, next, path, type, getRawInput }) => {
    if (type !== 'mutation') return next();
    if (!audit) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Audit writer is not configured.' });
    }
    const result = await next();
    const orgId = ctx.activeOrgId;
    if (result.ok && orgId !== undefined) {
      const write = async (): Promise<void> => {
        try {
          const raw: unknown = await getRawInput();
          const input = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
          const segments = path.split('.');
          const procedureName = segments[segments.length - 1] ?? path;
          const event: OrgAuditEvent = {
            scope: 'org',
            orgId,
            action: inferAuditAction(procedureName),
            entityType: segments.length > 1 ? segments.slice(0, -1).join('.') : procedureName,
            entityId: extractAuditEntityId(input, result.data),
            entityName: extractAuditEntityName(input, result.data),
            actor: { kind: 'user', userId: ctx.userId, email: ctx.session.user.email ?? null },
            metadata: { path },
          };
          await audit.write(event);
        } catch (err: unknown) {
          console.error('[Audit] Failed to log mutation:', err);
        }
      };
      if (awaitAuditWrites) {
        await write();
      } else {
        void write();
      }
    }
    return result;
  });

  const orgProtectedProcedureWithAudit = auditedOrg;

  const orgProtectedProcedureWithPermissionAndAudit = (permission: string) =>
    auditedOrg.use(async ({ ctx, next }) => {
      if (ctx.isSystemUser) return next();
      const allowed = await permissions.hasPermission({
        userId: ctx.userId,
        orgId: ctx.activeOrgId ?? null,
        permission,
        session: ctx.session,
      });
      if (!allowed) throw forbidden(permission);
      return next();
    });

  return {
    publicProcedure,
    protectedProcedure,
    orgProtectedProcedure,
    withPermission,
    orgProtectedProcedureWithPermission,
    orgProtectedProcedureWithAudit,
    orgProtectedProcedureWithPermissionAndAudit,
  };
}

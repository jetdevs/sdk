/**
 * A removed member loses the session org on the next request.
 *
 * Ported from engage-app `src/server/auth/session-org-membership.ts`. The db
 * read is injected (`ReadSessionOrgAccess`); `sessionOrgAccessQuery` builds the
 * one indexed SQL read the app runs on its privileged client.
 *
 * THE RULE. Every authenticated request whose session names an org must come
 * from an active user who is an active member (org_members.status = 'active')
 * of that active org — read on that request, no cache (a cache delays
 * revocation). Skipped for platform system users (an active role flagged
 * is_system_role), sessions with no org, and API-key contexts.
 */
import { TRPCError } from '@trpc/server';
import { sql, type SQL } from 'drizzle-orm';

export const SESSION_ORG_ACCESS_ENDED_MESSAGE = 'Your access to this organization has ended. Please sign in again.';

export interface SessionOrgAccess {
  userActive: boolean;
  member: boolean;
  systemUser: boolean;
}

export type ReadSessionOrgAccess = (userId: number, orgId: number) => Promise<SessionOrgAccess>;

export function sessionOrgAccessQuery(userId: number, orgId: number): SQL {
  return sql`
    SELECT
      u.is_active AS user_active,
      EXISTS (
        SELECT 1 FROM org_members om JOIN orgs o ON o.id = om.org_id
        WHERE om.user_id = u.id AND om.org_id = ${orgId} AND om.status = 'active' AND o.is_active = true
      ) AS member,
      EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND ur.is_active = true AND r.is_active = true AND r.is_system_role = true
      ) AS system_user
    FROM users u
    WHERE u.id = ${userId}
  `;
}

/** Driver-shape tolerant (postgres.js array vs node-pg `{ rows }`). */
export function parseSessionOrgAccess(result: unknown): SessionOrgAccess {
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] } | null)?.rows) ?? [];
  const row = rows[0] as { user_active?: boolean; member?: boolean; system_user?: boolean } | undefined;
  return {
    userActive: row?.user_active === true,
    member: row?.member === true,
    systemUser: row?.system_user === true,
  };
}

/** Build a reader from the app's privileged `execute` (e.g. `withPrivilegedDb(db => db.execute(q))`). */
export function createSessionOrgAccessReader(execute: (query: SQL) => Promise<unknown>): ReadSessionOrgAccess {
  return async (userId, orgId) => parseSessionOrgAccess(await execute(sessionOrgAccessQuery(userId, orgId)));
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return value != null && Number.isInteger(n) && n > 0 ? n : null;
}

/** Throws UNAUTHORIZED when the session's user may no longer act in the session org. */
export async function assertSessionOrgMembership(
  ctx: { session?: { user?: unknown } | null; isApiKeyContext?: unknown },
  read: ReadSessionOrgAccess,
): Promise<void> {
  if (ctx.isApiKeyContext === true) return;
  const user = ctx.session?.user as { id?: unknown; currentOrgId?: unknown } | undefined;
  const userId = toPositiveInt(user?.id);
  const orgId = toPositiveInt(user?.currentOrgId);
  if (userId === null || orgId === null) return;

  const access = await read(userId, orgId);
  if (access.userActive && (access.member || access.systemUser)) return;

  console.error('[SECURITY] Refused a session whose user is no longer an active member of its org:', {
    userId,
    sessionOrgId: orgId,
    userActive: access.userActive,
  });
  throw new TRPCError({ code: 'UNAUTHORIZED', message: SESSION_ORG_ACCESS_ENDED_MESSAGE });
}

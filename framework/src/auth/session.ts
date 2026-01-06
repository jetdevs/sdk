/**
 * Session management helpers
 *
 * Wraps NextAuth session operations and hides implementation details
 */

import type { AuthAdapter, Session } from './types';

/**
 * Global auth adapter instance
 * This is set by the application during initialization
 * @internal
 */
let authAdapter: AuthAdapter | null = null;

/**
 * Configure the auth helpers with NextAuth adapter
 * This must be called once during application initialization
 *
 * @param adapter - Auth adapter with session management functions
 *
 * @example
 * ```typescript
 * // In your app initialization (e.g., src/server/auth.ts or src/app/api/auth/[...nextauth]/route.ts)
 * import { configureAuth } from '@jetdevs/framework/auth';
 * import { getServerSession } from 'next-auth';
 * import { authOptions } from './auth-options';
 * import { db } from '@/server/db';
 *
 * configureAuth({
 *   getSession: async () => {
 *     const session = await getServerSession(authOptions);
 *     return session as Session | null;
 *   },
 *   switchOrg: async (userId, newOrgId) => {
 *     await db.update(users).set({ currentOrgId: newOrgId }).where(eq(users.id, userId));
 *   },
 * });
 * ```
 */
export function configureAuth(adapter: AuthAdapter): void {
  if (authAdapter) {
    console.warn('[Framework] Auth already configured. Overwriting existing configuration.');
  }
  authAdapter = adapter;
}

/**
 * Get the current auth adapter
 * Throws if not configured
 * @internal
 */
function getAuthAdapter(): AuthAdapter {
  if (!authAdapter) {
    throw new Error(
      'Auth not configured. Call configureAuth() during app initialization.\n' +
      'Example:\n' +
      '  import { configureAuth } from \'@jetdevs/framework/auth\';\n' +
      '  import { getServerSession } from \'next-auth\';\n' +
      '  import { authOptions } from \'./auth-options\';\n' +
      '  configureAuth({\n' +
      '    getSession: async () => await getServerSession(authOptions),\n' +
      '    switchOrg: async (userId, newOrgId) => { /* implementation */ },\n' +
      '  });'
    );
  }
  return authAdapter;
}

/**
 * Get current authenticated session
 *
 * This wraps NextAuth's getServerSession and provides a clean API
 * @returns Current session or null if not authenticated
 *
 * @example
 * ```typescript
 * const session = await getSession();
 * if (!session) {
 *   throw new Error('Not authenticated');
 * }
 * console.log('User:', session.user.email);
 * ```
 */
export async function getSession(): Promise<Session | null> {
  const adapter = getAuthAdapter();
  return await adapter.getSession();
}

/**
 * Switch current organization for the user
 *
 * Updates the user's currentOrgId in the database and refreshes the session
 *
 * @param userId - User ID
 * @param newOrgId - Organization ID to switch to
 * @throws Error if user doesn't have access to the organization
 *
 * @example
 * ```typescript
 * const session = await getSession();
 * if (session) {
 *   await switchOrg(session.user.id, 5);
 *   // Database updated, session should be refreshed on next request
 * }
 * ```
 */
export async function switchOrg(
  userId: number,
  newOrgId: number
): Promise<void> {
  const adapter = getAuthAdapter();
  await adapter.switchOrg(userId, newOrgId);
}

/**
 * Require authentication wrapper for handlers
 *
 * @param handler - Handler function that requires authentication
 * @returns Wrapped handler that ensures session exists
 *
 * @example
 * ```typescript
 * const handler = requireAuth(async (session, request) => {
 *   // Session is guaranteed to exist
 *   return { userId: session.user.id };
 * });
 * ```
 */
export function requireAuth<TInput = unknown, TOutput = unknown>(
  handler: (session: Session, input: TInput) => Promise<TOutput>
): (input: TInput) => Promise<TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    const session = await getSession();

    if (!session) {
      throw new Error('Authentication required');
    }

    return handler(session, input);
  };
}

/**
 * Check if user is authenticated
 * Returns true if a valid session exists
 *
 * @example
 * ```typescript
 * if (await isAuthenticated()) {
 *   // User is logged in
 * }
 * ```
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Get current user from session
 * Throws if not authenticated
 *
 * @example
 * ```typescript
 * const user = await getCurrentUser();
 * console.log('User:', user.email);
 * ```
 */
export async function getCurrentUser() {
  const session = await getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  return session.user;
}

/**
 * Get current organization ID from session
 * Throws if not authenticated
 *
 * @example
 * ```typescript
 * const orgId = await getCurrentOrgId();
 * ```
 */
export async function getCurrentOrgId(): Promise<number> {
  const user = await getCurrentUser();
  return user.currentOrgId;
}

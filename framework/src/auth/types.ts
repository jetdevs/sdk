/**
 * Authentication types
 */

/**
 * User information from session
 */
export interface User {
  id: number;
  email: string;
  currentOrgId: number;
  permissions?: string[];
}

/**
 * Session object
 */
export interface Session {
  user: User;
  expires: string;
}

/**
 * Authentication context for handlers
 */
export interface AuthContext {
  session: Session;
  user: User;
}

/**
 * Auth adapter interface
 * Applications implement this to bridge the framework with their NextAuth setup
 */
export interface AuthAdapter {
  /**
   * Get current server-side session
   */
  getSession(): Promise<Session | null>;

  /**
   * Switch user's current organization
   * Should update the database and trigger session refresh
   */
  switchOrg(userId: number, newOrgId: number): Promise<void>;
}

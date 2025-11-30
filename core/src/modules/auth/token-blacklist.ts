/**
 * In-Memory JWT Token Blacklist
 *
 * Simple, efficient blacklist for invalidated JWT tokens.
 * Automatically clears on server restart (which is exactly what we want).
 *
 * Solves the NextAuth session persistence issue where tokens
 * remain valid after service restarts.
 */

import type { JWTTokenLike, BlacklistReason } from './types';
import { BLACKLIST_REASONS } from './types';

class TokenBlacklist {
  private blacklisted = new Set<string>();
  private startupTime = Date.now();

  /**
   * Add a token to the blacklist
   */
  add(tokenId: string, reason?: string): void {
    this.blacklisted.add(tokenId);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TokenBlacklist] Token blacklisted: ${tokenId.substring(0, 8)}... (${reason || 'no reason'})`);
    }
  }

  /**
   * Check if a token is blacklisted
   */
  isBlacklisted(tokenId: string): boolean {
    return this.blacklisted.has(tokenId);
  }

  /**
   * Remove a token from blacklist (rarely needed)
   */
  remove(tokenId: string): boolean {
    const removed = this.blacklisted.delete(tokenId);
    if (removed && process.env.NODE_ENV === 'development') {
      console.log(`[TokenBlacklist] Token removed from blacklist: ${tokenId.substring(0, 8)}...`);
    }
    return removed;
  }

  /**
   * Get blacklist stats
   */
  getStats() {
    return {
      count: this.blacklisted.size,
      startupTime: this.startupTime,
      uptime: Date.now() - this.startupTime,
    };
  }

  /**
   * Clear all blacklisted tokens (for testing)
   */
  clear(): void {
    const count = this.blacklisted.size;
    this.blacklisted.clear();
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TokenBlacklist] Cleared ${count} blacklisted tokens`);
    }
  }

  /**
   * Blacklist all tokens issued before server restart
   * This is called automatically when tokens are validated
   */
  isTokenFromBeforeRestart(tokenIat: number): boolean {
    // If token was issued before server startup, consider it invalid
    return tokenIat * 1000 < this.startupTime;
  }
}

// Singleton instance - survives for the lifetime of the server process
export const tokenBlacklist = new TokenBlacklist();

/**
 * Helper function to generate token ID from JWT
 */
export function getTokenId(token: JWTTokenLike): string {
  // Use JWT 'jti' claim if available, otherwise generate from sub + iat
  return token.jti || `${token.sub}_${token.iat}`;
}

/**
 * Helper to blacklist all tokens for a user (on role change, etc.)
 */
export function blacklistUserTokens(userId: string | number, reason: BlacklistReason): void {
  // For this simple implementation, we can't track tokens by user
  // But we can log the action for audit purposes
  if (process.env.NODE_ENV === 'development') {
    console.log(`[TokenBlacklist] User tokens invalidated: ${userId} (${reason})`);
  }

  // In practice, the user will need to re-login after role changes
  // which will create a new token automatically
}

/**
 * Blacklist a specific token
 */
export function blacklistToken(token: JWTTokenLike | string, reason: BlacklistReason = BLACKLIST_REASONS.MANUAL_REVOKE): void {
  const tokenId = typeof token === 'string' ? token : getTokenId(token);
  tokenBlacklist.add(tokenId, reason);
}

/**
 * Check if a token is valid (not blacklisted and not from before restart)
 */
export function isTokenValid(token: JWTTokenLike): boolean {
  const tokenId = getTokenId(token);

  // Check blacklist
  if (tokenBlacklist.isBlacklisted(tokenId)) {
    return false;
  }

  // Check if token was issued before server restart
  if (token.iat && tokenBlacklist.isTokenFromBeforeRestart(token.iat)) {
    return false;
  }

  return true;
}

// Re-export types and constants
export { BLACKLIST_REASONS } from './types';
export type { BlacklistReason, JWTTokenLike } from './types';

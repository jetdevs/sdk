/**
 * Invite tokens (P4): 32 random bytes, base64url. Only the sha256 hex is stored.
 */
import { randomBytes } from 'node:crypto';

import { hashAccessToken } from '../access/service';

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return hashAccessToken(token);
}

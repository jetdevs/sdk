/**
 * Invites module (p131): Connect-owned org invites — store, tokens, service.
 * Only IdPs (each Connect instance) import it; brand/TTL/mail/gate come
 * from the factory config.
 *
 * @module @jetdevs/core/invites
 */
export { orgInvites } from './schema';
export { inviteTablesDdl, usersEmailVerifiedAtDdl } from './sql/invites-ddl';
export { generateInviteToken, hashInviteToken } from './token';
export { createDrizzleInviteStore } from './store';
export type { InviteDb, InviteStore, NewInviteRow, RotatePatch } from './store';
export { createInviteService, InviteError, inviteAccessTag, toPublicInvite } from './service';
export type { CreateInviteServiceOptions, InviteService } from './service';
export * from './schemas';
export * from './types';

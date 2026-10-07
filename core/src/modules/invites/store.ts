/**
 * Invite persistence (p131 INV-001). The service talks to this interface so
 * unit tests inject an in-memory fake; `createDrizzleInviteStore()` is the real
 * implementation. Every write that changes status is ONE conditional UPDATE
 * guarded on `status = 'pending'` (and `token_hash` for accept — P13/P22), so
 * accept racing resend or cancel lets exactly one win.
 */
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

import { orgInvites } from './schema';
import type { InviteCaller, OrgInvite } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InviteDb = PgDatabase<any, any, any>;

export interface NewInviteRow {
  orgId: number;
  email: string;
  roleRef: string;
  roleName: string;
  invitedBySub: string;
  invitedByName: string | null;
  clientId: string;
  sourceSystem: string;
  appUrl: string;
  tokenHash: string;
  accessCodeId: number | null;
  expiresAt: Date;
}

export interface RotatePatch {
  tokenHash: string;
  expiresAt: Date;
  accessCodeId: number | null;
  roleRef?: string;
  roleName?: string;
  invitedBySub?: string;
  invitedByName?: string | null;
  appUrl?: string;
}

export interface InviteStore {
  transaction<T>(db: InviteDb, fn: (tx: InviteDb) => Promise<T>): Promise<T>;
  findOpen(db: InviteDb, orgId: number, email: string): Promise<OrgInvite | null>;
  insert(db: InviteDb, row: NewInviteRow): Promise<OrgInvite>;
  /** Rotate token/expiry on a still-pending row; null when it is no longer pending. */
  rotate(db: InviteDb, id: number, patch: RotatePatch): Promise<OrgInvite | null>;
  getById(db: InviteDb, id: number): Promise<OrgInvite | null>;
  getByTokenHash(db: InviteDb, tokenHash: string): Promise<OrgInvite | null>;
  /** pending → expired when `expires_at <= now`; null when nothing changed. */
  markExpired(db: InviteDb, id: number, now: Date): Promise<OrgInvite | null>;
  /** pending → cancelled; null when it was not pending. */
  cancel(db: InviteDb, id: number, now: Date): Promise<OrgInvite | null>;
  listByOrg(db: InviteDb, orgId: number, caller: InviteCaller): Promise<OrgInvite[]>;
  /**
   * The P13 guard: `UPDATE … WHERE id AND token_hash AND status='pending' AND
   * expires_at > now`. Null = 0 rows = nothing written.
   */
  acceptConditional(
    db: InviteDb,
    input: { id: number; tokenHash: string; userId: number; now: Date },
  ): Promise<OrgInvite | null>;
}

function first<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function createDrizzleInviteStore(): InviteStore {
  const cast = (rows: unknown[]) => rows as OrgInvite[];
  return {
    transaction: (db, fn) => db.transaction((tx) => fn(tx as unknown as InviteDb)),
    async findOpen(db, orgId, email) {
      return first(
        cast(
          await db
            .select()
            .from(orgInvites)
            .where(and(eq(orgInvites.orgId, orgId), eq(orgInvites.email, email), eq(orgInvites.status, 'pending')))
            .limit(1),
        ),
      );
    },
    async insert(db, row) {
      return cast(await db.insert(orgInvites).values(row).returning())[0]!;
    },
    async rotate(db, id, patch) {
      const set: Record<string, unknown> = {
        tokenHash: patch.tokenHash,
        expiresAt: patch.expiresAt,
        accessCodeId: patch.accessCodeId,
      };
      for (const k of ['roleRef', 'roleName', 'invitedBySub', 'invitedByName', 'appUrl'] as const) {
        if (patch[k] !== undefined) set[k] = patch[k];
      }
      return first(
        cast(
          await db
            .update(orgInvites)
            .set(set)
            .where(and(eq(orgInvites.id, id), eq(orgInvites.status, 'pending')))
            .returning(),
        ),
      );
    },
    async getById(db, id) {
      return first(cast(await db.select().from(orgInvites).where(eq(orgInvites.id, id)).limit(1)));
    },
    async getByTokenHash(db, tokenHash) {
      return first(cast(await db.select().from(orgInvites).where(eq(orgInvites.tokenHash, tokenHash)).limit(1)));
    },
    async markExpired(db, id, now) {
      return first(
        cast(
          await db
            .update(orgInvites)
            .set({ status: 'expired' })
            .where(and(eq(orgInvites.id, id), eq(orgInvites.status, 'pending'), lte(orgInvites.expiresAt, now)))
            .returning(),
        ),
      );
    },
    async cancel(db, id, now) {
      return first(
        cast(
          await db
            .update(orgInvites)
            .set({ status: 'cancelled', cancelledAt: now })
            .where(and(eq(orgInvites.id, id), eq(orgInvites.status, 'pending')))
            .returning(),
        ),
      );
    },
    async listByOrg(db, orgId, caller) {
      return cast(
        await db
          .select()
          .from(orgInvites)
          .where(
            and(
              eq(orgInvites.orgId, orgId),
              eq(orgInvites.clientId, caller.clientId),
              eq(orgInvites.sourceSystem, caller.sourceSystem),
            ),
          )
          .orderBy(asc(orgInvites.id)),
      );
    },
    async acceptConditional(db, { id, tokenHash, userId, now }) {
      return first(
        cast(
          await db
            .update(orgInvites)
            .set({ status: 'accepted', acceptedAt: now, acceptedUserId: userId, provisionState: 'pending' })
            .where(
              and(
                eq(orgInvites.id, id),
                eq(orgInvites.tokenHash, tokenHash),
                eq(orgInvites.status, 'pending'),
                gt(orgInvites.expiresAt, sql`now()`),
              ),
            )
            .returning(),
        ),
      );
    },
  };
}

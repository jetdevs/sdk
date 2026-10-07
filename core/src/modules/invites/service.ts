/**
 * Invite service (p131 INV-001, specs D1/D2, implementation.md P4/P8/P13/P21/P22).
 *
 * Connect-owned: an invite writes ONLY `org_invites` (+ an optional p107 access
 * code) — never a users or org_members row (I2). The module carries no brand,
 * TTL, sender or gate constants: all come from the factory config (I4).
 *
 * Ordering (P22): token rotation commits first, then the email is sent; a mail
 * failure returns `emailSent: false` and leaves the invite pending.
 */
import { createDrizzleInviteStore, type InviteDb, type InviteStore } from './store';
import { generateInviteToken, hashInviteToken } from './token';
import type {
  CreateInviteInput,
  CreateInviteResult,
  DescribeOrg,
  InviteAccessGate,
  InviteCaller,
  InviteLookup,
  OrgInvite,
  PublicInvite,
  ResolveOrg,
  SendInviteEmail,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export class InviteError extends Error {
  constructor(
    readonly reason: 'not_found' | 'not_pending' | 'not_acceptable' | 'conflict' | 'org_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

export interface CreateInviteServiceOptions {
  /** Days until an invite expires (Q3: 7). Required — no module default (I4). */
  ttlDays: number;
  /** Builds the accept link from the raw token, e.g. `${issuer}/invite/${token}`. */
  acceptUrl: (token: string) => string;
  resolveOrg: ResolveOrg;
  /** Reverse lookup for resend: Connect org id → { sourceOrgRef, orgName } for the caller's source system. */
  describeOrg: DescribeOrg;
  sendInviteEmail: SendInviteEmail;
  /** p107 gate (P8); absent on IdPs without access codes (an IdP without p107). */
  accessGate?: InviteAccessGate;
  now?: () => Date;
  store?: InviteStore;
  /** Optional error sink — never receives the raw token. */
  onError?: (event: string, err: unknown, meta: { inviteId?: number }) => void;
}

export function toPublicInvite(row: OrgInvite): PublicInvite {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tokenHash: _omit, ...rest } = row;
  return rest;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function owns(row: OrgInvite | null, caller: InviteCaller): row is OrgInvite {
  return !!row && row.clientId === caller.clientId && row.sourceSystem === caller.sourceSystem;
}

export function inviteAccessTag(sourceOrgRef: string): string {
  return `org-invite:${sourceOrgRef}`;
}

export function createInviteService(options: CreateInviteServiceOptions) {
  if (!Number.isFinite(options.ttlDays) || options.ttlDays <= 0) {
    throw new Error('createInviteService: ttlDays must be a positive number');
  }
  const now = options.now ?? (() => new Date());
  const store = options.store ?? createDrizzleInviteStore();
  const gate = options.accessGate;
  const ttlMs = options.ttlDays * DAY_MS;
  const report = (event: string, err: unknown, meta: { inviteId?: number }) => options.onError?.(event, err, meta);

  async function issueCode(tx: InviteDb, email: string, expiresAt: Date, sourceOrgRef: string) {
    if (!gate) return null;
    const code = await gate.createCode(tx as never, {
      kind: 'single_use',
      boundEmail: email,
      maxUses: 1,
      expiresAt,
      tag: inviteAccessTag(sourceOrgRef),
    });
    return code.id;
  }

  async function dropCode(tx: InviteDb, codeId: number | null) {
    if (gate && codeId != null) await gate.revokeCode(tx as never, codeId);
  }

  async function mail(row: OrgInvite, token: string, orgName: string): Promise<boolean> {
    try {
      await options.sendInviteEmail({
        to: row.email,
        variables: {
          org_name: orgName,
          inviter_name: row.invitedByName ?? '',
          accept_url: options.acceptUrl(token),
          expires_at: row.expiresAt.toISOString(),
        },
      });
      return true;
    } catch (err) {
      report('invite_email_failed', err, { inviteId: row.id });
      return false;
    }
  }

  /**
   * Create an invite. A second create for an open (pending, unexpired) invite
   * of the same email+org SUPERSEDES it: same row id, role updated, token
   * rotated, expiry restarted (P22). Never a second pending row.
   */
  async function create(db: InviteDb, caller: InviteCaller, input: CreateInviteInput): Promise<CreateInviteResult> {
    const email = normEmail(input.email);
    const org = await options.resolveOrg(db, {
      sourceSystem: caller.sourceSystem,
      sourceOrgRef: input.sourceOrgRef,
      orgName: input.orgName,
      create: true,
    });
    if (!org) throw new InviteError('org_not_found', `no org for ${input.sourceOrgRef}`);

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const t = now();
    const expiresAt = new Date(t.getTime() + ttlMs);

    const { row, superseded } = await store.transaction(db, async (tx) => {
      let open = await store.findOpen(tx, org.orgId, email);
      if (open && open.expiresAt.getTime() <= t.getTime()) {
        await store.markExpired(tx, open.id, t);
        await dropCode(tx, open.accessCodeId);
        open = null;
      }
      if (open && !owns(open, caller)) {
        throw new InviteError('conflict', 'an open invite for this email belongs to another client');
      }
      if (open) {
        await dropCode(tx, open.accessCodeId);
        const accessCodeId = await issueCode(tx, email, expiresAt, input.sourceOrgRef);
        const rotated = await store.rotate(tx, open.id, {
          tokenHash,
          expiresAt,
          accessCodeId,
          roleRef: input.roleRef,
          roleName: input.roleName,
          invitedBySub: input.invitedBySub,
          invitedByName: input.invitedByName ?? null,
          appUrl: input.appUrl,
        });
        if (!rotated) throw new InviteError('not_pending', `invite ${open.id} is no longer pending`);
        return { row: rotated, superseded: true };
      }
      const accessCodeId = await issueCode(tx, email, expiresAt, input.sourceOrgRef);
      const inserted = await store.insert(tx, {
        orgId: org.orgId,
        email,
        roleRef: input.roleRef,
        roleName: input.roleName,
        invitedBySub: input.invitedBySub,
        invitedByName: input.invitedByName ?? null,
        clientId: caller.clientId,
        sourceSystem: caller.sourceSystem,
        appUrl: input.appUrl,
        tokenHash,
        accessCodeId,
        expiresAt,
      });
      return { row: inserted, superseded: false };
    });

    const emailSent = await mail(row, token, org.orgName);
    return { invite: toPublicInvite(row), token, superseded, emailSent, connectOrgId: org.orgId };
  }

  /** Invites of one source org, visible only to the caller that created them (P21). */
  async function list(db: InviteDb, caller: InviteCaller, sourceOrgRef: string): Promise<PublicInvite[]> {
    const org = await options.resolveOrg(db, { sourceSystem: caller.sourceSystem, sourceOrgRef, create: false });
    if (!org) return [];
    const rows = await store.listByOrg(db, org.orgId, caller);
    const t = now().getTime();
    return rows.map((r) =>
      toPublicInvite(r.status === 'pending' && r.expiresAt.getTime() <= t ? { ...r, status: 'expired' } : r),
    );
  }

  /**
   * Caller-owned AND org-scoped: the row must belong to the caller's client +
   * source system AND to the org named by `sourceOrgRef`. A row in another org
   * answers exactly like a foreign id (`not_found`) — no existence oracle.
   */
  async function ownedPending(
    db: InviteDb,
    caller: InviteCaller,
    id: number,
    sourceOrgRef: string,
  ): Promise<OrgInvite> {
    const org = await options.resolveOrg(db, { sourceSystem: caller.sourceSystem, sourceOrgRef, create: false });
    const row = await store.getById(db, id);
    if (!org || !owns(row, caller) || row.orgId !== org.orgId) {
      throw new InviteError('not_found', `invite ${id} not found`);
    }
    if (row.status !== 'pending') throw new InviteError('not_pending', `invite ${id} is ${row.status}`);
    return row;
  }

  /**
   * Resend = new token, expiry restarted, old link dead (Q3, P4). Allowed on a
   * pending invite even if its clock ran out (the resend restarts it).
   */
  async function resend(
    db: InviteDb,
    caller: InviteCaller,
    id: number,
    sourceOrgRef: string,
  ): Promise<Omit<CreateInviteResult, 'superseded' | 'connectOrgId'>> {
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(now().getTime() + ttlMs);
    const row = await store.transaction(db, async (tx) => {
      const cur = await ownedPending(tx, caller, id, sourceOrgRef);
      await dropCode(tx, cur.accessCodeId);
      let accessCodeId: number | null = null;
      if (gate) {
        const org = await options.describeOrg(tx, { orgId: cur.orgId, sourceSystem: caller.sourceSystem });
        if (org) accessCodeId = await issueCode(tx, cur.email, expiresAt, org.sourceOrgRef);
      }
      const rotated = await store.rotate(tx, id, { tokenHash, expiresAt, accessCodeId });
      if (!rotated) throw new InviteError('not_pending', `invite ${id} is no longer pending`);
      return rotated;
    });
    const org = await options.describeOrg(db, { orgId: row.orgId, sourceSystem: caller.sourceSystem });
    const emailSent = await mail(row, token, org?.orgName ?? '');
    return { invite: toPublicInvite(row), token, emailSent };
  }

  async function cancel(db: InviteDb, caller: InviteCaller, id: number, sourceOrgRef: string): Promise<PublicInvite> {
    return store.transaction(db, async (tx) => {
      const cur = await ownedPending(tx, caller, id, sourceOrgRef);
      const row = await store.cancel(tx, id, now());
      if (!row) throw new InviteError('not_pending', `invite ${id} is no longer pending`);
      await dropCode(tx, cur.accessCodeId);
      return toPublicInvite(row);
    });
  }

  /** D10: removal cancels the open invite for that email+org (caller-scoped). */
  async function cancelByEmail(
    db: InviteDb,
    caller: InviteCaller,
    input: { sourceOrgRef: string; email: string },
  ): Promise<{ cancelled: number }> {
    const org = await options.resolveOrg(db, {
      sourceSystem: caller.sourceSystem,
      sourceOrgRef: input.sourceOrgRef,
      create: false,
    });
    if (!org) return { cancelled: 0 };
    return store.transaction(db, async (tx) => {
      const open = await store.findOpen(tx, org.orgId, normEmail(input.email));
      if (!owns(open, caller)) return { cancelled: 0 };
      const row = await store.cancel(tx, open.id, now());
      if (!row) return { cancelled: 0 };
      await dropCode(tx, open.accessCodeId);
      return { cancelled: 1 };
    });
  }

  /** pending | accepted | cancelled | expired; an expired pending row is stored as expired. */
  async function getByToken(db: InviteDb, token: string): Promise<InviteLookup> {
    if (!token) return { status: 'not_found' };
    const row = await store.getByTokenHash(db, hashInviteToken(token));
    if (!row) return { status: 'not_found' };
    const t = now();
    if (row.status === 'pending' && row.expiresAt.getTime() <= t.getTime()) {
      const expired = await store.markExpired(db, row.id, t);
      if (expired) await dropCode(db, row.accessCodeId);
      return { status: 'expired', invite: toPublicInvite(expired ?? { ...row, status: 'expired' }) };
    }
    return { status: row.status, invite: toPublicInvite(row) };
  }

  /**
   * Single-use accept inside the caller's account transaction (P13). The raw
   * token is re-validated by the conditional UPDATE (P20) — 0 rows throws and
   * the caller's tx rolls back, so nothing else is written.
   *
   * `email` is the accepting account's email and MUST match the invited
   * address (case/whitespace-insensitive); a forwarded link cannot be accepted
   * by a different account — mismatch → `not_acceptable`, invite stays pending.
   */
  async function accept(
    tx: InviteDb,
    input: { inviteId: number; token: string; userId: number; email: string },
  ): Promise<PublicInvite> {
    if (typeof input.email !== 'string' || !input.email.trim()) {
      throw new InviteError('not_acceptable', `invite ${input.inviteId} cannot be accepted`);
    }
    const row = await store.acceptConditional(tx, {
      id: input.inviteId,
      tokenHash: hashInviteToken(input.token),
      userId: input.userId,
      email: normEmail(input.email),
      now: now(),
    });
    if (!row) throw new InviteError('not_acceptable', `invite ${input.inviteId} cannot be accepted`);
    return toPublicInvite(row);
  }

  return { create, list, resend, cancel, cancelByEmail, getByToken, accept };
}

export type InviteService = ReturnType<typeof createInviteService>;
